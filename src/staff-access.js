import {z} from 'zod';
const SENIOR=['owner','admin','manager','super_admin','director'],FINANCE=['owner','admin','super_admin'];
const ALL=['owner','admin','manager','super_admin','director','employee','worker','contractor'];
export const ACCESS_FEATURES=[
 ['dashboard','Home & command centre',ALL,['read']],
 ['customers','Business customer directory',SENIOR,['read','create','edit','delete']],
 ['jobs','Jobs & dispatch (assignment scope retained)',ALL,['read','create','edit','approve','delete']],
 ['workforce','Workers & compliance (identity scope retained)',ALL,['read','create','edit','approve','delete']],
 ['staff_chat','Internal staff chat & own availability',ALL,['read','create','edit']],
 ['ai','Business AI operations (personal history)',SENIOR,['read','create','edit','delete']],
 ['stock','Stock & supplies',SENIOR,['read','create','edit','delete']],
 ['mail','Email centre (separate approval and send permissions)',SENIOR,['read','create','edit','approve','send','delete','export']],
 ['inbox','Business communications inbox',SENIOR,['read','create','edit','approve','delete']],
 ['content','Content studio',SENIOR,['read','create','edit','approve','delete']],
 ['growth','Growth Engine',SENIOR,['read','create','edit','approve','delete']],
 ['visibility','Search & AI visibility',SENIOR,['read','create','edit','approve','delete']],
 ['integrations','Connection readiness (owner-only secrets remain protected)',SENIOR,['read','create','edit','delete']],
 ['finance','Finance & customer payments',FINANCE,['read','create','edit','approve','delete']],
 ['approvals','Task approvals (scope retained)',ALL,['read','create','edit','approve']],
 ['settings','Business setup & branding',SENIOR,['read','create','edit']],
 ['hiring','Private hiring workspace',['owner','admin'],['read','create','edit','approve','delete']],
 ['governance','Trust & personal activity',ALL,['read']],
 ['billing','Business subscription',['owner','admin','super_admin'],['read']]
].map(([id,label,roles,actions])=>({id,label,roles,actions}));
const keys=ACCESS_FEATURES.flatMap(f=>f.actions.map(a=>f.id+'.'+a)),valid=new Set(keys);
// Field roles (workers and contractors) can never be given business-wide customer, money, hiring, setup or messaging access,
// even by a custom grant. Job and workforce access stays limited to their own assignments and their own record.
export const FIELD_ROLES=['worker','contractor'];
export const FIELD_FEATURES=['dashboard','jobs','workforce','staff_chat','approvals','governance'];
const fieldAllowed=(role,key)=>!FIELD_ROLES.includes(String(role||'').toLowerCase())||FIELD_FEATURES.includes(String(key).split('.')[0]);
export function withinRoleCeiling(role,grants){return grants.filter(k=>fieldAllowed(role,k))}
const utility=new Set(['me','logout','login','account','mfa','legal','my-organisations','business','staff-presence','notifications','notification-preferences','announcements','releases','health','access']);
const area={'business-hub':'customers','business-archive':'customers','service-requests':'settings','receptionist-profile':'settings',mail:'mail','support-access':'governance',dashboard:'dashboard','command-centre':'dashboard',customers:'customers',stock:'stock','work-orders':'jobs','job-offers':'jobs','job-media':'jobs',workers:'workforce','staff-chat':'staff_chat','staff-availability':'staff_chat',ai:'ai',voice:'ai',content:'content',media:'content','video-renders':'content',growth:'growth',seo:'visibility',comms:'inbox',finance:'finance',payments:'finance',approvals:'approvals',integrations:'integrations','platform-capabilities':'integrations',onboarding:'settings',branding:'settings',address:'settings','industry-registry':'settings',regulatory:'settings',hiring:'hiring',governance:'governance','live-activity':'governance',activity:'governance',billing:'billing',subscription:'billing',plans:'billing',addons:'billing',entitlements:'billing','platform-invoices':'billing','message-delivery':'finance',automation:'settings',search:'dashboard'};
export function accessRoute(req){
 const path=String(req.originalUrl||req.path||'').split('?')[0];if(!path.startsWith('/api/saas/'))return null;
 const tail=path.slice(10),parts=tail.split('/'),first=parts[0];
 if(utility.has(first))return null;
 let feature=area[first]||'restricted';
 if(first==='business-hub')feature=({enquiry:'customers',quote:'customers',booking:'jobs',invoice:'finance',campaign:'growth'})[parts[1]]||'restricted';
 if(first==='ai'&&parts[1]==='auto-draft')feature='inbox';
 // Phase 04 pipeline: enquiries, quotes and trails are customer work; bookings and job completion are jobs; invoices are money.
 if(first==='pipeline')feature=/^(booking|quotes)$/.test(parts[1])||parts[1]==='jobs'&&parts[3]==='complete'?'jobs':/^(invoice|invoices)$/.test(parts[1])||parts[1]==='jobs'&&parts[3]==='invoice'?'finance':'customers';
 let action=first==='mail'&&/\/send$/.test(path)?'send':req.method==='GET'||req.method==='HEAD'?'read':req.method==='DELETE'?'delete':/\/(approve|decision|decide|reject|capture|charge|record|send|publish|execute|run-cycle|offer)(\/|$)/.test(path)?'approve':['PUT','PATCH'].includes(req.method)?'edit':'create';
 if(first==='pipeline'&&req.method==='POST'&&/\/(complete|issue|close)$/.test(path))action='edit';
 return {feature,action,path};
}
function ownerOnlyPath(path){return /^\/api\/saas\/(support-access|team-accounts|data-export|migration|privacy|referrals|message-delivery|activity)(\/|$)/.test(path)||/\/(approvals\/policy|payments\/settings|billing\/setup|integrations\/self-service\/[^/]+\/authorise)(\/|$)/.test(path)}
export function createStaffAccess({db,audit}){
 db.exec(`CREATE TABLE IF NOT EXISTS staff_access_policies(organisation_id TEXT NOT NULL,user_id TEXT NOT NULL,membership_created_at TEXT NOT NULL,mode TEXT NOT NULL,grants_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(organisation_id,user_id));`);
 const recent=new Map();
 function defaults(role){return ACCESS_FEATURES.flatMap(f=>f.actions.filter(a=>f.roles.includes(role)&&(a==='read'||!['jobs','workforce','approvals'].includes(f.id)||SENIOR.includes(role)||a==='create'&&f.id==='approvals')).map(a=>f.id+'.'+a))}
 function policy(org,user,role){
  const member=db.prepare("SELECT role,created_at FROM memberships WHERE organisation_id=? AND user_id=? AND status='active'").get(org,user);if(!member)return {mode:'custom',grants:[],revision:0};
  const row=db.prepare('SELECT * FROM staff_access_policies WHERE organisation_id=? AND user_id=?').get(org,user);
  const current=row&&row.membership_created_at===member.created_at;
  if(member.role==='owner')return {mode:'owner',grants:keys,revision:current?row.revision:0};
  if(!current||row.mode==='role')return {mode:'role',grants:defaults(member.role),revision:current?row.revision:0};
  try{return {mode:'custom',grants:withinRoleCeiling(member.role,JSON.parse(row.grants_json).filter(k=>valid.has(k))),revision:row.revision}}catch{return {mode:'custom',grants:[],revision:row.revision}}
 }
 const snapshot=req=>req.staffAccess||(req.staffAccess=policy(req.saas.organisation_id,req.saas.user_id,req.saas.role));
 const can=(req,feature,action='read')=>req.saas.role==='owner'||snapshot(req).grants.includes(feature+'.'+action);
 function log(req,kind,route){const key=[req.saas.organisation_id,req.saas.user_id,kind,route.feature,route.action].join(':');const now=Date.now();if(now-(recent.get(key)||0)<60000)return;recent.set(key,now);if(recent.size>5000)for(const [k,t] of recent)if(now-t>60000)recent.delete(k);audit(req,kind,'feature',route.feature,{action:route.action,path:route.path});}
 function enforce(req,res){
  const route=accessRoute(req);if(!route)return true;
  const p=snapshot(req);if(p.mode!=='custom')return true;
  if(!can(req,route.feature,route.action)||route.action!=='read'&&!can(req,route.feature,'read')){log(req,'access.denied',route);res.status(403).json({ok:false,code:'FEATURE_ACCESS_DENIED',feature:route.feature,action:route.action,error:'Your business owner has not authorised this feature or action for your account.'});return false}
  log(req,'access.used',route);return true;
 }
 function delegated(req){const r=accessRoute(req);return Boolean(r&&r.feature!=='dashboard'&&!ownerOnlyPath(r.path)&&snapshot(req).mode==='custom'&&can(req,r.feature,r.action)&&can(req,r.feature,'read'))}
 function install(app,{requireSaasUser,requireSaasRole}){
  const owner=[requireSaasUser,requireSaasRole('owner')];
  app.get('/api/saas/access/me',requireSaasUser,(req,res)=>res.json({ok:true,role:req.saas.role,access:snapshot(req)}));
  app.get('/api/saas/team-accounts/members/:id/permissions',...owner,(req,res)=>{
   const m=db.prepare("SELECT u.id,u.full_name,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organisation_id=? AND m.user_id=? AND m.status='active'").get(req.saas.organisation_id,req.params.id);if(!m)return res.status(404).json({ok:false,error:'Staff membership not found.'});
   res.json({ok:true,member:m,catalog:ACCESS_FEATURES,policy:policy(req.saas.organisation_id,m.id,m.role)});
  });
  app.put('/api/saas/team-accounts/members/:id/permissions',...owner,(req,res)=>{
   const p=z.object({mode:z.enum(['role','custom']),revision:z.number().int().min(0),grants:z.array(z.enum(keys)).max(keys.length)}).strict().safeParse(req.body);if(!p.success)return res.status(400).json({ok:false,error:'Choose valid staff permissions.'});
   const m=db.prepare("SELECT role,created_at FROM memberships WHERE organisation_id=? AND user_id=? AND status='active'").get(req.saas.organisation_id,req.params.id);if(!m)return res.status(404).json({ok:false,error:'Staff membership not found.'});if(m.role==='owner')return res.status(409).json({ok:false,error:'Business-owner authority cannot be changed through staff permissions.'});
   const grants=[...new Set(p.data.grants)].sort();if(withinRoleCeiling(m.role,grants).length!==grants.length)return res.status(400).json({ok:false,code:'ROLE_CEILING',error:'Workers and contractors can only be given jobs, their own worker record, staff chat, approvals and personal activity. Change their role first if they need more.'});if(grants.some(k=>!k.endsWith('.read')&&!grants.includes(k.split('.')[0]+'.read')))return res.status(400).json({ok:false,error:'View access is required before granting an action.'});
   const result=db.transaction(()=>{const before=policy(req.saas.organisation_id,req.params.id,m.role);if(before.revision!==p.data.revision)return null;const at=new Date().toISOString();
    db.prepare('INSERT INTO staff_access_policies(organisation_id,user_id,membership_created_at,mode,grants_json,revision,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(organisation_id,user_id) DO UPDATE SET membership_created_at=excluded.membership_created_at,mode=excluded.mode,grants_json=excluded.grants_json,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at').run(req.saas.organisation_id,req.params.id,m.created_at,p.data.mode,JSON.stringify(grants),before.revision+1,req.saas.user_id,at);
    audit(req,'team.permissions_changed','user',req.params.id,{before,after:{mode:p.data.mode,grants,revision:before.revision+1}});return policy(req.saas.organisation_id,req.params.id,m.role);
   })();if(!result)return res.status(409).json({ok:false,error:'Permissions changed in another window. Reload this member and review again.'});res.json({ok:true,policy:result});
  });
  app.get('/api/saas/team-accounts/members/:id/activity',...owner,(req,res)=>{
   if(!db.prepare('SELECT 1 FROM memberships WHERE organisation_id=? AND user_id=?').get(req.saas.organisation_id,req.params.id))return res.status(404).json({ok:false,error:'Staff membership not found.'});
   const rows=db.prepare('SELECT id,action,entity_type,entity_id,created_at,event_hash FROM audit_logs WHERE organisation_id=? AND user_id=? ORDER BY created_at DESC LIMIT 100').all(req.saas.organisation_id,req.params.id);
   res.json({ok:true,activity:rows});
  });
 }
 return {policy,snapshot,can,enforce,delegated,install};
}
