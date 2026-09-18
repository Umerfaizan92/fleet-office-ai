import fs from 'fs/promises';
import { Resend } from 'resend';

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
export async function sendSaasVerificationEmail(env, { to, code, businessName }) {
  const valid = (value) => {
    const text = String(value || '').trim();
    return Boolean(text) && !/^(YOUR_|REPLACE_|CHANGE_ME|CHANGEME)/i.test(text);
  };
  if (!valid(env.RESEND_API_KEY)) {
    return { sent: false, reason: 'resend_not_configured' };
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const from = valid(env.SAAS_VERIFY_FROM)
    ? env.SAAS_VERIFY_FROM
    : valid(env.NOTIFY_FROM)
      ? env.NOTIFY_FROM
      : 'Super Pro AI Office Manager Security <security@fleetparlour.com.au>';

  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject: 'Super Pro AI Office Manager security verification code',
    text: [
      'SUPER PRO AI OFFICE MANAGER — SECURITY VERIFICATION',
      '',
      `Business: ${businessName}`,
      `Verification code: ${code}`,
      '',
      'This code expires in 10 minutes.',
      'Do not share this code with anyone.',
      '',
      'If you did not start this registration, you can ignore this email.'
    ].join('\n')
  });

  if (error) {
    throw new Error(`Verification email failed: ${error.message || JSON.stringify(error)}`);
  }

  return { sent: true, email_id: data?.id || null };
}

export async function sendSupportEscalationEmail(env, { to, supportCase }) {
  if (!env.RESEND_API_KEY || !to) return { sent: false, reason: 'support_email_not_configured' };
  const resend = new Resend(env.RESEND_API_KEY);
  const from = env.SUPPORT_FROM || env.NOTIFY_FROM || 'Super Pro AI Office Manager Support <support@fleetparlour.com.au>';
  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject: `[${supportCase.reference_code}] ${String(supportCase.severity).toUpperCase()} support escalation — ${supportCase.subject}`,
    text: [
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
    ].join('\n')
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
    text: [
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
    ].join('\n')
  });
  if (error) throw new Error(`Voice enquiry email failed: ${error.message || JSON.stringify(error)}`);
  return { sent: true, email_id: data?.id || null };
}
