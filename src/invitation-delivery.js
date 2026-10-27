import {sendBrandedEmail} from './mailer.js';
import {sendTextMessage} from './notify.js';
import {renderEmail,platformBrand} from './email-templates.js';
export async function deliverInvitation(env,{organisationId,userId,email,phone,businessName,heading,url,message='',followUp=false,category='invitation'}){
 const brand=platformBrand(env),subject=`${businessName} — ${heading}`;
 const frame={heading,paragraphs:[`${businessName} has sent you this invitation.`,message].filter(Boolean),button:{label:'Open invitation',url},notes:['Use this link only if you are the intended recipient. If you need help, contact the business that invited you.']};
 const result={email:{sent:false,reason:'not_requested'},sms:{sent:false,reason:'not_requested'}};
 if(email)result.email=await sendBrandedEmail(env,{to:email,subject,rendered:renderEmail(brand,frame),delivery:{organisationId,userId,category,subject,followUp:followUp?{subject:`Follow-up: ${heading}`,frame:{...frame,paragraphs:[`${businessName} is following up on the invitation sent yesterday.`,message]}}:null}});
 if(phone)result.sms=await sendTextMessage(env,{to:phone,text:`${businessName}: ${heading}. ${message?message+' ':''}Via Super Pro AI. ${url}`,delivery:{organisationId,userId,category,subject}});
 return result;
}
