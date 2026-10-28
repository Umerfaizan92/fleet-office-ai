import {deliverInvitation} from './invitation-delivery.js';
import crypto from 'node:crypto';
import {z} from 'zod';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function installTeamAccounts(app,{db,requireSaasUser,requireSaasRole,authLimiter,passwordHash,validTotp,saasAudit,sendVerification,env={}}){
 db.exec(`CREATE TABLE IF NOT EXISTS team_account_invites (
 id TEXT PRIMARY KEY,organisation_id TEXT NOT NULL REFERENCES organisations(id),worker_id TEXT NOT NULL REFERENCES workers(id),
 invited_email TEXT NOT NULL,role TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,created_by TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',expires_at TEXT NOT NULL,created_at TEXT NOT NULL,accepted_by TEXT,accepted_at TEXT);
 CREATE INDEX IF NOT EXISTS idx_team_invites_org ON team_account_invites(organisation_id,status);
 CREATE TABLE IF NOT EXISTS team_invite_verifications(invite_id TEXT PRIMARY KEY REFERENCES team_account_invites(id),code_hash TEXT NOT NULL,expires_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,sent_at TEXT NOT NULL);`);
 const owner=[requireSaasUser,requireSaasRole('owner')];
 const identity=z.object({token:z.string().min(40).max(100),email:z.string().trim().email().max(254).transform(x=>x.toLowerCase())});
 const pending=(token,email)=>db.prepare(`SELECT i.*,o.name organisation_name FROM team_account_invites i JOIN organisations o ON o.id=i.organisation_id WHERE i.token_hash=? AND i.invited_email=? AND i.status='pending' AND i.expires_at>?`).get(hash(token),email,new Date().toISOString());
 app.get('/api/saas/team-accounts',...owner,(req,res)=>{
  const members=db.prepare(`SELECT u.id,u.full_name,u.email,m.role,w.id worker_id,w.role_title,w.status FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN workers w ON w.user_id=u.id AND w.organisation_id=m.organisation_id WHERE m.organisation_id=? ORDER BY u.full_name`).all(req.saas.organisation_id);
  const invitations=db.prepare(`SELECT id,worker_id,invited_email,role,status,expires_at,created_at FROM team_account_invites WHERE organisation_id=? ORDER BY created_at DESC LIMIT 100`).all(req.saas.organisation_id);
  res.json({ok:true,members,invitations});
 });
 app.post('/api/saas/team-accounts/invitations',...owner,async(req,res)=>{
  const parsed=z.object({worker_id:z.string().uuid(),email:z.string().trim().email().max(254).transform(x=>x.toLowerCase()),role:z.enum(['admin','manager','employee','contractor']),send:z.boolean().default(false),phone:z.string().trim().max(30).optional(),message:z.string().trim().max(300).optional()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,error:'Choose a worker, valid email and staff role.'});
  const input=parsed.data,org=req.saas.organisation_id,worker=db.prepare('SELECT * FROM workers WHERE id=? AND organisation_id=?').get(input.worker_id,org);
  if(!worker)return res.status(404).json({ok:false,error:'Worker not found.'});
  if(worker.user_id&&db.prepare('SELECT 1 FROM memberships WHERE organisation_id=? AND user_id=?').get(org,worker.user_id))return res.status(409).json({ok:false,error:'This worker already has business access.'});
  const id=crypto.randomUUID(),token=crypto.randomBytes(32).toString('base64url'),now=new Date().toISOString(),expires=new Date(Date.now()+48*3600000).toISOString();
  db.transaction(()=>{
   db.prepare("UPDATE team_account_invites SET status='revoked' WHERE organisation_id=? AND worker_id=? AND status='pending'").run(org,worker.id);
   db.prepare('INSERT INTO team_account_invites (id,organisation_id,worker_id,invited_email,role,token_hash,created_by,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id,org,worker.id,input.email,input.role,hash(token),req.saas.user_id,expires,now);
   saasAudit(req,'team.invitation_created','worker',worker.id,{invite_id:id,role:input.role});
  })();
  const invitePath='/saas/join-team.html#'+token;
  const delivery=input.send?await deliverInvitation(env,{organisationId:org,userId:req.saas.user_id,email:input.email,phone:input.phone,businessName:req.saas.organisation_name,heading:'Join your business team',url:String(env.PUBLIC_BASE_URL||'').replace(/\/$/,'')+invitePath,message:input.message,category:'team_invitation'}):{sent:false};
  res.status(201).json({ok:true,id,expires_at:expires,invite_path:invitePath,delivery,note:input.send?`Invitation created. Email: ${delivery.email.sent?'accepted by provider':delivery.email.reason}. SMS: ${delivery.sms.sent?'accepted by provider':delivery.sms.reason}. Check Notifications for delivery confirmation.`:'Share this private, single-use link with the named invitee. No email has been sent.'});
 });
 app.delete('/api/saas/team-accounts/invitations/:id',...owner,(req,res)=>{
  db.transaction(()=>{
   const changed=db.prepare("UPDATE team_account_invites SET status='revoked' WHERE id=? AND organisation_id=? AND status='pending'").run(req.params.id,req.saas.organisation_id).changes;
   if(!changed)return res.status(404).json({ok:false,error:'Pending invitation not found.'});
   saasAudit(req,'team.invitation_revoked','team_invite',req.params.id);res.json({ok:true});
  })();
 });
 app.patch('/api/saas/team-accounts/members/:id/role',...owner,(req,res)=>{
  const parsed=z.object({role:z.enum(['admin','manager','employee','contractor'])}).strict().safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,error:'Choose a valid staff role.'});
  const org=req.saas.organisation_id,member=db.prepare('SELECT role FROM memberships WHERE organisation_id=? AND user_id=?').get(org,req.params.id);
  if(!member)return res.status(404).json({ok:false,error:'Member not found.'});
  if(member.role==='owner')return res.status(409).json({ok:false,error:'Owner authority cannot be changed here.'});
  db.transaction(()=>{
   db.prepare('UPDATE memberships SET role=? WHERE organisation_id=? AND user_id=?').run(parsed.data.role,org,req.params.id);
   saasAudit(req,'team.role_authorised','user',req.params.id,{previous_role:member.role,role:parsed.data.role});
  })();
  res.json({ok:true,role:parsed.data.role,note:'Role authorised. Permissions apply to the next request; refresh the employee workspace to update its navigation.'});
 });
 app.delete('/api/saas/team-accounts/members/:id',...owner,(req,res)=>{
  const org=req.saas.organisation_id,member=db.prepare('SELECT role FROM memberships WHERE organisation_id=? AND user_id=?').get(org,req.params.id);
  if(!member)return res.status(404).json({ok:false,error:'Member not found.'});
  if(member.role==='owner')return res.status(409).json({ok:false,error:'Owner access cannot be revoked here.'});
  db.transaction(()=>{
   db.prepare('DELETE FROM staff_access_policies WHERE organisation_id=? AND user_id=?').run(org,req.params.id);
   db.prepare('DELETE FROM memberships WHERE organisation_id=? AND user_id=?').run(org,req.params.id);
   db.prepare("UPDATE workers SET status='inactive',approved_for_scheduling=0,updated_at=? WHERE organisation_id=? AND user_id=?").run(new Date().toISOString(),org,req.params.id);
   db.prepare("UPDATE team_account_invites SET status='revoked' WHERE organisation_id=? AND status='pending' AND worker_id IN (SELECT id FROM workers WHERE organisation_id=? AND user_id=?)").run(org,org,req.params.id);
   saasAudit(req,'team.access_revoked','user',req.params.id,{role:member.role});
  })();res.json({ok:true,note:'Business access removed. History and other business memberships are preserved.'});
 });
 app.post('/api/saas/team-accounts/verify-email',authLimiter,async(req,res)=>{
  const parsed=identity.safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Enter your invitation and invited email.'});
  const invite=pending(parsed.data.token,parsed.data.email);if(!invite)return res.status(400).json({ok:false,error:'Invitation is invalid, expired or revoked.'});
  const previous=db.prepare('SELECT sent_at FROM team_invite_verifications WHERE invite_id=?').get(invite.id);
  if(previous&&Date.now()-Date.parse(previous.sent_at)<60000)return res.status(429).json({ok:false,error:'Wait one minute before requesting another code.'});
  const code=String(crypto.randomInt(100000,1000000)),codeHash=hash(invite.id+':'+code),now=new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO team_invite_verifications (invite_id,code_hash,expires_at,attempts,sent_at) VALUES (?,?,?,0,?)').run(invite.id,codeHash,new Date(Date.now()+600000).toISOString(),now);
  const delivery=await sendVerification({to:invite.invited_email,code,businessName:invite.organisation_name}).catch(()=>({sent:false}));
  if(!delivery?.sent){db.prepare('DELETE FROM team_invite_verifications WHERE invite_id=? AND code_hash=?').run(invite.id,codeHash);return res.status(503).json({ok:false,error:'Verification email could not be delivered. Ask the business owner to check the email provider.'});}
  res.json({ok:true,note:'Verification code sent to your invited email.'});
 });
 app.post('/api/saas/team-accounts/accept',authLimiter,(req,res)=>{
  const parsed=identity.extend({password:z.string().min(1).max(200),email_code:z.string().regex(/^\d{6}$/).optional(),mfa_code:z.string().regex(/^\d{6}$/).optional(),consent:z.literal(true)}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,error:'Check your details and accept the terms and privacy notice.'});
  const input=parsed.data,invite=pending(input.token,input.email);if(!invite)return res.status(400).json({ok:false,error:'Invitation is invalid, expired or revoked.'});
  const existing=db.prepare('SELECT * FROM users WHERE lower(email)=?').get(input.email),now=new Date().toISOString();
  if(existing){
   if(existing.status!=='active'||(existing.locked_until&&existing.locked_until>now))return res.status(403).json({ok:false,error:'This account is unavailable or temporarily locked.'});
   if(!equal(passwordHash(input.password,existing.password_salt),existing.password_hash)||(existing.mfa_enabled&&(!input.mfa_code||!validTotp(existing.mfa_secret,input.mfa_code)))){
    const attempts=Number(existing.failed_login_attempts||0)+1;db.prepare('UPDATE users SET failed_login_attempts=?,locked_until=?,updated_at=? WHERE id=?').run(attempts,attempts>=5?new Date(Date.now()+900000).toISOString():null,now,existing.id);
    return res.status(401).json({ok:false,error:'Use your existing account password and authenticator code if enabled.'});
   }
  }else if(input.password.length<14)return res.status(400).json({ok:false,error:'New accounts require a password of at least 14 characters.'});
  if(!existing?.email_verified){
   const verification=db.prepare('SELECT * FROM team_invite_verifications WHERE invite_id=?').get(invite.id);
   if(!verification||verification.expires_at<=now||verification.attempts>=5)return res.status(400).json({ok:false,error:'Request a new email verification code.'});
   if(!input.email_code||!equal(hash(invite.id+':'+input.email_code),verification.code_hash)){db.prepare('UPDATE team_invite_verifications SET attempts=attempts+1 WHERE invite_id=?').run(invite.id);return res.status(400).json({ok:false,error:'Email verification code is incorrect.'});}
  }
  const userId=existing?.id||crypto.randomUUID();
  const accepted=db.transaction(()=>{
   if(!pending(input.token,input.email))return false;
   const worker=db.prepare('SELECT * FROM workers WHERE id=? AND organisation_id=?').get(invite.worker_id,invite.organisation_id);
   if(!worker||(worker.user_id&&worker.user_id!==userId)||db.prepare('SELECT 1 FROM memberships WHERE organisation_id=? AND user_id=?').get(invite.organisation_id,userId))return false;
   if(!existing){const salt=crypto.randomBytes(16).toString('hex');db.prepare('INSERT INTO users(id,email,full_name,password_hash,password_salt,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)').run(userId,input.email,worker.full_name,passwordHash(input.password,salt),salt,now,now);}
   db.prepare('INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,?,?)').run(invite.organisation_id,userId,invite.role,now);
   db.prepare("UPDATE workers SET user_id=?,email=?,status='onboarding',approved_for_scheduling=0,updated_at=? WHERE id=? AND organisation_id=?").run(userId,input.email,now,worker.id,invite.organisation_id);
   db.prepare("UPDATE team_account_invites SET status='accepted',accepted_by=?,accepted_at=? WHERE id=?").run(userId,now,invite.id);
   db.prepare('DELETE FROM team_invite_verifications WHERE invite_id=?').run(invite.id);
   db.prepare('UPDATE users SET email_verified=1,failed_login_attempts=0,locked_until=NULL,updated_at=? WHERE id=?').run(now,userId);
   req.saas={organisation_id:invite.organisation_id,user_id:userId,role:invite.role};
   saasAudit(req,'team.invitation_accepted','worker',worker.id,{invite_id:invite.id,role:invite.role,terms_path:'/saas/terms.html',privacy_path:'/saas/privacy.html'});return true;
  }).immediate();
  if(!accepted)return res.status(409).json({ok:false,error:'Invitation no longer available or worker already linked. Ask the business owner to review access.'});
  res.status(201).json({ok:true,note:'Business access created. Sign in with your own account. Work compliance still requires separate review.'});
 });
}
