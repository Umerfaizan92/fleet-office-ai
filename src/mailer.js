import {trackCommunication} from './message-delivery.js';
import fs from 'fs/promises';
import { Resend } from 'resend';
import { renderEmail, platformBrand } from './email-templates.js';

function configured(env) {
  return Boolean(
    env.RESEND_API_KEY &&
    env.NOTIFY_TO
  );
}

export async function sendEnquiryNotification(env, enquiry, files = []) {
  if (!configured(env)) {
    return {
      sent: false,
      reason: 'resend_not_configured'
    };
  }

  const resend = new Resend(env.RESEND_API_KEY);

  // IMPORTANT:
  // This reference comes directly from server.js.
  // We do NOT generate a different reference here.
  const referenceCode =
    enquiry.reference_code ||
    `FP-${String(enquiry.id)
      .replaceAll('-', '')
      .slice(0, 8)
      .toUpperCase()}`;

  const text = [
    'NEW FLEET PARLOUR QUOTE ENQUIRY',
    '================================',
    '',
    `Reference Number: ${referenceCode}`,
    '',
    'CUSTOMER DETAILS',
    '----------------',
    `Name: ${enquiry.full_name}`,
    `Phone: ${enquiry.phone}`,
    `Email: ${enquiry.email}`,
    '',
    'LOCATION',
    '--------',
    `Suburb/Postcode: ${enquiry.suburb_postcode}`,
    `Job Address: ${enquiry.service_address || '-'}`,
    '',
    'VEHICLE / JOB DETAILS',
    '---------------------',
    `Vehicle/Job Type: ${enquiry.vehicle_type}`,
    `Make/Model: ${enquiry.make_model || '-'}`,
    `Registration: ${enquiry.registration || '-'}`,
    '',
    'SERVICE DETAILS',
    '---------------',
    `Service Required: ${enquiry.service_required}`,
    `Parts to Polish: ${enquiry.parts_to_polish}`,
    `Condition: ${enquiry.condition}`,
    `Preferred Date: ${enquiry.preferred_date || '-'}`,
    '',
    'SITE INFORMATION',
    '----------------',
    `Power Available: ${enquiry.power_available}`,
    `Covered Work Area: ${enquiry.covered_work_area || '-'}`,
    '',
    'JOB DETAILS',
    '-----------',
    enquiry.job_details || '-',
    '',
    '================================',
    `Fleet Parlour Enquiry Reference: ${referenceCode}`,
    '',
    `Internal ID: ${enquiry.id}`
  ].join('\n');

  // Convert uploaded photos/files to a format Resend can send.
  const attachments = await Promise.all(
    files.map(async (file) => ({
      filename: file.originalname,
      content: await fs.readFile(file.path)
    }))
  );

  const { data, error } = await resend.emails.send({
    from:
      env.NOTIFY_FROM ||
      'Fleet Parlour Website <quotes@fleetparlour.com.au>',

    to: [env.NOTIFY_TO],

    // When you click Reply, it replies directly to the customer.
    replyTo: enquiry.email,

    subject:
      `[${referenceCode}] New Quote Enquiry — ${enquiry.full_name} — ${enquiry.service_required}`,

    text,

    attachments
  });

  if (error) {
    throw new Error(
      `Resend email failed: ${error.message || JSON.stringify(error)}`
    );
  }

  return {
    sent: true,
    reference_code: referenceCode,
    email_id: data?.id || null
  };
}
function usableEnvValue(value) {
  const text = String(value || '').trim();
  return Boolean(text) && !/^(YOUR_|REPLACE_|CHANGE_ME|CHANGEME)/i.test(text);
}

function normaliseSender(value, defaultName = 'Super Pro AI Office Manager Security') {
  if (!usableEnvValue(value)) return null;
  const raw = String(value).trim().replace(/^["']|["']$/g, '');
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!emailMatch) return null;
  const email = emailMatch[0].toLowerCase();
  const angleMatch = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (angleMatch) {
    const name = String(angleMatch[1] || defaultName).replace(/^["']|["']$/g, '').trim() || defaultName;
    return `${name} <${email}>`;
  }
  if (raw.toLowerCase() === email) return `${defaultName} <${email}>`;
  const name = raw
    .replace(emailMatch[0], '')
    .replace(/[<>()[\]{}"'=:;,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || defaultName;
  return `${name} <${email}>`;
}

export async function sendSaasVerificationEmail(env, { to, code, businessName }) {
  if (!usableEnvValue(env.RESEND_API_KEY)) {
    return { sent: false, reason: 'resend_not_configured' };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const candidates = [
    normaliseSender(env.SAAS_VERIFY_FROM),
    normaliseSender(env.NOTIFY_FROM),
    'Super Pro AI Office Manager Security <security@fleetparlour.com.au>'
  ].filter(Boolean).filter((value, index, all) => all.indexOf(value) === index);

  const payload = {
    to: [to],
    subject: 'Super Pro AI Office Manager security verification code',
    ...renderEmail(platformBrand(env),{
      heading:'Verify your email',
      paragraphs:[`Confirm your identity to continue with ${businessName}.`],
      facts:[['Verification code',code],['Expires','10 minutes']],
      notes:['Do not share this code. If you did not request it, ignore this email.']
    })
  };

  let lastError = null;
  for (const from of candidates) {
    const { data, error } = await resend.emails.send({ ...payload, from });
    if (!error) return { sent: true, email_id: data?.id || null, sender: from };
    lastError = error;
    const message = String(error?.message || JSON.stringify(error));
    const senderProblem = /from|sender|domain|verify|verified/i.test(message);
    if (!senderProblem) break;
  }

  const message = String(lastError?.message || lastError || 'provider error');
  throw new Error(`Verification email failed: ${message}`);
}


export async function sendWorkerOnboardingInviteEmail(env,{to,workerName,businessName,inviteUrl,expiresAt}){
  if(!usableEnvValue(env.RESEND_API_KEY)||!to)return {sent:false,reason:'resend_not_configured'};
  const resend=new Resend(env.RESEND_API_KEY);
  const from=
    normaliseSender(env.WORKFORCE_FROM,'Super Pro AI Office Manager Workforce')||
    normaliseSender(env.SAAS_VERIFY_FROM,'Super Pro AI Office Manager Workforce')||
    normaliseSender(env.NOTIFY_FROM,'Super Pro AI Office Manager Workforce')||
    'Super Pro AI Office Manager Workforce <security@fleetparlour.com.au>';
  const {data,error}=await resend.emails.send({
    from,to:[to],
    subject:`${businessName} — secure workforce onboarding`,
    ...renderEmail(platformBrand(env),{
      heading:'Complete your workforce onboarding',
      paragraphs:[`Hello ${workerName}, ${businessName} has invited you to complete your workforce profile.`,
        '1. Open your private link. 2. Complete your details and requested evidence. 3. Review and accept the applicable declarations and policies.'],
      facts:[['Business',businessName],['Worker',workerName],['Link expires',expiresAt]],
      button:{label:'Start secure onboarding',url:inviteUrl},
      notes:['This link does not provide business workspace access. Do not forward it.',
        'Work rights, licences, skills and compliance still require authorised review and any required official verification.']
    })
  });
  if(error)throw new Error(`Worker onboarding email failed: ${error.message||JSON.stringify(error)}`);
  return {sent:true,email_id:data?.id||null};
}

export async function sendSupportEscalationEmail(env, { to, supportCase }) {
  if (!env.RESEND_API_KEY || !to) return { sent: false, reason: 'support_email_not_configured' };
  const resend = new Resend(env.RESEND_API_KEY);
  const from = env.SUPPORT_FROM || env.NOTIFY_FROM || 'Super Pro AI Office Manager Support <support@fleetparlour.com.au>';
  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject: `[${supportCase.reference_code}] ${String(supportCase.severity).toUpperCase()} support escalation — ${supportCase.subject}`,
    ...renderEmail(platformBrand(env),{heading:'Support escalation',paragraphs:([
      'SUPER PRO AI OFFICE MANAGER — SUPPORT / GOVERNANCE ESCALATION',
      '',
      `Reference: ${supportCase.reference_code}`,
      `Severity: ${supportCase.severity}`,
      `Category: ${supportCase.category}`,
      `Reporter type: ${supportCase.reporter_type}`,
      `Concern involves role: ${supportCase.reported_party_role || 'none specified'}`,
      `Reporter: ${supportCase.reporter_name}`,
      `Email: ${supportCase.reporter_email || '-'}`,
      `Phone: ${supportCase.reporter_phone || '-'}`,
      `Confidential: ${supportCase.confidential ? 'Yes' : 'No'}`,
      '',
      `Subject: ${supportCase.subject}`,
      '',
      supportCase.details,
      '',
      `Automated triage: ${supportCase.triage_summary || '-'}`,
      '',
      'This alert is for an authorised human to review. Automated triage must not be treated as a final legal, employment, privacy, safety or complaint outcome.'
    ].join('\n')).split('\n\n')})
  });
  if (error) throw new Error(`Support escalation email failed: ${error.message || JSON.stringify(error)}`);
  return { sent: true, email_id: data?.id || null };
}


export async function sendVoiceEnquiryNotification(env, { to, enquiry }) {
  const target = to || env.VOICE_ENQUIRY_NOTIFY_TO || env.NOTIFY_TO || env.SUPPORT_ESCALATION_EMAIL;
  if (!env.RESEND_API_KEY || !target) return { sent: false, reason: 'voice_email_not_configured' };
  const resend = new Resend(env.RESEND_API_KEY);
  const from = env.VOICE_ENQUIRY_FROM || env.NOTIFY_FROM || 'Fleet Parlour AI Receptionist <enquiries@fleetparlour.com.au>';
  const subjectName = enquiry.customer_name || 'Business caller';
  const { data, error } = await resend.emails.send({
    from,
    to: [target],
    subject: `[AI Receptionist] ${enquiry.urgent ? 'URGENT · ' : ''}${subjectName} · Fleet Parlour enquiry`,
    ...renderEmail(platformBrand(env),{heading:'New receptionist enquiry',paragraphs:([
      'FLEET PARLOUR — AI RECEPTIONIST BUSINESS ENQUIRY',
      '',
      `Enquiry ID: ${enquiry.id}`,
      `Priority: ${enquiry.priority || 3}`,
      `Urgent: ${enquiry.urgent ? 'Yes' : 'No'}`,
      `Call type: ${enquiry.call_type || 'business_enquiry'}`,
      `Customer: ${enquiry.customer_name || '-'}`,
      `Callback: ${enquiry.callback_number || '-'}`,
      `Location: ${enquiry.location || enquiry.service_address || '-'}`,
      `Vehicle / asset: ${enquiry.vehicle_make_model || enquiry.project_type || '-'}`,
      `Components: ${enquiry.components || '-'}`,
      `Requested finish: ${enquiry.desired_finish || '-'}`,
      `Deadline: ${enquiry.deadline || '-'}`,
      '',
      `Message: ${enquiry.message || enquiry.transcript_summary || enquiry.notes || '-'}`,
      '',
      'Service mode: Fleet Parlour currently provides mobile/on-site service only. No customer drop-off workshop is offered.',
      'This notification was generated only after the enquiry record was saved by the AI receptionist tool.'
    ].join('\n')).split('\n\n')})
  });
  if (error) throw new Error(`Voice enquiry email failed: ${error.message || JSON.stringify(error)}`);
  return { sent: true, email_id: data?.id || null };
}


export async function sendPlatformAnnouncementEmail(env, { to, announcement, account = null }) {
  if (!usableEnvValue(env.RESEND_API_KEY) || !to) return { sent:false, reason:'announcement_email_not_configured' };
  const base = String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const when = (v) => (v ? new Date(v).toLocaleString('en-AU', { timeZone: 'Australia/Perth', dateStyle: 'medium', timeStyle: 'short' }) : '');
  const rendered = renderEmail(platformBrand(env), {
    heading: announcement.title,
    paragraphs: [announcement.message, announcement.before_summary ? `What it was before:\n${announcement.before_summary}` : '', announcement.after_summary ? `What it is now:\n${announcement.after_summary}` : ''],
    facts: [['Business', account?.business], ['Plan', account?.plan], ['Type', String(announcement.kind || 'notice').replaceAll('_', ' ')], ['Starts', when(announcement.starts_at)], ['Expected completion', when(announcement.expected_end_at)], ['Reference', announcement.reference_code]],
    button: { label: 'Open your workspace', url: `${base}/saas/sign-in.html` },
    notes: [`Our current terms and privacy notice apply to this change: ${base}/saas/terms.html and ${base}/saas/privacy.html`, 'You can read every notice again from the bell inside the app.']
  });
  const result = await sendBrandedEmail(env, { to,delivery:account?.organisation_id?{organisationId:account.organisation_id,category:'platform_announcement',subject:announcement.title}:null, subject: `[${announcement.reference_code}] ${announcement.title}`, rendered, kind: 'platform', fromName: 'Super Pro AI Office Manager Updates' });
  if (!result.sent) throw new Error(`Platform notice email failed: ${result.reason}`);
  return result;
}

// Sends one branded email (see email-templates.js). `kind` picks the sender: platform emails use the platform sender, emails
// sent for a business use that business's display name on the shared sender address. Never throws; reports why it did not send.
export async function sendBrandedEmail(env, { to, subject, rendered, kind = 'platform', fromName = 'Super Pro AI Office Manager', replyTo = null, attachments = [], delivery = null }) {
  const finish=result=>{trackCommunication(delivery?{...delivery,channel:'email',recipient:to}:null,result);return result};
  if (!usableEnvValue(env.RESEND_API_KEY)) return finish({ sent: false, reason: 'email_not_configured' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || ''))) return finish({ sent: false, reason: 'no_valid_email_address' });
  const from = kind === 'platform'
    ? normaliseSender(env.PLATFORM_NOTICE_FROM, fromName) || normaliseSender(env.NOTIFY_FROM, fromName) || normaliseSender(env.SAAS_VERIFY_FROM, fromName)
    : normaliseSender(env.NOTIFY_FROM, fromName) || normaliseSender(env.SAAS_VERIFY_FROM, fromName);
  if (!from) return finish({ sent: false, reason: 'sender_not_configured' });
  try {
    const { data, error } = await new Resend(env.RESEND_API_KEY).emails.send({ from, to: [to], subject: String(subject).slice(0, 200), text: rendered.text, html: rendered.html, ...(attachments.length ? { attachments } : {}), ...(replyTo ? { reply_to: replyTo } : {}) });
    return finish(error ? { sent: false, reason: String(error.message || 'provider_error').slice(0, 200) } : { sent: true, email_id: data?.id || null });
  } catch (err) { return finish({ sent: false, reason: String(err.message || err).slice(0, 200) }); }
}
