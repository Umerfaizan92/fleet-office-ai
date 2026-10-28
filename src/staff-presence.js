import {z} from 'zod';
// Presence belongs to a live session in one business; saved work availability never implies online status.
export function installStaffPresence(app,{db,requireSaasUser}){
 db.exec(`CREATE TABLE IF NOT EXISTS staff_presence(organisation_id TEXT NOT NULL,user_id TEXT NOT NULL,session_id TEXT NOT NULL,view_id TEXT NOT NULL,last_seen_at TEXT NOT NULL,PRIMARY KEY(organisation_id,session_id,view_id),FOREIGN KEY(session_id) REFERENCES user_sessions(id) ON DELETE CASCADE);
 CREATE INDEX IF NOT EXISTS staff_presence_recent ON staff_presence(organisation_id,user_id,last_seen_at);`);
 app.post('/api/saas/staff-presence/heartbeat',requireSaasUser,(req,res)=>{
  const parsed=z.object({view_id:z.string().uuid()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'A valid presence view is required.'});
  const s=req.saas,view=parsed.data.view_id;
  db.transaction(()=>{db.prepare('DELETE FROM staff_presence WHERE session_id=? AND view_id=? AND organisation_id<>?').run(s.session_id,view,s.organisation_id);db.prepare('INSERT INTO staff_presence(organisation_id,user_id,session_id,view_id,last_seen_at) VALUES (?,?,?,?,?) ON CONFLICT(organisation_id,session_id,view_id) DO UPDATE SET last_seen_at=excluded.last_seen_at').run(s.organisation_id,s.user_id,s.session_id,view,new Date().toISOString())})();res.json({ok:true});
 });
 app.post('/api/saas/staff-presence/leave',requireSaasUser,(req,res)=>{const p=z.object({view_id:z.string().uuid()}).safeParse(req.body);if(!p.success)return res.status(400).json({ok:false,error:'A valid presence view is required.'});db.prepare('DELETE FROM staff_presence WHERE session_id=? AND view_id=?').run(req.saas.session_id,p.data.view_id);res.json({ok:true})});
 function list(org,includeOffline=false,now=new Date()){
  const rows=db.prepare(`SELECT u.id,u.full_name,CASE WHEN m.status='active' THEN u.status ELSE 'inactive' END account_status,m.role,
   COALESCE(a.status,'available') availability,COALESCE(a.reason,'') reason,a.returns_at,
   EXISTS(SELECT 1 FROM staff_presence p JOIN user_sessions s ON s.id=p.session_id AND s.user_id=p.user_id WHERE p.organisation_id=m.organisation_id AND p.user_id=m.user_id AND s.expires_at>? AND p.last_seen_at>?) online
   FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN staff_availability a ON a.organisation_id=m.organisation_id AND a.user_id=m.user_id WHERE m.organisation_id=? ORDER BY u.full_name COLLATE NOCASE LIMIT 500`).all(now.toISOString(),new Date(now.getTime()-90000).toISOString(),org);
  return rows.map(r=>{const online=Boolean(r.online)&&r.account_status==='active';return {id:r.id,full_name:r.full_name,designation:String(r.role||'').replaceAll('_',' '),account_status:r.account_status,online,availability:online?r.availability:'unavailable',reason:online?r.reason:'',returns_at:online?r.returns_at||null:null}}).filter(r=>includeOffline||r.online);
 }
 return {list};
}
