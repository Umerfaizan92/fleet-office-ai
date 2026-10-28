// A business membership never grants platform authority. Only an independently
// authenticated operator may link their own signed-in owner account for a shortcut.
export function createFounderIdentity({db,audit}){
 db.exec('CREATE TABLE IF NOT EXISTS founder_workspace_identity (singleton INTEGER PRIMARY KEY CHECK(singleton=1),user_id TEXT NOT NULL,linked_at TEXT NOT NULL)');
 const isFounder=req=>req.saas?.role==='owner'&&db.prepare('SELECT user_id FROM founder_workspace_identity WHERE singleton=1').get()?.user_id===req.saas.user_id;
 function install(app,{requireAdmin,requireSaasUser,requireSaasRole}){
  app.post('/api/operator/workspace-identity',requireAdmin,requireSaasUser,requireSaasRole('owner'),(req,res)=>{
   if(req.body?.confirm!==true)return res.status(400).json({ok:false,error:'Confirm the signed-in account before linking a private shortcut.'});
   const result=db.transaction(()=>{
    const current=db.prepare('SELECT user_id FROM founder_workspace_identity WHERE singleton=1').get();
    if(current&&current.user_id!==req.saas.user_id)return false;
    if(!current){db.prepare('INSERT INTO founder_workspace_identity (singleton,user_id,linked_at) VALUES (1,?,?)').run(req.saas.user_id,new Date().toISOString());audit(req,'operator.workspace_identity_linked','user',req.saas.user_id,{})}
    return true;
   })();
   res.set('Cache-Control','no-store');if(!result)return res.status(409).json({ok:false,error:'A different founder account is already linked. Sign in with that account to use its private shortcut.'});
   res.json({ok:true});
  });
 }
 return {isFounder,install};
}
