import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());
const file=path.join(root,'.env');
const parsed={};
if(fs.existsSync(file)){
  for(const raw of fs.readFileSync(file,'utf8').split(/\r?\n/)){
    const line=raw.trim();
    if(!line||line.startsWith('#'))continue;
    const i=line.indexOf('=');
    if(i<1)continue;
    const key=line.slice(0,i).trim();
    let value=line.slice(i+1).trim();
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    parsed[key]=value;
  }
}
const env={...parsed,...process.env};

const groups=[
  {name:'Core admin',sets:[['ADMIN_API_KEY']]},
  {name:'Australian business verification',sets:[['ABR_GUID']]},
  {name:'Email',sets:[['RESEND_API_KEY'],['SMTP_HOST','SMTP_USER','SMTP_PASS']]},
  {name:'AI multilingual Co-pilot',sets:[['AI_PROVIDER_BASE_URL','AI_PROVIDER_API_KEY','AI_PROVIDER_MODEL']]},
  {name:'Business telephone',sets:[['TELNYX_API_KEY','TELNYX_CONNECTION_ID','BUSINESS_PRIMARY_NUMBER']]},
  {name:'Business SMS',sets:[['TELNYX_API_KEY','TELNYX_FROM_NUMBER']]},
  {name:'WhatsApp Business',sets:[['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID']]},
  {name:'Protected owner transfer',sets:[['TELNYX_API_KEY','OWNER_PRIVATE_TRANSFER_NUMBER']]},
  {name:'AI receptionist enquiry email',sets:[['RESEND_API_KEY','VOICE_ENQUIRY_NOTIFY_TO'],['RESEND_API_KEY','NOTIFY_TO']]},
  {name:'AI receptionist urgent SMS',sets:[['TELNYX_API_KEY','TELNYX_FROM_NUMBER','VOICE_ENQUIRY_ALERT_PHONE']]},
  {name:'Meta',sets:[['META_APP_ID','META_APP_SECRET']]},
  {name:'TikTok',sets:[['TIKTOK_CLIENT_KEY','TIKTOK_CLIENT_SECRET']]},
  {name:'Google/YouTube',sets:[['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET']]},
  {name:'Snapchat',sets:[['SNAPCHAT_CLIENT_ID','SNAPCHAT_CLIENT_SECRET']]},
  {name:'X',sets:[['X_CLIENT_ID','X_CLIENT_SECRET']]},
  {name:'Payments',sets:[['STRIPE_SECRET_KEY'],['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET'],['PAYMENT_BANK_INSTRUCTIONS']]},
  {name:'Production object storage',sets:[['OBJECT_STORAGE_BUCKET']]},
  {name:'KMS',sets:[['KMS_KEY_ID'],['AWS_KMS_KEY_ID']]},
  {name:'AWS protected storage',sets:[['AWS_REGION','AWS_S3_BUCKET','AWS_KMS_KEY_ID']]},
  {name:'Render deployment',sets:[['RENDER_API_KEY','RENDER_SERVICE_ID']]},
  {name:'Website/API control',sets:[['WEBSITE_PUBLIC_URL'],['WEBSITE_API_BASE_URL','WEBSITE_API_KEY'],['WEBSITE_WEBHOOK_SECRET']]},
  {name:'Search visibility / IndexNow',sets:[['PUBLIC_BASE_URL','INDEXNOW_KEY']]},
  {name:'Independent AI checker provider',sets:[['AI_CHECKER_PROVIDER_BASE_URL','AI_CHECKER_API_KEY','AI_CHECKER_MODEL']]}
];

function present(k){
  const v=String(env[k]||'').trim();
  if(!v)return false;
  if(k==='ADMIN_API_KEY'&&/^(generate-a-long-random-key|change-me|changeme)$/i.test(v))return false;
  if(/your-public-domain\.example/i.test(v))return false;
  return true;
}
const ready=g=>g.sets.some(set=>set.every(present));
console.log('\nSuper Pro AI Office Manager configuration readiness (secret values are never printed)\n');
let configured=0;
for(const g of groups){
  const ok=ready(g);
  if(ok)configured++;
  console.log(`${ok?'READY  ':'MISSING'} ${g.name}`);
}
console.log(`\n${configured}/${groups.length} capability groups configured.`);
if(String(env.SAAS_VERIFICATION_TEST_MODE||'0')==='1')console.log('WARNING Local verification test mode is ON. Never use this setting in production.');
if(!fs.existsSync(file))console.log('NOTE No .env file was found; only process-level environment variables were checked.');
console.log('No secret values were displayed.\n');
