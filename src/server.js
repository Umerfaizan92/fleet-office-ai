import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { createDb } from './db.js';
import { sendEnquiryNotification } from './mailer.js';
import { createSocialStatsService } from './social-stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Current production repository:
// /src/server.js
// /saas/
// /office/
const backendRoot = path.resolve(__dirname, '..');
const siteRoot = backendRoot;

dotenv.config({ path: path.join(backendRoot, '.env') });

const env = process.env;
const port = Number(env.PORT || 3000);

/*
|--------------------------------------------------------------------------
| Telnyx Voice / AI Receptionist
|--------------------------------------------------------------------------
|
| Required deployment environment variables:
|
| TELNYX_API_KEY=
| TELNYX_CONNECTION_ID=
| TELNYX_PUBLIC_KEY=
| TELNYX_PHONE_NUMBER=
|
| Optional until Telnyx AI Assistant is created:
|
| TELNYX_AI_ASSISTANT_ID=
|
*/

const TELNYX_API_BASE = 'https://api.telnyx.com/v2';

const telnyxProcessedEvents = new Map();

const TELNYX_EVENT_TTL_MS = 60 * 60 * 1000;

function cleanupTelnyxProcessedEvents() {
  const now = Date.now();

  for (const [eventId, expiresAt] of telnyxProcessedEvents.entries()) {
    if (expiresAt <= now) {
      telnyxProcessedEvents.delete(eventId);
    }
  }
}

function rememberTelnyxEvent(eventId) {
  if (!eventId) {
    return true;
  }

  cleanupTelnyxProcessedEvents();

  if (telnyxProcessedEvents.has(eventId)) {
    return false;
  }

  telnyxProcessedEvents.set(
    eventId,
    Date.now() + TELNYX_EVENT_TTL_MS
  );

  return true;
}

function telnyxCommandId(eventId, action) {
  return crypto
    .createHash('sha256')
    .update(`${eventId || 'unknown'}:${action}`)
    .digest('hex')
    .slice(0, 32);
}

async function telnyxApiRequest(endpoint, options = {}) {
  const apiKey = String(env.TELNYX_API_KEY || '').trim();

  if (!apiKey) {
    throw new Error('TELNYX_API_KEY is not configured.');
  }

  const response = await fetch(
    `${TELNYX_API_BASE}${endpoint}`,
    {
      method: options.method || 'POST',

      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },

      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body)
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.errors?.[0]?.detail ||
      data?.errors?.[0]?.title ||
      data?.error ||
      `Telnyx API request failed with HTTP ${response.status}`;

    const error = new Error(message);
    error.statusCode = response.status;
    error.telnyxResponse = data;
console.error(
  '[TELNYX API ERROR]',
  JSON.stringify(
    {
      status: response.status,
      endpoint,
      response: data
    },
    null,
    2
  )
);
    throw error;
  }

  return data;
}

async function answerTelnyxCall(callControlId, eventId) {
  if (!callControlId) {
    throw new Error('Missing Telnyx call_control_id.');
  }

  return telnyxApiRequest(
    `/calls/${encodeURIComponent(callControlId)}/actions/answer`,
    {
      body: {
        command_id: telnyxCommandId(eventId, 'answer')
      }
    }
  );
}

async function speakTelnyxCall(
  callControlId,
  text,
  eventId,
  action = 'speak'
) {
  if (!callControlId) {
    throw new Error('Missing Telnyx call_control_id.');
  }

  return telnyxApiRequest(
    `/calls/${encodeURIComponent(callControlId)}/actions/speak`,
    {
      body: {
        payload: text,

        voice: String(
          env.TELNYX_TTS_VOICE ||
          'Telnyx.KokoroTTS.af_heart'
        ),

        language: 'en',

        command_id:
          telnyxCommandId(eventId, action)
      }
    }
  );
}

const METAL_POLISHING_AI_INSTRUCTIONS = `
You are the AI receptionist and enquiry coordinator for Fleet Parlour,
a professional truck and metal polishing business.

Your purpose is to make every genuine customer feel welcomed, understood
and professionally assisted while collecting enough information for the
Fleet Parlour team to assess the job accurately.

CALL PURPOSE AND PRIORITY ROUTING

Fleet Parlour is the primary business identity for this receptionist.

Determine the purpose of every inbound call as early as possible,
but do this naturally and do not sound robotic.

If the caller clearly describes a Fleet Parlour matter such as metal
polishing, truck polishing, stainless steel polishing, aluminium polishing,
a quotation, an existing job, or another obvious Fleet Parlour enquiry,
continue directly with the normal business workflow.

Do not unnecessarily ask an obvious Fleet Parlour customer whether
their call is personal.

If the caller asks to speak with Faizan, says the call is personal or
private, says they are a friend or family member, or the purpose of the
call is unclear, ask naturally:

"Certainly. Is this regarding Fleet Parlour business, or is it a personal
call for Faizan?"

CALL PRIORITY

PRIORITY 1 — PERSONAL / PRIVATE CALL FOR FAIZAN

Personal, private, family and friend calls for Faizan have the highest
routing priority.

When a caller confirms that the call is personal:

- Immediately stop the metal-polishing enquiry workflow.
- Treat the call as Priority 1.
- Ask for the caller's full name.
- Ask for their callback number.
- Confirm the callback number carefully.
- Ask whether they would like to leave a brief message.
- Do not pressure them to explain a private matter.
- Ask whether the matter is urgent.
- If an approved live-transfer tool is available, follow the transfer
  rules and attempt to connect the caller to Faizan when appropriate.
- If transfer is unavailable, tell the caller their message will be
  prioritised for Faizan.
- Never falsely claim that Faizan has been notified unless a notification
  tool confirms that notification was successfully sent.

Set:

call_type = personal_friend_family or private_other
priority = 1
personal_call = true
owner_notification_required = true

If the caller says the personal matter is urgent, also set:

urgent = true


PRIORITY 2 — URGENT FLEET PARLOUR BUSINESS

This includes urgent existing-customer matters, active-job problems,
customers waiting onsite, urgent complaints, or other time-sensitive
Fleet Parlour matters.


PRIORITY 3 — NORMAL FLEET PARLOUR BUSINESS

This includes new enquiries, quotations, inspections, polishing enquiries
and normal existing-customer calls.


PRIORITY 4 — GENERAL BUSINESS ADMINISTRATION

This includes suppliers, vendors, accounts, government departments and
other administrative calls unless the matter is urgent.


PRIVACY

Never disclose Faizan's:

- private phone number;
- private or home address;
- current location or whereabouts;
- personal schedule;
- family information;
- private email;
- appointments;
- availability;
- or other private information.

Do not allow an unknown caller to bypass privacy controls simply by saying
"I'm his friend", "I'm family", or "It's personal".

A personal caller may leave a message without explaining sensitive
personal information.


OFFICIAL / DEPARTMENT CALLS

If someone says they are calling from a government department, hospital,
medical organisation, bank, legal organisation or another official
organisation, do not treat them automatically as a metal-polishing customer.

Collect their name, organisation or department, callback number,
reference or case number if they wish to provide it, who they need to
speak with, a brief message, and whether the matter is urgent.

Never disclose Faizan's private information.


CALL CLASSIFICATION

Use the most appropriate classification:

business_enquiry
existing_customer
supplier_vendor
business_admin
government_department
personal_friend_family
private_other
spam_suspicious
emergency


CUSTOMER EXPERIENCE

Be warm, concise and professional.

Do not interrogate the customer with a rigid questionnaire.

Listen to what the customer has already provided and ask only for
information that is still required.

When the customer is uncertain about technical terminology, explain it
simply without making them feel inexperienced.

Never invent prices, availability, guarantees, capabilities or completion
times.

Never guarantee complete scratch, corrosion or pitting removal without
appropriate assessment.

If the job is unusual or outside confirmed Fleet Parlour capability,
collect the information and escalate it for human technical review.

METAL POLISHING KNOWLEDGE

Recognise enquiries involving:

- aluminium
- stainless steel
- chrome or chrome-like surfaces
- raw metal
- polished metal
- oxidised aluminium
- corrosion
- pitting
- scratches
- sanding
- linishing
- buffing
- polishing
- maintenance polishing
- restoration
- brushed finishes
- satin finishes
- No. 4 / #4 finish
- No. 6 / #6 finish
- No. 8 / #8 mirror finish
- mirror polishing
- show finish
- weld cleanup
- paint or coating removal

Recognise common truck and vehicle components including:

- bullbars
- fuel tanks
- hydraulic tanks
- rims
- wheels
- steps
- toolboxes
- bumpers
- grilles
- exhaust stacks
- guards
- fenders
- trailers
- stainless accessories
- aluminium accessories
- custom fabricated parts

ENQUIRY QUALIFICATION

Determine naturally during the conversation:

1. Customer name.
2. Best phone/contact method.
3. Business or fleet name when relevant.
4. Customer location.
5. Vehicle, machine or item type.
6. Make/model when relevant.
7. Exact components requiring work.
8. Quantity.
9. Metal/material if known.
10. Current condition.
11. Oxidation, corrosion or pitting.
12. Scratch condition.
13. Paint, clear coat or other coatings.
14. Desired finish.
15. Whether restoration or maintenance polishing is expected.
16. Photos or videos available.
17. Mobile-service or workshop requirement.
18. Access conditions where relevant.
19. Desired date/deadline.
20. Whether this is one-off, fleet or recurring work.

JOB CLASSIFICATION

Classify the enquiry internally as one or more of:

- maintenance_polish
- restoration
- scratch_removal
- sanding_and_polishing
- mirror_finish
- stainless_finishing
- aluminium_polishing
- industrial_custom
- inspection_required
- technical_review_required

HIGH-RISK OR UNCERTAIN REQUESTS

Escalate instead of promising when the customer requests:

- paint stripping
- unknown coatings
- severe corrosion
- severe pitting
- deep scratch removal
- structural repair
- fabrication
- welding
- regulated or specification-sensitive industrial finishes
- unfamiliar metals
- work outside confirmed Fleet Parlour services
- guaranteed perfection
- an immediate fixed price without adequate information

PHOTOS AND VIDEO

When condition materially affects the quote, politely explain that clear
photos or video will help Fleet Parlour assess preparation requirements
and provide a more accurate scope.

PRICING

Do not invent a price.

If an approved price exists in the Fleet Office AI pricing system, it may
be used subject to its conditions.

Otherwise tell the customer that the information will be reviewed and a
quote or assessment will be prepared.

CUSTOMER SATISFACTION

Never dismiss an enquiry simply because it is unusual.

Collect useful information first.

Explain what happens next.

Set realistic expectations.

Make the customer feel that Fleet Parlour wants to find the best practical
solution while protecting the customer from unrealistic promises.

INTERNATIONAL ENQUIRIES

Understand common polishing terminology used in Australia, New Zealand,
United Kingdom, United States, Canada, Europe and other markets.

Do not assume Fleet Parlour physically services an international location.

For enquiries outside the current Fleet Parlour service area, capture the
lead and mark it for review rather than promising attendance.

VOICE ENQUIRY TOOL

You have access to the save-fleet-enquiry tool.

Use this tool to save important information collected during every genuine
call.

After enough information has been collected to identify and classify the
call, call save-fleet-enquiry.

Call save-fleet-enquiry again whenever important information changes,
is corrected, or additional important information is collected.

CORRECTIONS ARE HIGH PRIORITY

If the caller says anything such as:

"Correct my number."
"That's the wrong number."
"Change my number."
"You got my name wrong."
"That's not my name."
"Let me correct that."
"That's not correct."

immediately stop the current conversational flow and handle the correction.

Do not ignore a correction even if you were about to summarize or end
the call.

For a callback-number correction:

1. Ask the caller for the correct number.
2. Listen carefully to the complete number.
3. Repeat the number back clearly, digit by digit.
4. Ask the caller to confirm it.
5. If they say it is incorrect, repeat the correction process.
6. Replace the previous callback number with the corrected number.
7. Set callback_number_confirmed=true only after explicit confirmation.
8. Call save-fleet-enquiry again with the corrected information.

For a name correction:

1. Ask for the correct full name.
2. Repeat it back.
3. Confirm it.
4. Preserve the name exactly as confirmed.
5. Do not shorten, nickname, translate or guess the caller's name.
6. Call save-fleet-enquiry again with the corrected name.

The latest confirmed information always replaces older information.

PERSONAL AND PRIVATE CALLS

When the caller confirms the call is personal or private for Faizan,
stop the metal-polishing qualification workflow.

Use save-fleet-enquiry with:

call_type = personal_friend_family or private_other
priority = 1
personal_call = true
owner_notification_required = true

Collect the caller's name and callback number.

Ask whether they would like to leave a brief message.

Do not pressure a personal caller to disclose private information.

Ask whether the matter is urgent.

If urgent, set:

urgent = true

If the caller asks to speak directly with Faizan, set:

transfer_requested = true

Do not claim that Faizan has been notified or that a transfer has occurred
unless the relevant tool confirms success.

BUSINESS CALL CLASSIFICATION

For a normal new Fleet Parlour enquiry use:

call_type = business_enquiry
priority = 3
personal_call = false

For an existing Fleet Parlour customer use:

call_type = existing_customer

If an existing customer's matter is genuinely urgent, use:

priority = 2
urgent = true

For suppliers or vendors use:

call_type = supplier_vendor
priority = 4

For normal business administration use:

call_type = business_admin
priority = 4

For government departments or official organisations use:

call_type = government_department

Collect the organisation, caller name, callback number, reference or case
number if voluntarily provided, brief message and urgency.

TOOL ACCURACY

Only send information actually supplied or established during the
conversation.

Do not invent missing information merely to complete tool fields.

When information is unknown, omit the optional field rather than guessing.

Do not claim that an enquiry has been saved unless save-fleet-enquiry
reports success.

If save-fleet-enquiry fails, continue assisting the caller professionally
and do not falsely tell them that their information was saved.

BEFORE ENDING A GENUINE CALL

Confirm the important details appropriate to that call.

For a business enquiry, confirm the customer's name, callback number,
location, main job requirement and requested finish when applicable.

For a personal/private call, confirm the caller's name, callback number,
message if provided and whether the matter is urgent.

Resolve any correction before ending the call.

Save the final confirmed information using save-fleet-enquiry before
ending the conversation.

Never hang up while the caller is attempting to correct important
information.


`.trim();

async function startTelnyxAiAssistant(
  callControlId,
  eventId
) {
  const assistantId =
    String(env.TELNYX_AI_ASSISTANT_ID || '').trim();

  if (!assistantId) {
    return {
      started: false,
      reason: 'TELNYX_AI_ASSISTANT_ID is not configured.'
    };
  }

  const response = await telnyxApiRequest(
    `/calls/${encodeURIComponent(callControlId)}/actions/ai_assistant_start`,
    {
      body: {
        assistant: {
          id: assistantId
        },

        greeting:
          'Thank you for calling Fleet Parlour. You are speaking with our AI assistant. How can I help you with your metal polishing enquiry today?',

        instructions:
          METAL_POLISHING_AI_INSTRUCTIONS,

        interruption_settings: {
          enable: true
        },

        command_id:
          telnyxCommandId(
            eventId,
            'ai-assistant-start'
          )
      }
    }
  );

  return {
    started: true,
    response
  };
}

async function handleTelnyxCallInitiated(
  eventId,
  payload
) {
  const callControlId =
    payload?.call_control_id;

  if (!callControlId) {
    console.warn(
      '[TELNYX VOICE] call.initiated missing call_control_id.'
    );

    return;
  }

  try {
    await answerTelnyxCall(
      callControlId,
      eventId
    );

    console.log(
      '[TELNYX VOICE] Answer command accepted.',
      {
        callControlId
      }
    );
  } catch (error) {
    console.error(
      '[TELNYX VOICE] Unable to answer call:',
      error.message
    );
  }
}

async function handleTelnyxCallAnswered(
  eventId,
  payload
) {
  const callControlId =
    payload?.call_control_id;

  if (!callControlId) {
    return;
  }

  try {
    const ai =
      await startTelnyxAiAssistant(
        callControlId,
        eventId
      );

    if (ai.started) {
      console.log(
        '[TELNYX VOICE] AI receptionist started.',
        {
          callControlId
        }
      );

      return;
    }

    console.warn(
      '[TELNYX VOICE] AI Assistant is not configured. Using safe greeting.'
    );

    await speakTelnyxCall(
      callControlId,
      'Thank you for calling Fleet Parlour. Our automated receptionist is being configured. Please leave your enquiry through our website or contact Fleet Parlour directly and we will be happy to assist you.',
      eventId,
      'fallback-greeting'
    );
  } catch (error) {
    console.error(
      '[TELNYX VOICE] Unable to start receptionist:',
      error.message
    );

    try {
      await speakTelnyxCall(
        callControlId,
        'Thank you for calling Fleet Parlour. We are unable to start our automated receptionist right now. Please contact Fleet Parlour directly and we will be happy to assist you.',
        eventId,
        'error-greeting'
      );
    } catch (fallbackError) {
      console.error(
        '[TELNYX VOICE] Fallback greeting failed:',
        fallbackError.message
      );
    }
  }
}



const databasePath = path.isAbsolute(env.DATABASE_PATH || '')
  ? env.DATABASE_PATH
  : path.resolve(
      backendRoot,
      env.DATABASE_PATH || './data/fleet-parlour.sqlite'
    );

const db = createDb(databasePath);
const socialStats = createSocialStatsService(env, backendRoot);

const uploadRoot = path.isAbsolute(env.UPLOAD_DIR || '')
  ? env.UPLOAD_DIR
  : path.resolve(
      backendRoot,
      env.UPLOAD_DIR || './data/uploads'
    );

const maxFileMb = Number(env.MAX_FILE_MB || 8);
const maxFiles = Number(env.MAX_FILES || 10);

fs.mkdirSync(uploadRoot, { recursive: true });

const allowedOrigins = String(env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

/*
|--------------------------------------------------------------------------
| TikTok Login Kit / OAuth
|--------------------------------------------------------------------------
|
| Add these values to the deployment environment / root .env:
|
| TIKTOK_CLIENT_KEY=
| TIKTOK_CLIENT_SECRET=
| TIKTOK_REDIRECT_URI=https://YOUR-PUBLIC-HTTPS-DOMAIN/api/tiktok/callback
| TIKTOK_SCOPES=user.info.basic,user.info.stats
|
| Tokens are saved privately in:
| data/tiktok-oauth.json
|
*/

const tiktokTokenPath =
  path.join(backendRoot, 'data', 'tiktok-oauth.json');

const tiktokOauthStates = new Map();

const TIKTOK_AUTHORIZE_URL =
  'https://www.tiktok.com/v2/auth/authorize/';

const TIKTOK_TOKEN_URL =
  'https://open.tiktokapis.com/v2/oauth/token/';

const TIKTOK_REFRESH_EARLY_MS =
  20 * 60 * 1000;

const TIKTOK_STATE_TTL_MS =
  10 * 60 * 1000;

function readTikTokTokenState() {
  try {
    if (!fs.existsSync(tiktokTokenPath)) {
      return null;
    }

    const parsed = JSON.parse(
      fs.readFileSync(tiktokTokenPath, 'utf8')
    );

    return parsed && typeof parsed === 'object'
      ? parsed
      : null;

  } catch (err) {
    console.error(
      '[tiktok-oauth] Unable to read token store:',
      err.message
    );

    return null;
  }
}

let tiktokTokenState =
  readTikTokTokenState();

if (tiktokTokenState?.access_token) {
  env.TIKTOK_ACCESS_TOKEN =
    tiktokTokenState.access_token;
}

function saveTikTokTokenState(tokenResponse) {
  const now = Date.now();

  const previous =
    tiktokTokenState || {};

  const expiresIn =
    Number(tokenResponse.expires_in || 0);

  const refreshExpiresIn =
    Number(tokenResponse.refresh_expires_in || 0);

  const next = {
    access_token:
      tokenResponse.access_token ||
      previous.access_token ||
      '',

    refresh_token:
      tokenResponse.refresh_token ||
      previous.refresh_token ||
      '',

    open_id:
      tokenResponse.open_id ||
      previous.open_id ||
      '',

    scope:
      tokenResponse.scope ||
      previous.scope ||
      '',

    token_type:
      tokenResponse.token_type ||
      previous.token_type ||
      'Bearer',

    expires_at:
      expiresIn > 0
        ? now + expiresIn * 1000
        : previous.expires_at || null,

    refresh_expires_at:
      refreshExpiresIn > 0
        ? now + refreshExpiresIn * 1000
        : previous.refresh_expires_at || null,

    updated_at:
      new Date(now).toISOString()
  };

  fs.mkdirSync(
    path.dirname(tiktokTokenPath),
    { recursive: true }
  );

  fs.writeFileSync(
    tiktokTokenPath,
    JSON.stringify(next, null, 2),
    { mode: 0o600 }
  );

  try {
    fs.chmodSync(
      tiktokTokenPath,
      0o600
    );
  } catch {}

  tiktokTokenState = next;

  if (next.access_token) {
    env.TIKTOK_ACCESS_TOKEN =
      next.access_token;
  }

  return next;
}

function cleanupTikTokOauthStates() {
  const now = Date.now();

  for (
    const [state, expiresAt]
    of tiktokOauthStates.entries()
  ) {
    if (expiresAt <= now) {
      tiktokOauthStates.delete(state);
    }
  }
}

function tiktokConfig() {
  return {
    clientKey:
      String(
        env.TIKTOK_CLIENT_KEY || ''
      ).trim(),

    clientSecret:
      String(
        env.TIKTOK_CLIENT_SECRET || ''
      ).trim(),

    redirectUri:
      String(
        env.TIKTOK_REDIRECT_URI || ''
      ).trim(),

    scopes:
      String(
        env.TIKTOK_SCOPES ||
        'user.info.basic,user.info.stats'
      )
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
  };
}

function assertTikTokOauthConfigured() {
  const cfg = tiktokConfig();

  if (
    !cfg.clientKey ||
    !cfg.clientSecret ||
    !cfg.redirectUri
  ) {
    const err = new Error(
      'TikTok OAuth is not configured. Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and TIKTOK_REDIRECT_URI in the deployment environment / root .env.'
    );

    err.statusCode = 503;

    throw err;
  }

  return cfg;
}

async function postTikTokToken(body) {
  const response =
    await fetch(
      TIKTOK_TOKEN_URL,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/x-www-form-urlencoded',

          'Cache-Control':
            'no-cache'
        },

        body:
          new URLSearchParams(body)
      }
    );

  let data;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (
    !response.ok ||
    !data?.access_token
  ) {
    const message =
      data?.error_description ||
      data?.error ||
      `TikTok token request failed with HTTP ${response.status}`;

    const err =
      new Error(message);

    err.statusCode = 502;

    throw err;
  }

  return data;
}

async function refreshTikTokAccessToken() {
  const cfg =
    assertTikTokOauthConfigured();

  const refreshToken =
    tiktokTokenState?.refresh_token;

  if (!refreshToken) {
    return null;
  }

  const data =
    await postTikTokToken({
      client_key:
        cfg.clientKey,

      client_secret:
        cfg.clientSecret,

      grant_type:
        'refresh_token',

      refresh_token:
        refreshToken
    });

  saveTikTokTokenState(data);

  console.log(
    '[tiktok-oauth] Access token refreshed successfully.'
  );

  return data.access_token;
}

async function ensureTikTokAccessToken() {
  if (
    !tiktokTokenState?.access_token
  ) {
    return (
      env.TIKTOK_ACCESS_TOKEN ||
      null
    );
  }

  const expiresAt =
    Number(
      tiktokTokenState.expires_at || 0
    );

  if (
    !expiresAt ||
    Date.now() <
      expiresAt -
        TIKTOK_REFRESH_EARLY_MS
  ) {
    env.TIKTOK_ACCESS_TOKEN =
      tiktokTokenState.access_token;

    return (
      tiktokTokenState.access_token
    );
  }

  try {
    return await
      refreshTikTokAccessToken();

  } catch (err) {
    console.error(
      '[tiktok-oauth] Token refresh failed:',
      err.message
    );

    env.TIKTOK_ACCESS_TOKEN =
      tiktokTokenState.access_token;

    return (
      tiktokTokenState.access_token
    );
  }
}

/*
|--------------------------------------------------------------------------
| Express
|--------------------------------------------------------------------------
*/

const app = express();
app.disable('x-powered-by');

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    },

    contentSecurityPolicy: {
      directives: {

        defaultSrc: [
          "'self'"
        ],

        baseUri: [
          "'self'"
        ],

        fontSrc: [
          "'self'",
          'data:',
          'https://fonts.gstatic.com',
          'https://cdnjs.cloudflare.com'
        ],

        formAction: [
          "'self'",
          'https://www.tiktok.com'
        ],

        frameAncestors: [
          "'self'"
        ],

        frameSrc: [
          "'self'",
          'https://www.youtube.com',
          'https://youtube.com',
          'https://www.google.com',
          'https://maps.google.com'
        ],

        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://i.ytimg.com',
          'https://img.youtube.com'
        ],

        objectSrc: [
          "'none'"
        ],

        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net'
        ],

        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://fonts.googleapis.com',
          'https://cdnjs.cloudflare.com'
        ],

        connectSrc: [
          "'self'",
          'https://api.fleetparlour.com.au'
        ],

        upgradeInsecureRequests:
          null
      }
    }
  })
);

app.use(
  cors({
    origin(origin, cb) {

      if (
        !origin ||
        allowedOrigins.length === 0 ||
        allowedOrigins.includes(origin)
      ) {
        return cb(null, true);
      }

      return cb(
        new Error(
          'Origin not allowed'
        )
      );
    },

    methods: [
      'GET',
      'POST',
      'PATCH',
      'PUT',
      'OPTIONS'
    ]
  })
);

app.use(
  express.json({
    limit: '1mb',
    verify: (req, res, buf) => {
      // Telnyx signs the exact raw JSON payload. Keep it only for the webhook route.
      if (req.originalUrl?.startsWith('/api/webhooks/telnyx')) {
        req.rawBody = Buffer.from(buf);
      }
    }
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '1mb'
  })
);

app.use(
  '/api/',
  rateLimit({
    windowMs:
      15 * 60 * 1000,

    limit:
      40,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    // Voice webhooks can generate several events for one call. Provider
    // authenticity is checked with the Telnyx signature instead of this limiter.
    skip: req => req.path === '/webhooks/telnyx'
  })
);

/*
|--------------------------------------------------------------------------
| Static website
|--------------------------------------------------------------------------
*/

// Fleet Office AI is the primary product on the SaaS host.
// Keep the public Fleet Parlour pages available by their explicit file routes.
app.get('/', (req, res) => res.redirect(302, '/saas/'));
app.get('/healthz', (req, res) => res.status(200).json({ ok: true, service: 'fleet-office-ai', time: new Date().toISOString() }));

app.use('/saas', express.static(path.join(siteRoot, 'saas'), { extensions: ['html'] }));
app.use('/office', express.static(path.join(siteRoot, 'office'), { extensions: ['html'] }));

/*
|--------------------------------------------------------------------------
| Upload configuration
|--------------------------------------------------------------------------
*/

const storage =
  multer.diskStorage({

    destination(
      req,
      file,
      cb
    ) {
      const enquiryId =
        req.enquiryId ||
        crypto.randomUUID();

      req.enquiryId =
        enquiryId;

      const dir =
        path.join(
          uploadRoot,
          enquiryId
        );

      fs.mkdirSync(
        dir,
        {
          recursive: true
        }
      );

      cb(
        null,
        dir
      );
    },

    filename(
      req,
      file,
      cb
    ) {
      const ext =
        path
          .extname(
            file.originalname || ''
          )
          .toLowerCase()
          .slice(0, 10);

      cb(
        null,
        `${crypto.randomUUID()}${ext}`
      );
    }
  });

const upload =
  multer({
    storage,

    limits: {
      fileSize:
        maxFileMb *
        1024 *
        1024,

      files:
        maxFiles
    },

    fileFilter(
      req,
      file,
      cb
    ) {
      const allowed = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif'
      ];

      if (
        !allowed.includes(
          file.mimetype
        )
      ) {
        return cb(
          new Error(
            'Only JPG, PNG, WEBP, HEIC or HEIF images are allowed.'
          )
        );
      }

      cb(
        null,
        true
      );
    }
  });

const jobMediaStorage = multer.diskStorage({
  destination(req, file, cb) {
    const bookingId = String(req.params.id || 'unknown').replace(/[^a-zA-Z0-9-]/g, '');
    const dir = path.join(uploadRoot, 'job-media', bookingId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 10);
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});

const jobMediaUpload = multer({
  storage: jobMediaStorage,
  limits: { fileSize: Number(env.JOB_MEDIA_MAX_MB || 100) * 1024 * 1024, files: 10 },
  fileFilter(req, file, cb) {
    const allowed = ['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Only supported job photos or videos are allowed.'));
    cb(null, true);
  }
});

/*
|--------------------------------------------------------------------------
| Enquiry validation
|--------------------------------------------------------------------------
*/

const schema =
  z.object({

    full_name:
      z.string()
        .trim()
        .min(2)
        .max(120),

    phone:
      z.string()
        .trim()
        .min(6)
        .max(40),

    email:
      z.string()
        .trim()
        .email()
        .max(160),

    suburb_postcode:
      z.string()
        .trim()
        .min(2)
        .max(120),

    service_address:
      z.string()
        .trim()
        .max(220)
        .optional()
        .default(''),

    vehicle_type:
      z.string()
        .trim()
        .min(2)
        .max(120),

    make_model:
      z.string()
        .trim()
        .max(120)
        .optional()
        .default(''),

    registration:
      z.string()
        .trim()
        .max(40)
        .optional()
        .default(''),

    service_required:
      z.string()
        .trim()
        .min(2)
        .max(160),

    parts_to_polish:
      z.string()
        .trim()
        .min(2)
        .max(500),

    condition:
      z.string()
        .trim()
        .min(2)
        .max(160),

    preferred_date:
      z.string()
        .trim()
        .max(40)
        .optional()
        .default(''),

    job_details:
      z.string()
        .trim()
        .max(4000)
        .optional()
        .default(''),

    power_available:
      z.string()
        .trim()
        .min(2)
        .max(80),

    covered_work_area:
      z.string()
        .trim()
        .max(120)
        .optional()
        .default(''),

    privacy_consent:
      z.union([
        z.literal('Yes'),
        z.literal('on'),
        z.literal('true')
      ]),

    website:
      z.string()
        .max(0)
        .optional()
        .default('')
  });

function cleanupUploaded(
  files = []
) {
  for (const f of files) {
    try {
      fs.unlinkSync(f.path);
    } catch {}
  }
}

/*
|--------------------------------------------------------------------------
| Health
|--------------------------------------------------------------------------
*/

app.get(
  '/api/health',
  (req, res) => {

    res.json({
      ok: true,

      service:
        'fleet-parlour-enquiries',

      time:
        new Date()
          .toISOString()
    });
  }
);

/*
|--------------------------------------------------------------------------
| TikTok OAuth login
|--------------------------------------------------------------------------
*/

app.get(
  '/api/tiktok/login',
  (req, res) => {

    try {
      const cfg =
        assertTikTokOauthConfigured();

      cleanupTikTokOauthStates();

      const state =
        crypto
          .randomBytes(32)
          .toString('hex');

      tiktokOauthStates.set(
        state,
        Date.now() +
          TIKTOK_STATE_TTL_MS
      );

      const url =
        new URL(
          TIKTOK_AUTHORIZE_URL
        );

      url.searchParams.set(
        'client_key',
        cfg.clientKey
      );

      url.searchParams.set(
        'scope',
        cfg.scopes.join(',')
      );

      url.searchParams.set(
        'response_type',
        'code'
      );

      url.searchParams.set(
        'redirect_uri',
        cfg.redirectUri
      );

      url.searchParams.set(
        'state',
        state
      );

      return res.redirect(
        url.toString()
      );

    } catch (err) {

      console.error(
        '[tiktok-oauth] Login start failed:',
        err.message
      );

      return res
        .status(
          err.statusCode || 500
        )
        .send(
          `TikTok authorization could not start: ${err.message}`
        );
    }
  }
);

/*
|--------------------------------------------------------------------------
| TikTok OAuth callback
|--------------------------------------------------------------------------
*/

app.get(
  '/api/tiktok/callback',
  async (req, res) => {

    try {
      const cfg =
        assertTikTokOauthConfigured();

      cleanupTikTokOauthStates();

      if (req.query.error) {

        const detail =
          String(
            req.query.error_description ||
            req.query.error ||
            'TikTok authorization was declined.'
          );

        return res
          .status(400)
          .send(
            `TikTok authorization failed: ${detail}`
          );
      }

      const code =
        String(
          req.query.code || ''
        );

      const state =
        String(
          req.query.state || ''
        );

      const expiresAt =
        tiktokOauthStates.get(
          state
        );

      if (!code) {
        return res
          .status(400)
          .send(
            'TikTok authorization failed: missing authorization code.'
          );
      }

      if (
        !state ||
        !expiresAt ||
        expiresAt <= Date.now()
      ) {
        if (state) {
          tiktokOauthStates.delete(
            state
          );
        }

        return res
          .status(400)
          .send(
            'TikTok authorization failed: invalid or expired state. Please start the login again.'
          );
      }

      tiktokOauthStates.delete(
        state
      );

      const data =
        await postTikTokToken({

          client_key:
            cfg.clientKey,

          client_secret:
            cfg.clientSecret,

          code,

          grant_type:
            'authorization_code',

          redirect_uri:
            cfg.redirectUri
        });

      const saved =
        saveTikTokTokenState(
          data
        );

      console.log(
        `[tiktok-oauth] Connected open_id=${saved.open_id || 'unknown'} scopes=${saved.scope || 'unknown'}`
      );

      return res
        .status(200)
        .type('html')
        .send(`
<!doctype html>

<html lang="en">

<head>

<meta charset="utf-8">

<meta
name="viewport"
content="width=device-width,initial-scale=1"
>

<title>
TikTok Connected - Fleet Parlour
</title>

<style>

body {
  font-family: Arial, sans-serif;
  background: #111;
  color: #fff;
  display: grid;
  place-items: center;
  min-height: 100vh;
  margin: 0;
  padding: 24px;
}

main {
  max-width: 620px;
  background: #1c1c1c;
  border: 1px solid #444;
  border-radius: 16px;
  padding: 32px;
  text-align: center;
}

h1 {
  margin-top: 0;
}

a {
  color: #fff;
}

</style>

</head>

<body>

<main>

<h1>
TikTok connected successfully
</h1>

<p>
Fleet Parlour has authorized TikTok Login Kit.
</p>

<p>
You can now close this page or check the social statistics endpoint.
</p>

<p>
<a href="/api/social-stats?refresh=1">
Check social statistics
</a>
</p>

</main>

</body>

</html>
        `);

    } catch (err) {

      console.error(
        '[tiktok-oauth] Callback failed:',
        err
      );

      return res
        .status(
          err.statusCode || 500
        )
        .send(
          `TikTok authorization failed: ${err.message}`
        );
    }
  }
);

/*
|--------------------------------------------------------------------------
| TikTok connection status
|--------------------------------------------------------------------------
*/

app.get(
  '/api/tiktok/status',
  (req, res) => {

    const cfg =
      tiktokConfig();

    const state =
      tiktokTokenState;

    res.set(
      'Cache-Control',
      'no-store'
    );

    res.json({

      ok: true,

      oauth_configured:
        Boolean(
          cfg.clientKey &&
          cfg.clientSecret &&
          cfg.redirectUri
        ),

      connected:
        Boolean(
          state?.access_token ||
          env.TIKTOK_ACCESS_TOKEN
        ),

      scope:
        state?.scope ||
        null,

      access_token_expires_at:
        state?.expires_at
          ? new Date(
              state.expires_at
            ).toISOString()
          : null,

      refresh_token_expires_at:
        state?.refresh_expires_at
          ? new Date(
              state.refresh_expires_at
            ).toISOString()
          : null
    });
  }
);

/*
|--------------------------------------------------------------------------
| Social statistics
|--------------------------------------------------------------------------
*/

app.get(
  '/api/social-stats',
  async (req, res) => {

    try {

      await ensureTikTokAccessToken();

      const force =
        req.query.refresh === '1' ||
        req.query.refresh === 'true';

      const stats =
        await socialStats.get({
          force
        });

      res.set(
        'Cache-Control',
        'no-store'
      );

      return res.json(
        stats
      );

    } catch (err) {

      console.error(
        '[social-stats]',
        err
      );

      return res
        .status(503)
        .json({
          ok: false,
          error:
            'Social statistics are temporarily unavailable.'
        });
    }
  }
);

/*
|--------------------------------------------------------------------------
| Enquiries
|--------------------------------------------------------------------------
*/

app.post(
  '/api/enquiries',
  (req, res) => {

    req.enquiryId =
      crypto.randomUUID();

    console.log(
      `[enquiry] Incoming request ${req.enquiryId} from ${req.get('origin') || 'same-origin/direct'}`
    );

    upload.array(
      'job_photos',
      maxFiles
    )(
      req,
      res,
      async uploadErr => {

        if (uploadErr) {

          console.error(
            `[enquiry] Upload rejected ${req.enquiryId}:`,
            uploadErr.message
          );

          cleanupUploaded(
            req.files
          );

          return res
            .status(400)
            .json({
              ok: false,
              error:
                uploadErr.message
            });
        }

        const parsed =
          schema.safeParse(
            req.body
          );

        if (!parsed.success) {

          console.error(
            `[enquiry] Validation failed ${req.enquiryId}:`,
            parsed.error
              .flatten()
              .fieldErrors
          );

          cleanupUploaded(
            req.files
          );

          return res
            .status(400)
            .json({
              ok: false,

              error:
                'Please check the form fields.',

              details:
                parsed.error
                  .flatten()
                  .fieldErrors
            });
        }

        if (
          !req.files ||
          req.files.length < 1
        ) {

          console.error(
            `[enquiry] No photos ${req.enquiryId}`
          );

          return res
            .status(400)
            .json({
              ok: false,
              error:
                'Please attach at least one job photo.'
            });
        }

        const id =
          req.enquiryId;

        const referenceCode =
          `FP-${id
            .replaceAll('-', '')
            .slice(0, 8)
            .toUpperCase()}`;

        const createdAt =
          new Date()
            .toISOString();

        const e =
          parsed.data;

        const insertEnquiry =
          db.prepare(`
            INSERT INTO enquiries (
              id,
              reference_code,
              created_at,
              source,
              full_name,
              phone,
              email,
              suburb_postcode,
              service_address,
              vehicle_type,
              make_model,
              registration,
              service_required,
              parts_to_polish,
              condition,
              preferred_date,
              job_details,
              power_available,
              covered_work_area,
              privacy_consent
            )
            VALUES (
              @id,
              @reference_code,
              @created_at,
              'website',
              @full_name,
              @phone,
              @email,
              @suburb_postcode,
              @service_address,
              @vehicle_type,
              @make_model,
              @registration,
              @service_required,
              @parts_to_polish,
              @condition,
              @preferred_date,
              @job_details,
              @power_available,
              @covered_work_area,
              1
            )
          `);

        const insertPhoto =
          db.prepare(`
            INSERT INTO enquiry_photos (
              enquiry_id,
              original_name,
              stored_name,
              mime_type,
              size_bytes,
              relative_path,
              created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

        const transaction =
          db.transaction(
            () => {

              insertEnquiry.run({
                id,

                reference_code:
                  referenceCode,

                created_at:
                  createdAt,

                ...e
              });

              for (
                const file
                of req.files
              ) {

                const relative =
                  path
                    .relative(
                      uploadRoot,
                      file.path
                    )
                    .replaceAll(
                      '\\',
                      '/'
                    );

                insertPhoto.run(
                  id,
                  file.originalname,
                  file.filename,
                  file.mimetype,
                  file.size,
                  relative,
                  createdAt
                );
              }
            }
          );

        try {

          transaction();

          const existingCustomer = db.prepare(`
            SELECT id FROM customers
            WHERE phone = ? OR (email IS NOT NULL AND lower(email) = lower(?))
            ORDER BY updated_at DESC LIMIT 1
          `).get(e.phone, e.email);

          const customerId = existingCustomer?.id || crypto.randomUUID();
          if (existingCustomer) {
            db.prepare(`
              UPDATE customers SET full_name = ?, phone = ?, email = ?, suburb_postcode = ?,
                service_address = COALESCE(NULLIF(?, ''), service_address), updated_at = ?
              WHERE id = ?
            `).run(e.full_name, e.phone, e.email, e.suburb_postcode, e.service_address, createdAt, customerId);
          } else {
            db.prepare(`
              INSERT INTO customers (id, created_at, updated_at, full_name, phone, email, suburb_postcode, service_address)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(customerId, createdAt, createdAt, e.full_name, e.phone, e.email, e.suburb_postcode, e.service_address);
          }
          db.prepare(`UPDATE enquiries SET customer_id = ? WHERE id = ?`).run(customerId, id);

          const mail =
            await sendEnquiryNotification(
              env,
              {
                id,

                reference_code:
                  referenceCode,

                ...e
              },

              req.files
            )
            .catch(
              err => ({
                sent: false,
                reason:
                  err.message
              })
            );

          console.log(
            `[enquiry] Saved ${id} with ${req.files.length} photo(s). Email: ${
              mail.sent === true
                ? 'sent'
                : 'not sent (' +
                  (
                    mail.reason ||
                    'unknown'
                  ) +
                  ')'
            }`
          );

          return res
            .status(201)
            .json({

              ok: true,

              enquiry_id:
                id,

              reference_code:
                referenceCode,

              email_notification:
                mail.sent === true
            });

        } catch (err) {

          cleanupUploaded(
            req.files
          );

          console.error(
            err
          );

          return res
            .status(500)
            .json({

              ok: false,

              error:
                'Unable to save your enquiry right now. Please call or WhatsApp Fleet Parlour.'
            });
        }
      }
    );
  }
);

/*
|--------------------------------------------------------------------------
| Admin authentication
|--------------------------------------------------------------------------
*/

function requireAdmin(
  req,
  res,
  next
) {

  const expected =
    env.ADMIN_API_KEY;

  const provided =
    req.get(
      'x-admin-key'
    );

  if (
    !expected ||
    !provided
  ) {
    return res
      .status(401)
      .json({
        ok: false,
        error:
          'Unauthorized'
      });
  }

  const a =
    Buffer.from(
      provided
    );

  const b =
    Buffer.from(
      expected
    );

  if (
    a.length !== b.length ||
    !crypto.timingSafeEqual(
      a,
      b
    )
  ) {
    return res
      .status(401)
      .json({
        ok: false,
        error:
          'Unauthorized'
      });
  }

  next();
}

const authLimiter=rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:true,legacyHeaders:false,message:{ok:false,error:'Too many authentication attempts. Try again later.'}});
const sessionCookieName='fp_session';
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const passwordHash=(password,salt)=>crypto.scryptSync(password,salt,64,{N:16384,r:8,p:1}).toString('hex');
function cookieValue(req,name){const row=String(req.headers.cookie||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${name}=`));return row?decodeURIComponent(row.slice(name.length+1)):''}
function setSession(res,userId,req){const raw=crypto.randomBytes(32).toString('base64url'),now=new Date(),expires=new Date(now.getTime()+8*60*60*1000);db.prepare(`INSERT INTO user_sessions (id,user_id,token_hash,expires_at,created_at,last_seen_at,ip_hash,user_agent) VALUES (?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),userId,sha256(raw),expires.toISOString(),now.toISOString(),now.toISOString(),sha256(req.ip||''),String(req.get('user-agent')||'').slice(0,500));res.setHeader('Set-Cookie',`${sessionCookieName}=${encodeURIComponent(raw)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${env.NODE_ENV==='production'?'; Secure':''}`)}
function requireSaasUser(req,res,next){const raw=cookieValue(req,sessionCookieName);if(!raw)return res.status(401).json({ok:false,error:'Sign in required'});const row=db.prepare(`SELECT s.id session_id,s.user_id,u.email,u.full_name,u.mfa_enabled,m.organisation_id,m.role,o.name organisation_name,o.slug FROM user_sessions s JOIN users u ON u.id=s.user_id JOIN memberships m ON m.user_id=u.id JOIN organisations o ON o.id=m.organisation_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active' ORDER BY m.created_at LIMIT 1`).get(sha256(raw),new Date().toISOString());if(!row)return res.status(401).json({ok:false,error:'Session expired'});db.prepare(`UPDATE user_sessions SET last_seen_at=? WHERE id=?`).run(new Date().toISOString(),row.session_id);req.saas=row;next()}
const base32Alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buffer){let bits=0,value=0,out='';for(const byte of buffer){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=base32Alphabet[(value>>>(bits-5))&31];bits-=5}}if(bits>0)out+=base32Alphabet[(value<<(5-bits))&31];return out}
function base32Decode(input){let bits=0,value=0,bytes=[];for(const char of input.replace(/=+$/,'').toUpperCase()){const index=base32Alphabet.indexOf(char);if(index<0)continue;value=(value<<5)|index;bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8}}return Buffer.from(bytes)}
function totp(secret,time=Date.now()){const counter=Math.floor(time/30000),buf=Buffer.alloc(8);buf.writeBigUInt64BE(BigInt(counter));const digest=crypto.createHmac('sha1',base32Decode(secret)).update(buf).digest(),offset=digest[digest.length-1]&15,code=((digest.readUInt32BE(offset)&0x7fffffff)%1000000).toString().padStart(6,'0');return code}
function validTotp(secret,code){return [-1,0,1].some(step=>{const expected=totp(secret,Date.now()+step*30000);return code.length===expected.length&&crypto.timingSafeEqual(Buffer.from(code),Buffer.from(expected))})}


app.use('/api/saas',(req,res,next)=>{res.setHeader('Cache-Control','no-store, max-age=0');res.setHeader('Pragma','no-cache');if(!['GET','HEAD','OPTIONS'].includes(req.method)){const origin=req.get('origin');if(origin){try{const u=new URL(origin);const expectedHost=req.get('host');if(u.host!==expectedHost)return res.status(403).json({ok:false,error:'Cross-origin request blocked.'});}catch{return res.status(403).json({ok:false,error:'Invalid request origin.'});}}}next();});
app.post('/api/saas/register',authLimiter,(req,res)=>{const parsed=z.object({business_name:z.string().trim().min(2).max(150),full_name:z.string().trim().min(2).max(150),email:z.string().trim().email().max(200),password:z.string().min(12).max(200),confirm_password:z.string().min(12).max(200),plan_id:z.enum(['starter','operations','scale']).default('starter'),accept_terms:z.literal(true),terms_version:z.string().trim().min(3).max(80)}).refine(v=>v.password===v.confirm_password,{message:'Passwords do not match.',path:['confirm_password']}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Use valid account details, select a plan, accept the Terms and Privacy Notice, and enter matching passwords of at least 12 characters.'});const email=parsed.data.email.toLowerCase();if(db.prepare(`SELECT id FROM users WHERE email=?`).get(email))return res.status(409).json({ok:false,error:'An account already uses this email.'});let slug=parsed.data.business_name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'business';while(db.prepare(`SELECT id FROM organisations WHERE slug=?`).get(slug))slug=`${slug}-${crypto.randomBytes(2).toString('hex')}`;const userId=crypto.randomUUID(),orgId=crypto.randomUUID(),salt=crypto.randomBytes(16).toString('hex'),now=new Date().toISOString(),trialEnds=new Date(Date.now()+14*86400000).toISOString();db.transaction(()=>{db.prepare(`INSERT INTO users (id,email,full_name,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`).run(userId,email,parsed.data.full_name,passwordHash(parsed.data.password,salt),salt,now,now);db.prepare(`INSERT INTO organisations (id,name,slug,created_at,updated_at) VALUES (?,?,?,?,?)`).run(orgId,parsed.data.business_name,slug,now,now);db.prepare(`INSERT INTO memberships (organisation_id,user_id,role,created_at) VALUES (?,?,'owner',?)`).run(orgId,userId,now);db.prepare(`INSERT INTO onboarding_profiles (organisation_id,updated_at) VALUES (?,?)`).run(orgId,now);db.prepare(`INSERT INTO organisation_subscriptions (id,organisation_id,plan_id,status,trial_ends_at,created_at,updated_at) VALUES (?,?,?,'trialing',?,?,?)`).run(crypto.randomUUID(),orgId,parsed.data.plan_id,trialEnds,now,now);db.prepare(`INSERT INTO workers (id,organisation_id,user_id,full_name,email,role_title,employment_type,worker_level,status,work_rights_status,onboarding_progress,approved_for_scheduling,created_at,updated_at) VALUES (?,?,?,?,?,'Owner / Administrator','owner',7,'active','verified',100,1,?,?)`).run(crypto.randomUUID(),orgId,userId,parsed.data.full_name,email,now,now)})();saasAudit({saas:{organisation_id:orgId,user_id:userId},ip:req.ip,get:(name)=>req.get(name)},'account.registered','user',userId,{organisation_slug:slug,plan_id:parsed.data.plan_id,terms_version:parsed.data.terms_version,terms_accepted_at:now});res.status(201).json({ok:true,organisation_slug:slug,mfa_required:true,email_verification_required:true,trial_ends_at:trialEnds,sign_in_required:true,message:'Account created successfully. Sign in to open your secure workspace.'})});

app.post('/api/saas/login',authLimiter,(req,res)=>{const parsed=z.object({email:z.string().trim().email(),password:z.string().min(1).max(200),mfa_code:z.string().regex(/^\d{6}$/).optional()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Invalid sign-in details.'});const user=db.prepare(`SELECT * FROM users WHERE email=? AND status='active'`).get(parsed.data.email.toLowerCase());if(!user)return res.status(401).json({ok:false,error:'Invalid sign-in details.'});const supplied=passwordHash(parsed.data.password,user.password_salt),stored=user.password_hash;if(supplied.length!==stored.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(stored)))return res.status(401).json({ok:false,error:'Invalid sign-in details.'});if(user.mfa_enabled&&!parsed.data.mfa_code)return res.status(401).json({ok:false,error:'MFA code required.',mfa_required:true});if(user.mfa_enabled&&!validTotp(user.mfa_secret,parsed.data.mfa_code))return res.status(401).json({ok:false,error:'Invalid MFA code.'});setSession(res,user.id,req);res.json({ok:true})});

app.post('/api/saas/logout',requireSaasUser,(req,res)=>{const raw=cookieValue(req,sessionCookieName);db.prepare(`DELETE FROM user_sessions WHERE token_hash=?`).run(sha256(raw));res.setHeader('Set-Cookie',`${sessionCookieName}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);res.json({ok:true})});
app.get('/api/saas/me',requireSaasUser,(req,res)=>res.json({ok:true,user:{email:req.saas.email,full_name:req.saas.full_name,role:req.saas.role,mfa_enabled:Boolean(req.saas.mfa_enabled)},organisation:{id:req.saas.organisation_id,name:req.saas.organisation_name,slug:req.saas.slug}}));
app.get('/api/saas/plans',(req,res)=>{const plans=db.prepare(`SELECT id,name,monthly_fee_cents,currency,limits_json FROM subscription_plans WHERE active=1 AND id IN ('starter','operations','scale') ORDER BY monthly_fee_cents`).all().map(p=>({...p,limits:JSON.parse(p.limits_json)}));res.json({ok:true,trial_days:14,prices_exclude_gst:true,billing_enabled:false,plans});});
app.get('/api/saas/subscription',requireSaasUser,(req,res)=>{const subscription=db.prepare(`SELECT s.*,p.name plan_name,p.setup_fee_cents,p.monthly_fee_cents,p.currency,p.limits_json FROM organisation_subscriptions s JOIN subscription_plans p ON p.id=s.plan_id WHERE s.organisation_id=?`).get(req.saas.organisation_id);if(!subscription)return res.status(404).json({ok:false,error:'Subscription record not found.'});const now=Date.now(),trialEnd=subscription.trial_ends_at?new Date(subscription.trial_ends_at).getTime():0,trialRemainingDays=trialEnd?Math.max(0,Math.ceil((trialEnd-now)/86400000)):0;res.json({ok:true,subscription:{...subscription,limits:JSON.parse(subscription.limits_json),trial_remaining_days:trialRemainingDays},billing_enabled:false,trial_days:14,note:'14-day trial is active. Paid billing stays disabled until final AUD pricing, GST treatment and a payment processor are approved.'})});
app.post('/api/saas/mfa/setup',requireSaasUser,(req,res)=>{const secret=base32Encode(crypto.randomBytes(20));db.prepare(`UPDATE users SET mfa_secret=?,mfa_enabled=0,updated_at=? WHERE id=?`).run(secret,new Date().toISOString(),req.saas.user_id);res.json({ok:true,secret,otpauth_uri:`otpauth://totp/${encodeURIComponent(`Fleet Office:${req.saas.email}`)}?secret=${secret}&issuer=${encodeURIComponent('Fleet Office')}`})});
app.post('/api/saas/mfa/verify',requireSaasUser,(req,res)=>{const parsed=z.object({code:z.string().regex(/^\d{6}$/)}).safeParse(req.body),user=db.prepare(`SELECT mfa_secret FROM users WHERE id=?`).get(req.saas.user_id);if(!parsed.success||!user?.mfa_secret||!validTotp(user.mfa_secret,parsed.data.code))return res.status(400).json({ok:false,error:'Invalid authentication code.'});db.prepare(`UPDATE users SET mfa_enabled=1,updated_at=? WHERE id=?`).run(new Date().toISOString(),req.saas.user_id);res.json({ok:true,mfa_enabled:true})});

app.get('/api/saas/onboarding',requireSaasUser,(req,res)=>{const profile=db.prepare(`SELECT * FROM onboarding_profiles WHERE organisation_id=?`).get(req.saas.organisation_id);res.json({ok:true,profile:{...profile,services:JSON.parse(profile.services)}})});
app.put('/api/saas/onboarding',requireSaasUser,(req,res)=>{const parsed=z.object({business_type:z.string().trim().min(2).max(150),phone:z.string().max(50).optional(),website:z.string().max(500).optional(),service_area:z.string().max(1000).optional(),services:z.array(z.string().max(200)).max(100),brand_voice:z.string().max(2000).optional(),approval_mode:z.enum(['everything','external_actions','custom']),ai_instructions:z.string().max(10000).optional(),complete:z.boolean().default(false)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Check the onboarding information.'});const now=new Date().toISOString();db.prepare(`UPDATE onboarding_profiles SET business_type=?,phone=?,website=?,service_area=?,services=?,brand_voice=?,approval_mode=?,ai_instructions=?,completed_at=?,updated_at=? WHERE organisation_id=?`).run(parsed.data.business_type,parsed.data.phone||null,parsed.data.website||null,parsed.data.service_area||null,JSON.stringify(parsed.data.services),parsed.data.brand_voice||null,parsed.data.approval_mode,parsed.data.ai_instructions||null,parsed.data.complete?now:null,now,req.saas.organisation_id);res.json({ok:true})});

function saasAudit(req,eventType,entityType=null,entityId=null,detail={}){db.prepare(`INSERT INTO saas_audit_events (id,organisation_id,actor_user_id,event_type,entity_type,entity_id,detail_json,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),req.saas.organisation_id,req.saas.user_id,eventType,entityType,entityId,JSON.stringify(detail),new Date().toISOString())}

app.get('/api/saas/dashboard',requireSaasUser,(req,res)=>{const org=req.saas.organisation_id;const workers=db.prepare(`SELECT COUNT(*) count FROM workers WHERE organisation_id=? AND status!='archived'`).get(org).count;const ready=db.prepare(`SELECT COUNT(*) count FROM workers WHERE organisation_id=? AND approved_for_scheduling=1 AND status='active'`).get(org).count;const attention=db.prepare(`SELECT COUNT(*) count FROM workers WHERE organisation_id=? AND approved_for_scheduling=0 AND status!='archived'`).get(org).count;const jobs=db.prepare(`SELECT COUNT(*) count FROM work_orders WHERE organisation_id=? AND status IN ('awaiting_allocation','offered')`).get(org).count;const expiring=db.prepare(`SELECT COUNT(*) count FROM worker_documents d JOIN workers w ON w.id=d.worker_id WHERE w.organisation_id=? AND d.expiry_date IS NOT NULL AND d.expiry_date<=date('now','+30 day')`).get(org).count;res.json({ok:true,metrics:{workers,ready,attention,jobs,expiring}})});

app.get('/api/saas/workers',requireSaasUser,(req,res)=>{const workers=db.prepare(`SELECT * FROM workers WHERE organisation_id=? ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END,full_name`).all(req.saas.organisation_id);res.json({ok:true,workers})});
app.post('/api/saas/workers',requireSaasUser,(req,res)=>{const parsed=z.object({full_name:z.string().trim().min(2).max(150),email:z.string().trim().email().optional().or(z.literal('')),phone:z.string().max(50).optional(),role_title:z.string().trim().min(2).max(100),employment_type:z.enum(['owner','full_time','part_time','casual','fixed_term','apprentice','contractor','subcontractor','temporary']),worker_level:z.coerce.number().int().min(1).max(7).default(1),work_status:z.enum(['australian_citizen','permanent_resident','visa_holder','requires_review'])}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Check worker details.'});const id=crypto.randomUUID(),now=new Date().toISOString(),wr=['australian_citizen','permanent_resident'].includes(parsed.data.work_status)?'verified':'review_required',progress=wr==='verified'?55:35;db.prepare(`INSERT INTO workers (id,organisation_id,full_name,email,phone,role_title,employment_type,worker_level,status,work_rights_status,onboarding_progress,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,req.saas.organisation_id,parsed.data.full_name,parsed.data.email||null,parsed.data.phone||null,parsed.data.role_title,parsed.data.employment_type,parsed.data.worker_level,'onboarding',wr,progress,now,now);const docs=[['photo_id',1],['passport',0],['employment_contract',1],['emergency_contact',1]];if(parsed.data.work_status==='visa_holder')docs.push(['vevo_work_rights',1]);if(['contractor','subcontractor'].includes(parsed.data.employment_type)){docs.push(['abn_details',1],['insurance',1])}const ins=db.prepare(`INSERT INTO worker_documents (id,worker_id,document_type,required,created_at,updated_at) VALUES (?,?,?,?,?,?)`);db.transaction(()=>{for(const [t,r] of docs)ins.run(crypto.randomUUID(),id,t,r,now,now)})();saasAudit(req,'worker.created','worker',id,{employment_type:parsed.data.employment_type});res.status(201).json({ok:true,id,passport_optional:true,approved_for_scheduling:false})});
app.patch('/api/saas/workers/:id/compliance',requireSaasUser,(req,res)=>{const parsed=z.object({work_rights_status:z.enum(['verified','pending','restricted','review_required','unable_to_verify','not_eligible']),visa_subclass:z.string().max(50).optional(),visa_expiry:z.string().max(30).optional(),work_restrictions:z.string().max(2000).optional(),onboarding_progress:z.coerce.number().int().min(0).max(100)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Check compliance details.'});const worker=db.prepare(`SELECT * FROM workers WHERE id=? AND organisation_id=?`).get(req.params.id,req.saas.organisation_id);if(!worker)return res.status(404).json({ok:false,error:'Worker not found'});const approved=parsed.data.work_rights_status==='verified'&&parsed.data.onboarding_progress===100?1:0;db.prepare(`UPDATE workers SET work_rights_status=?,visa_subclass=?,visa_expiry=?,work_restrictions=?,onboarding_progress=?,approved_for_scheduling=?,status=?,updated_at=? WHERE id=?`).run(parsed.data.work_rights_status,parsed.data.visa_subclass||null,parsed.data.visa_expiry||null,parsed.data.work_restrictions||null,parsed.data.onboarding_progress,approved,approved?'active':'onboarding',new Date().toISOString(),worker.id);saasAudit(req,'worker.compliance_updated','worker',worker.id,{approved_for_scheduling:Boolean(approved)});res.json({ok:true,approved_for_scheduling:Boolean(approved)})});
app.post('/api/saas/workers/:id/skills',requireSaasUser,(req,res)=>{const parsed=z.object({skill_name:z.string().trim().min(2).max(100),competency:z.enum(['unverified','training','competent','advanced','expert'])}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Check skill details.'});const worker=db.prepare(`SELECT id FROM workers WHERE id=? AND organisation_id=?`).get(req.params.id,req.saas.organisation_id);if(!worker)return res.status(404).json({ok:false,error:'Worker not found'});const now=new Date().toISOString();db.prepare(`INSERT INTO worker_skills (id,worker_id,skill_name,competency,created_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(worker_id,skill_name) DO UPDATE SET competency=excluded.competency,updated_at=excluded.updated_at`).run(crypto.randomUUID(),worker.id,parsed.data.skill_name,parsed.data.competency,now,now);saasAudit(req,'worker.skill_updated','worker',worker.id,{skill:parsed.data.skill_name,competency:parsed.data.competency});res.json({ok:true})});
app.get('/api/saas/workers/:id/skills',requireSaasUser,(req,res)=>{const worker=db.prepare(`SELECT id FROM workers WHERE id=? AND organisation_id=?`).get(req.params.id,req.saas.organisation_id);if(!worker)return res.status(404).json({ok:false,error:'Worker not found'});res.json({ok:true,skills:db.prepare(`SELECT * FROM worker_skills WHERE worker_id=? ORDER BY skill_name`).all(worker.id)})});

app.get('/api/saas/workers/:id/documents',requireSaasUser,(req,res)=>{const worker=db.prepare(`SELECT id FROM workers WHERE id=? AND organisation_id=?`).get(req.params.id,req.saas.organisation_id);if(!worker)return res.status(404).json({ok:false,error:'Worker not found'});res.json({ok:true,documents:db.prepare(`SELECT * FROM worker_documents WHERE worker_id=? ORDER BY required DESC,document_type`).all(worker.id)})});

app.get('/api/saas/work-orders',requireSaasUser,(req,res)=>{const jobs=db.prepare(`SELECT w.*,(SELECT COUNT(*) FROM job_offers o WHERE o.work_order_id=w.id AND o.status='accepted') accepted_workers FROM work_orders w WHERE organisation_id=? ORDER BY start_at`).all(req.saas.organisation_id).map(x=>({...x,required_skills:JSON.parse(x.required_skills)}));res.json({ok:true,jobs})});
app.post('/api/saas/work-orders',requireSaasUser,(req,res)=>{const parsed=z.object({title:z.string().trim().min(2).max(200),address:z.string().max(500).optional(),start_at:z.string().min(10).max(50),estimated_hours:z.coerce.number().positive().max(100).optional(),required_workers:z.coerce.number().int().min(1).max(100),required_level:z.coerce.number().int().min(1).max(7),required_skills:z.array(z.string().trim().min(1).max(100)).max(30).default([])}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Check work order details.'});const id=crypto.randomUUID(),now=new Date().toISOString();db.prepare(`INSERT INTO work_orders (id,organisation_id,title,address,start_at,estimated_hours,required_workers,required_level,required_skills,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id,req.saas.organisation_id,parsed.data.title,parsed.data.address||null,parsed.data.start_at,parsed.data.estimated_hours||null,parsed.data.required_workers,parsed.data.required_level,JSON.stringify(parsed.data.required_skills),now,now);saasAudit(req,'work_order.created','work_order',id,{});res.status(201).json({ok:true,id})});
app.post('/api/saas/work-orders/:id/offer',requireSaasUser,(req,res)=>{const job=db.prepare(`SELECT * FROM work_orders WHERE id=? AND organisation_id=?`).get(req.params.id,req.saas.organisation_id);if(!job)return res.status(404).json({ok:false,error:'Work order not found'});const skills=JSON.parse(job.required_skills),workers=db.prepare(`SELECT * FROM workers WHERE organisation_id=? AND approved_for_scheduling=1 AND status='active' AND availability_status='available' AND worker_level>=?`).all(req.saas.organisation_id,job.required_level);const eligible=workers.filter(w=>skills.every(skill=>{const r=db.prepare(`SELECT competency FROM worker_skills WHERE worker_id=? AND lower(skill_name)=lower(?) AND competency IN ('competent','advanced','expert')`).get(w.id,skill);return Boolean(r)}));const now=new Date().toISOString(),ins=db.prepare(`INSERT OR IGNORE INTO job_offers (id,organisation_id,work_order_id,worker_id,status,offered_at) VALUES (?,?,?,?, 'offered',?)`);db.transaction(()=>{for(const w of eligible)ins.run(crypto.randomUUID(),req.saas.organisation_id,job.id,w.id,now);db.prepare(`UPDATE work_orders SET status=?,updated_at=? WHERE id=?`).run(eligible.length?'offered':'awaiting_allocation',now,job.id)})();saasAudit(req,'work_order.offered','work_order',job.id,{eligible_workers:eligible.length});res.json({ok:true,eligible_workers:eligible.map(w=>({id:w.id,full_name:w.full_name,level:w.worker_level})),offered:eligible.length})});
app.post('/api/saas/job-offers/:id/respond',requireSaasUser,(req,res)=>{const parsed=z.object({status:z.enum(['accepted','declined'])}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Invalid response.'});const offer=db.prepare(`SELECT o.*,w.required_workers FROM job_offers o JOIN work_orders w ON w.id=o.work_order_id WHERE o.id=? AND o.organisation_id=?`).get(req.params.id,req.saas.organisation_id);if(!offer)return res.status(404).json({ok:false,error:'Offer not found'});const now=new Date().toISOString();db.prepare(`UPDATE job_offers SET status=?,responded_at=? WHERE id=?`).run(parsed.data.status,now,offer.id);const accepted=db.prepare(`SELECT COUNT(*) count FROM job_offers WHERE work_order_id=? AND status='accepted'`).get(offer.work_order_id).count;if(accepted>=offer.required_workers)db.prepare(`UPDATE work_orders SET status='allocated',updated_at=? WHERE id=?`).run(now,offer.work_order_id);saasAudit(req,'job_offer.responded','job_offer',offer.id,{status:parsed.data.status});res.json({ok:true,accepted_workers:accepted})});

app.get('/api/saas/ai/threads',requireSaasUser,(req,res)=>res.json({ok:true,threads:db.prepare(`SELECT * FROM ai_threads WHERE organisation_id=? ORDER BY updated_at DESC`).all(req.saas.organisation_id)}));
app.post('/api/saas/ai/threads',requireSaasUser,(req,res)=>{const parsed=z.object({title:z.string().trim().min(1).max(200),message:z.string().trim().min(1).max(50000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Title and message required.'});const id=crypto.randomUUID(),messageId=crypto.randomUUID(),now=new Date().toISOString();db.transaction(()=>{db.prepare(`INSERT INTO ai_threads (id,organisation_id,created_by,title,created_at,updated_at) VALUES (?,?,?,?,?,?)`).run(id,req.saas.organisation_id,req.saas.user_id,parsed.data.title,now,now);db.prepare(`INSERT INTO ai_thread_messages (id,thread_id,role,content_type,content,created_at) VALUES (?,?,'user','text',?,?)`).run(messageId,id,parsed.data.message,now)})();res.status(201).json({ok:true,id,ai_response:null,configuration_required:true,note:'Message stored privately. Connect an approved AI provider or local model before generating responses.'})});

app.get('/api/saas/video-renders',requireSaasUser,(req,res)=>res.json({ok:true,jobs:db.prepare(`SELECT * FROM video_render_jobs WHERE organisation_id=? ORDER BY updated_at DESC`).all(req.saas.organisation_id).map(j=>({...j,edit_spec:JSON.parse(j.edit_spec)}))}));
app.post('/api/saas/video-renders',requireSaasUser,(req,res)=>{const parsed=z.object({quality:z.enum(['720p','1080p','4k']),edit_spec:z.object({platform:z.string().max(80).default('Multi-platform'),goal:z.string().max(120).default('More views'),aspect_ratio:z.enum(['9:16','16:9','1:1','4:5']),clips:z.array(z.object({media_id:z.string(),start_seconds:z.coerce.number().min(0),end_seconds:z.coerce.number().positive(),transition:z.enum(['auto','cut','fade','zoom','wipe','match','speed']).default('auto')})).min(1).max(100),pacing:z.string().max(80).default('AI auto'),hook:z.string().max(120).default('AI choose strongest'),caption_style:z.string().max(120).default('AI platform-native'),captions:z.boolean().default(true),music:z.boolean().default(false),logo:z.boolean().default(true),auto_reframe:z.boolean().default(true),auto_highlights:z.boolean().default(true),cta:z.boolean().default(true),style_prompt:z.string().max(5000)}).strict()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Check the render specification and clips.'});const id=crypto.randomUUID(),now=new Date().toISOString();db.prepare(`INSERT INTO video_render_jobs (id,organisation_id,status,quality,edit_spec,created_at,updated_at) VALUES (?,?,'draft',?,?,?,?)`).run(id,req.saas.organisation_id,parsed.data.quality,JSON.stringify(parsed.data.edit_spec),now,now);res.status(201).json({ok:true,id,status:'draft',rendered:false,note:'Professional edit specification saved. FFmpeg worker and licensed media services must be configured before rendering.'})});

/*
|--------------------------------------------------------------------------
| Admin enquiry routes
|--------------------------------------------------------------------------
*/

app.get(
  '/api/admin/enquiries',
  requireAdmin,
  (req, res) => {

    const rows =
      db.prepare(`
        SELECT *
        FROM enquiries
        ORDER BY created_at DESC
        LIMIT 200
      `)
      .all();

    res.json({
      ok: true,
      enquiries: rows
    });
  }
);

app.get(
  '/api/admin/enquiries/:id',
  requireAdmin,
  (req, res) => {

    const enquiry =
      db.prepare(`
        SELECT *
        FROM enquiries
        WHERE id = ?
      `)
      .get(
        req.params.id
      );

    if (!enquiry) {

      return res
        .status(404)
        .json({
          ok: false,
          error:
            'Not found'
        });
    }

    const photos =
      db.prepare(`
        SELECT
          id,
          original_name,
          mime_type,
          size_bytes,
          created_at
        FROM enquiry_photos
        WHERE enquiry_id = ?
        ORDER BY id
      `)
      .all(
        req.params.id
      );

    res.json({
      ok: true,
      enquiry,
      photos
    });
  }
);

app.get(
  '/api/admin/enquiries/:id/photos/:photoId',
  requireAdmin,
  (req, res) => {

    const photo =
      db.prepare(`
        SELECT *
        FROM enquiry_photos
        WHERE id = ?
        AND enquiry_id = ?
      `)
      .get(
        req.params.photoId,
        req.params.id
      );

    if (!photo) {

      return res
        .status(404)
        .json({
          ok: false,
          error:
            'Not found'
        });
    }

    const full =
      path.join(
        uploadRoot,
        photo.relative_path
      );

    if (
      !fs.existsSync(full)
    ) {

      return res
        .status(404)
        .json({
          ok: false,
          error:
            'File missing'
        });
    }

    res
      .type(
        photo.mime_type
      )
      .sendFile(
        full
      );
  }
);

/*
|--------------------------------------------------------------------------
| AI Office Manager — Phase 2
|--------------------------------------------------------------------------
*/

function findOrCreateCustomer({ full_name, phone = '', email = '', channel = 'manual' }) {
  const now = new Date().toISOString();
  const existing = db.prepare(`SELECT * FROM customers WHERE (? <> '' AND phone = ?) OR (? <> '' AND lower(email) = lower(?)) ORDER BY updated_at DESC LIMIT 1`)
    .get(phone, phone, email, email);
  if (existing) {
    db.prepare(`UPDATE customers SET full_name = COALESCE(NULLIF(?, ''), full_name), phone = COALESCE(NULLIF(?, ''), phone), email = COALESCE(NULLIF(?, ''), email), updated_at = ? WHERE id = ?`)
      .run(full_name, phone, email, now, existing.id);
    return existing.id;
  }
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO customers (id,created_at,updated_at,full_name,phone,email,notes) VALUES (?,?,?,?,?,?,?)`)
    .run(id, now, now, full_name || 'Unknown customer', phone || `unknown-${id.slice(0,8)}`, email || null, `Created from ${channel} conversation import.`);
  return id;
}

function suggestedReply(name, channel) {
  const first = String(name || 'there').trim().split(/\s+/)[0];
  return `Hi ${first}, thank you for contacting Fleet Parlour. I have received your enquiry. Before I confirm the quotation and booking, could you please send clear photos of the parts, the truck make/model, your Perth suburb or job address, and your preferred date? Kind regards, Faizan — Fleet Parlour`;
}

function createApproval({ approvalType, entityId, conversationId = null, customerId = null, draftPayload }) {
  const existing = db.prepare(`SELECT id FROM approvals WHERE approval_type=? AND entity_id=? AND status='pending'`).get(approvalType, entityId);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO approvals (id,approval_type,entity_id,conversation_id,customer_id,status,draft_payload,created_at) VALUES (?,?,?,?,?,'pending',?,?)`)
    .run(id, approvalType, entityId, conversationId, customerId, JSON.stringify(draftPayload), new Date().toISOString());
  return id;
}

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const enquiries = db.prepare(`SELECT COUNT(*) total,
    SUM(status = 'new') new_count, SUM(status = 'quoted') quoted_count,
    SUM(status = 'booked') booked_count, SUM(priority = 'urgent') urgent_count FROM enquiries`).get();
  const customers = db.prepare(`SELECT COUNT(*) total FROM customers`).get();
  const quotes = db.prepare(`SELECT COUNT(*) total, COALESCE(SUM(CASE WHEN status = 'accepted' THEN total_cents ELSE 0 END),0) accepted_value_cents FROM quotes`).get();
  const upcomingBookings = db.prepare(`SELECT COUNT(*) total FROM bookings WHERE start_at >= ? AND status NOT IN ('cancelled','completed')`).get(new Date().toISOString());
  const recent = db.prepare(`SELECT id, reference_code, created_at, status, priority, full_name, phone, suburb_postcode, service_required, preferred_date FROM enquiries ORDER BY created_at DESC LIMIT 20`).all();
  res.json({ ok: true, counts: { ...enquiries, customers: customers.total, quotes: quotes.total, accepted_value_cents: quotes.accepted_value_cents, upcoming_bookings: upcomingBookings.total }, recent });
});

app.patch('/api/admin/enquiries/:id', requireAdmin, (req, res) => {
  const parsed = z.object({
    status: z.enum(['new','contacted','quoted','booked','in_progress','completed','lost']).optional(),
    priority: z.enum(['low','normal','high','urgent']).optional(),
    assigned_to: z.string().trim().max(100).nullable().optional(),
    next_action_at: z.string().trim().max(50).nullable().optional(),
    ai_summary: z.string().trim().max(5000).nullable().optional(),
    ai_quote_draft: z.string().trim().max(10000).nullable().optional(),
    customer_consent_marketing: z.boolean().optional()
  }).refine(value => Object.keys(value).length > 0).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'Invalid enquiry update.' });
  if (!db.prepare('SELECT id FROM enquiries WHERE id = ?').get(req.params.id)) return res.status(404).json({ ok: false, error: 'Not found' });
  const values = { ...parsed.data };
  if ('customer_consent_marketing' in values) values.customer_consent_marketing = values.customer_consent_marketing ? 1 : 0;
  const fields = Object.keys(values);
  db.prepare(`UPDATE enquiries SET ${fields.map(field => `${field} = @${field}`).join(', ')} WHERE id = @id`).run({ id: req.params.id, ...values });
  db.prepare(`INSERT INTO activity_log (enquiry_id, customer_id, activity_type, note, created_at) SELECT id, customer_id, 'updated', ?, ? FROM enquiries WHERE id = ?`)
    .run(`Updated ${fields.join(', ')}`, new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/enquiries/:id/activities', requireAdmin, (req, res) => {
  res.json({ ok: true, activities: db.prepare(`SELECT * FROM activity_log WHERE enquiry_id = ? ORDER BY created_at DESC`).all(req.params.id) });
});

app.post('/api/admin/enquiries/:id/activities', requireAdmin, (req, res) => {
  const parsed = z.object({ activity_type: z.enum(['note','call','sms','email','quote','booking']), note: z.string().trim().min(1).max(5000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'A valid activity and note are required.' });
  const enquiry = db.prepare('SELECT id, customer_id FROM enquiries WHERE id = ?').get(req.params.id);
  if (!enquiry) return res.status(404).json({ ok: false, error: 'Not found' });
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO activity_log (enquiry_id, customer_id, activity_type, note, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(enquiry.id, enquiry.customer_id, parsed.data.activity_type, parsed.data.note, now);
  db.prepare(`UPDATE enquiries SET last_contact_at = ? WHERE id = ?`).run(now, enquiry.id);
  res.status(201).json({ ok: true });
});

app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const customers = db.prepare(`SELECT c.*,
    (SELECT COUNT(*) FROM enquiries e WHERE e.customer_id = c.id) enquiry_count,
    (SELECT COUNT(*) FROM quotes q WHERE q.customer_id = c.id) quote_count
    FROM customers c ORDER BY c.updated_at DESC LIMIT 500`).all();
  res.json({ ok: true, customers });
});

app.get('/api/admin/conversations', requireAdmin, (req,res)=>{
  const conversations=db.prepare(`SELECT c.*,u.full_name,u.phone,u.email,
    (SELECT body FROM messages m WHERE m.conversation_id=c.id ORDER BY occurred_at DESC LIMIT 1) last_message,
    (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) message_count
    FROM conversations c JOIN customers u ON u.id=c.customer_id ORDER BY c.updated_at DESC`).all();
  res.json({ok:true,conversations});
});

app.get('/api/admin/conversations/:id', requireAdmin, (req,res)=>{
  const conversation=db.prepare(`SELECT c.*,u.full_name,u.phone,u.email FROM conversations c JOIN customers u ON u.id=c.customer_id WHERE c.id=?`).get(req.params.id);
  if(!conversation)return res.status(404).json({ok:false,error:'Conversation not found'});
  const messages=db.prepare(`SELECT * FROM messages WHERE conversation_id=? ORDER BY occurred_at`).all(req.params.id);
  res.json({ok:true,conversation,messages});
});

app.post('/api/admin/conversations/import', requireAdmin, (req,res)=>{
  const parsed=z.object({contact_type:z.enum(['business','personal']).default('business'),channel:z.enum(['whatsapp','email','phone','facebook','instagram','tiktok','website','sms','other']),full_name:z.string().trim().min(1).max(150),phone:z.string().trim().max(40).optional().default(''),email:z.string().trim().max(160).optional().default(''),subject:z.string().trim().max(250).optional().default(''),transcript:z.string().trim().min(1).max(50000),occurred_at:z.string().max(50).optional()}).safeParse(req.body);
  if(!parsed.success)return res.status(400).json({ok:false,error:'Please provide the channel, customer and conversation text.'});
  if(parsed.data.email && !z.string().email().safeParse(parsed.data.email).success)return res.status(400).json({ok:false,error:'Email address is invalid.'});
  if(parsed.data.contact_type==='personal')return res.status(200).json({ok:true,excluded:true,stored:false,message:'Personal contact excluded. No customer, conversation or message was stored.'});
  const now=new Date().toISOString(),customerId=findOrCreateCustomer(parsed.data),conversationId=crypto.randomUUID(),messageId=crypto.randomUUID();
  db.transaction(()=>{
    db.prepare(`INSERT INTO conversations (id,customer_id,channel,subject,status,created_at,updated_at) VALUES (?,?,?,?, 'open',?,?)`).run(conversationId,customerId,parsed.data.channel,parsed.data.subject||`${parsed.data.channel} enquiry`,now,now);
    db.prepare(`INSERT INTO messages (id,conversation_id,direction,sender_name,sender_address,body,occurred_at,status) VALUES (?,?,'inbound',?,?,?,?, 'imported')`).run(messageId,conversationId,parsed.data.full_name,parsed.data.phone||parsed.data.email||'',parsed.data.transcript,parsed.data.occurred_at||now);
    const draftId=crypto.randomUUID();
    db.prepare(`INSERT INTO messages (id,conversation_id,direction,sender_name,sender_address,body,occurred_at,status,requires_approval) VALUES (?,?,'outbound','Fleet Parlour','',?,?,'draft',1)`).run(draftId,conversationId,suggestedReply(parsed.data.full_name,parsed.data.channel),now);
    createApproval({approvalType:'reply',entityId:draftId,conversationId,customerId,draftPayload:{body:suggestedReply(parsed.data.full_name,parsed.data.channel),channel:parsed.data.channel}});
  })();
  res.status(201).json({ok:true,conversation_id:conversationId,customer_id:customerId,approval_created:true});
});

app.post('/api/admin/conversations/:id/draft-reply', requireAdmin, (req,res)=>{
  const parsed=z.object({body:z.string().trim().min(1).max(10000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Reply text is required.'});
  const conversation=db.prepare(`SELECT * FROM conversations WHERE id=?`).get(req.params.id);if(!conversation)return res.status(404).json({ok:false,error:'Conversation not found'});
  const id=crypto.randomUUID(),now=new Date().toISOString();db.prepare(`INSERT INTO messages (id,conversation_id,direction,sender_name,body,occurred_at,status,requires_approval) VALUES (?,?,'outbound','Fleet Parlour',?,?,'draft',1)`).run(id,conversation.id,parsed.data.body,now);
  createApproval({approvalType:'reply',entityId:id,conversationId:conversation.id,customerId:conversation.customer_id,draftPayload:{body:parsed.data.body,channel:conversation.channel}});res.status(201).json({ok:true,message_id:id});
});

app.get('/api/admin/approvals', requireAdmin, (req,res)=>{
  const status=String(req.query.status||'pending');
  const approvals=db.prepare(`SELECT a.*,c.full_name,c.phone FROM approvals a LEFT JOIN customers c ON c.id=a.customer_id WHERE a.status=? ORDER BY a.created_at DESC`).all(status).map(a=>({...a,draft_payload:JSON.parse(a.draft_payload),edited_payload:a.edited_payload?JSON.parse(a.edited_payload):null}));
  res.json({ok:true,approvals});
});

app.patch('/api/admin/approvals/:id', requireAdmin, (req,res)=>{const parsed=z.object({edited_payload:z.record(z.any())}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Invalid draft changes.'});const result=db.prepare(`UPDATE approvals SET edited_payload=? WHERE id=? AND status='pending'`).run(JSON.stringify(parsed.data.edited_payload),req.params.id);if(!result.changes)return res.status(404).json({ok:false,error:'Pending approval not found'});res.json({ok:true})});

app.post('/api/admin/approvals/:id/decision', requireAdmin, (req,res)=>{
  const parsed=z.object({decision:z.enum(['approve','reject']),edited_payload:z.record(z.any()).optional()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Invalid approval decision.'});
  const approval=db.prepare(`SELECT * FROM approvals WHERE id=? AND status='pending'`).get(req.params.id);if(!approval)return res.status(404).json({ok:false,error:'Pending approval not found'});
  const payload=parsed.data.edited_payload||JSON.parse(approval.edited_payload||approval.draft_payload),now=new Date().toISOString(),status=parsed.data.decision==='approve'?'approved':'rejected';
  db.transaction(()=>{db.prepare(`UPDATE approvals SET status=?,edited_payload=?,decided_at=? WHERE id=?`).run(status,JSON.stringify(payload),now,approval.id);if(approval.approval_type==='reply'){db.prepare(`UPDATE messages SET body=?,status=?,approved_at=? WHERE id=?`).run(payload.body||'',status,parsed.data.decision==='approve'?now:null,approval.entity_id)}else if(approval.approval_type==='quote'){db.prepare(`UPDATE quotes SET status=?,approved_at=?,updated_at=? WHERE id=?`).run(parsed.data.decision==='approve'?'approved':'draft',parsed.data.decision==='approve'?now:null,now,approval.entity_id)}else if(approval.approval_type==='date_proposal'){db.prepare(`UPDATE date_proposals SET status=? WHERE id=?`).run(parsed.data.decision==='approve'?'approved':'rejected',approval.entity_id)}else if(approval.approval_type==='invoice'){db.prepare(`UPDATE invoices SET status=?,updated_at=? WHERE id=?`).run(parsed.data.decision==='approve'?'approved':'draft',now,approval.entity_id)}else if(['followup','receipt','review_request','thank_you'].includes(approval.approval_type)){db.prepare(`UPDATE automation_tasks SET status=?,payload=? WHERE id=?`).run(parsed.data.decision==='approve'?'approved':'rejected',JSON.stringify(payload),approval.entity_id)}})();
  res.json({ok:true,status,transmitted:false,message:'Approved items are ready to send. No live channel is connected, so nothing was transmitted.'});
});

app.patch('/api/admin/customers/:id', requireAdmin, (req, res) => {
  const parsed = z.object({ full_name:z.string().trim().min(1).max(150).optional(), phone:z.string().trim().min(6).max(40).optional(), email:z.string().trim().email().nullable().optional(), company_name:z.string().trim().max(150).nullable().optional(), service_address:z.string().trim().max(500).nullable().optional(), notes:z.string().trim().max(5000).nullable().optional(), marketing_consent:z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) return res.status(400).json({ ok:false, error:'Invalid customer update.' });
  const values={...parsed.data,updated_at:new Date().toISOString()}; if('marketing_consent' in values) values.marketing_consent=values.marketing_consent?1:0;
  const fields=Object.keys(values); const result=db.prepare(`UPDATE customers SET ${fields.map(f=>`${f} = @${f}`).join(', ')} WHERE id=@id`).run({id:req.params.id,...values});
  if(!result.changes) return res.status(404).json({ok:false,error:'Not found'}); res.json({ok:true});
});

app.get('/api/admin/services', requireAdmin, (req, res) => res.json({ ok:true, services:db.prepare(`SELECT * FROM service_catalog ORDER BY active DESC, name`).all() }));

app.get('/api/admin/quotes', requireAdmin, (req, res) => {
  const quotes=db.prepare(`SELECT q.*, c.full_name, c.phone, c.email FROM quotes q JOIN customers c ON c.id=q.customer_id ORDER BY q.created_at DESC`).all();
  res.json({ok:true,quotes});
});

app.post('/api/admin/quotes', requireAdmin, (req, res) => {
  const parsed=z.object({customer_id:z.string().uuid(),enquiry_id:z.string().uuid().nullable().optional(),valid_until:z.string().max(30).nullable().optional(),notes:z.string().max(5000).nullable().optional(),items:z.array(z.object({description:z.string().trim().min(1).max(500),quantity:z.coerce.number().positive().max(1000),unit_price:z.coerce.number().nonnegative().max(1000000)})).min(1).max(30)}).safeParse(req.body);
  if(!parsed.success) return res.status(400).json({ok:false,error:'Please check the quote customer and items.'});
  if(!db.prepare('SELECT id FROM customers WHERE id=?').get(parsed.data.customer_id)) return res.status(404).json({ok:false,error:'Customer not found'});
  const now=new Date().toISOString(),id=crypto.randomUUID(),quoteNumber=`FPQ-${Date.now().toString().slice(-8)}`;
  const lines=parsed.data.items.map((item,index)=>{const unit=Math.round(item.unit_price*100),total=Math.round(unit*item.quantity);return {...item,unit,total,index}});
  const subtotal=lines.reduce((sum,item)=>sum+item.total,0),gst=Math.round(subtotal*.10),total=subtotal+gst;
  db.transaction(()=>{db.prepare(`INSERT INTO quotes (id,quote_number,enquiry_id,customer_id,status,issue_date,valid_until,notes,subtotal_cents,gst_cents,total_cents,created_at,updated_at) VALUES (?,?,?,?,'draft',?,?,?,?,?,?,?,?)`).run(id,quoteNumber,parsed.data.enquiry_id||null,parsed.data.customer_id,now.slice(0,10),parsed.data.valid_until||null,parsed.data.notes||null,subtotal,gst,total,now,now);const insert=db.prepare(`INSERT INTO quote_items (quote_id,description,quantity,unit_price_cents,line_total_cents,position) VALUES (?,?,?,?,?,?)`);for(const line of lines)insert.run(id,line.description,line.quantity,line.unit,line.total,line.index);if(parsed.data.enquiry_id)db.prepare(`UPDATE enquiries SET status='quoted' WHERE id=?`).run(parsed.data.enquiry_id);})()
  res.status(201).json({ok:true,id,quote_number:quoteNumber,total_cents:total});
});

app.get('/api/admin/quotes/:id', requireAdmin, (req,res)=>{const quote=db.prepare(`SELECT q.*,c.full_name,c.phone,c.email FROM quotes q JOIN customers c ON c.id=q.customer_id WHERE q.id=?`).get(req.params.id);if(!quote)return res.status(404).json({ok:false,error:'Quote not found'});const items=db.prepare(`SELECT * FROM quote_items WHERE quote_id=? ORDER BY position,id`).all(req.params.id);res.json({ok:true,quote,items})});

app.put('/api/admin/quotes/:id', requireAdmin, (req,res)=>{const parsed=z.object({valid_until:z.string().max(30).nullable().optional(),notes:z.string().max(5000).nullable().optional(),items:z.array(z.object({description:z.string().trim().min(1).max(500),quantity:z.coerce.number().positive().max(1000),unit_price:z.coerce.number().nonnegative().max(1000000)})).min(1).max(30)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Please check the quote items.'});const quote=db.prepare(`SELECT * FROM quotes WHERE id=?`).get(req.params.id);if(!quote)return res.status(404).json({ok:false,error:'Quote not found'});if(['sent','accepted'].includes(quote.status))return res.status(409).json({ok:false,error:'Sent or accepted quotes cannot be edited. Create a revision instead.'});const lines=parsed.data.items.map((item,index)=>{const unit=Math.round(item.unit_price*100),total=Math.round(unit*item.quantity);return{...item,unit,total,index}}),subtotal=lines.reduce((sum,item)=>sum+item.total,0),gst=Math.round(subtotal*.10),total=subtotal+gst,now=new Date().toISOString();db.transaction(()=>{db.prepare(`DELETE FROM quote_items WHERE quote_id=?`).run(quote.id);const insert=db.prepare(`INSERT INTO quote_items (quote_id,description,quantity,unit_price_cents,line_total_cents,position) VALUES (?,?,?,?,?,?)`);for(const line of lines)insert.run(quote.id,line.description,line.quantity,line.unit,line.total,line.index);db.prepare(`UPDATE quotes SET valid_until=?,notes=?,subtotal_cents=?,gst_cents=?,total_cents=?,status='draft',approved_at=NULL,updated_at=? WHERE id=?`).run(parsed.data.valid_until||null,parsed.data.notes||null,subtotal,gst,total,now,quote.id);db.prepare(`UPDATE approvals SET status='superseded',decided_at=? WHERE approval_type='quote' AND entity_id=? AND status='pending'`).run(now,quote.id)})();res.json({ok:true,total_cents:total})});

app.post('/api/admin/quotes/:id/request-approval', requireAdmin, (req,res)=>{const quote=db.prepare(`SELECT * FROM quotes WHERE id=?`).get(req.params.id);if(!quote)return res.status(404).json({ok:false,error:'Quote not found'});if(quote.status!=='draft')return res.status(409).json({ok:false,error:'Only a draft quote can be submitted for approval.'});const pending=db.prepare(`SELECT id FROM approvals WHERE approval_type='quote' AND entity_id=? AND status='pending'`).get(quote.id);if(pending)return res.status(409).json({ok:false,error:'This quote is already waiting for approval.'});const items=db.prepare(`SELECT description,quantity,unit_price_cents,line_total_cents FROM quote_items WHERE quote_id=? ORDER BY position,id`).all(quote.id);const approvalId=createApproval({approvalType:'quote',entityId:quote.id,customerId:quote.customer_id,draftPayload:{quote_number:quote.quote_number,notes:quote.notes,subtotal_cents:quote.subtotal_cents,gst_cents:quote.gst_cents,total_cents:quote.total_cents,items}});res.status(201).json({ok:true,approval_id:approvalId})});

app.post('/api/admin/quotes/:id/verify-acceptance', requireAdmin, (req,res)=>{const parsed=z.object({accepted:z.literal(true),evidence:z.string().trim().min(2).max(5000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Acceptance evidence is required.'});const quote=db.prepare(`SELECT * FROM quotes WHERE id=?`).get(req.params.id);if(!quote)return res.status(404).json({ok:false,error:'Quote not found'});const now=new Date().toISOString();db.prepare(`UPDATE quotes SET status='accepted',accepted_at=?,updated_at=? WHERE id=?`).run(now,now,quote.id);db.prepare(`INSERT INTO activity_log (customer_id,activity_type,note,created_at) VALUES (?,'quote',?,?)`).run(quote.customer_id,`Acceptance verified for ${quote.quote_number}: ${parsed.data.evidence}`,now);res.json({ok:true})});

app.get('/api/admin/quotes/:id/date-proposals', requireAdmin, (req,res)=>res.json({ok:true,proposals:db.prepare(`SELECT * FROM date_proposals WHERE quote_id=? ORDER BY proposed_start`).all(req.params.id)}));

app.post('/api/admin/quotes/:id/date-proposals', requireAdmin, (req,res)=>{const parsed=z.object({proposed_start:z.string().min(10).max(50),proposed_end:z.string().max(50).nullable().optional()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'A proposed start date is required.'});const quote=db.prepare(`SELECT * FROM quotes WHERE id=? AND status='accepted'`).get(req.params.id);if(!quote)return res.status(409).json({ok:false,error:'Verify customer acceptance before proposing a date.'});const id=crypto.randomUUID(),now=new Date().toISOString();db.prepare(`INSERT INTO date_proposals (id,quote_id,customer_id,proposed_start,proposed_end,status,created_at) VALUES (?,?,?,?,?,'draft',?)`).run(id,quote.id,quote.customer_id,parsed.data.proposed_start,parsed.data.proposed_end||null,now);createApproval({approvalType:'date_proposal',entityId:id,customerId:quote.customer_id,draftPayload:{proposed_start:parsed.data.proposed_start,proposed_end:parsed.data.proposed_end||null,quote_number:quote.quote_number}});res.status(201).json({ok:true,id})});

app.post('/api/admin/date-proposals/:id/confirm-booking', requireAdmin, (req,res)=>{const proposal=db.prepare(`SELECT p.*,q.enquiry_id,q.quote_number,c.service_address FROM date_proposals p JOIN quotes q ON q.id=p.quote_id JOIN customers c ON c.id=p.customer_id WHERE p.id=? AND p.status='approved'`).get(req.params.id);if(!proposal)return res.status(409).json({ok:false,error:'Approve the date proposal before confirming the booking.'});const id=crypto.randomUUID(),now=new Date().toISOString(),title=`Confirmed job — ${proposal.quote_number}`;db.transaction(()=>{db.prepare(`INSERT INTO bookings (id,enquiry_id,customer_id,title,start_at,end_at,address,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'confirmed',?,?,?)`).run(id,proposal.enquiry_id,proposal.customer_id,title,proposal.proposed_start,proposal.proposed_end,proposal.service_address,`Created from accepted quote ${proposal.quote_number}`,now,now);db.prepare(`UPDATE date_proposals SET status='booked' WHERE id=?`).run(proposal.id);const insert=db.prepare(`INSERT INTO automation_tasks (id,task_type,customer_id,enquiry_id,booking_id,due_at,status,payload,created_at) VALUES (?,?,?,?,?,?,'pending_approval',?,?)`);const start=new Date(proposal.proposed_start);for(const [type,hours,text] of [['booking_confirmation',0,'Booking confirmation'],['reminder_48h',48,'48-hour booking reminder'],['reminder_same_day',4,'Same-day booking reminder']]){const due=type==='booking_confirmation'?new Date():new Date(start.getTime()-hours*3600000),taskId=crypto.randomUUID(),taskPayload={text,quote_number:proposal.quote_number,due_at:due.toISOString()};insert.run(taskId,type,proposal.customer_id,proposal.enquiry_id,id,due.toISOString(),JSON.stringify(taskPayload),now);createApproval({approvalType:'followup',entityId:taskId,customerId:proposal.customer_id,draftPayload:taskPayload})}})();res.status(201).json({ok:true,booking_id:id,followups_created:3,all_followups_require_approval:true})});

app.patch('/api/admin/quotes/:id', requireAdmin, (req,res)=>{const parsed=z.object({status:z.enum(['draft','approved','sent','accepted','declined','expired'])}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Invalid quote status'});const now=new Date().toISOString(),result=db.prepare(`UPDATE quotes SET status=?,sent_at=CASE WHEN ?='sent' THEN ? ELSE sent_at END,updated_at=? WHERE id=?`).run(parsed.data.status,parsed.data.status,now,now,req.params.id);if(!result.changes)return res.status(404).json({ok:false,error:'Not found'});res.json({ok:true})});

app.get('/api/admin/automation-tasks', requireAdmin, (req,res)=>{const tasks=db.prepare(`SELECT t.*,c.full_name,c.phone FROM automation_tasks t JOIN customers c ON c.id=t.customer_id ORDER BY t.due_at`).all().map(t=>({...t,payload:JSON.parse(t.payload)}));res.json({ok:true,tasks})});

app.get('/api/admin/bookings', requireAdmin, (req,res)=>{const bookings=db.prepare(`SELECT b.*,c.full_name,c.phone FROM bookings b JOIN customers c ON c.id=b.customer_id ORDER BY b.start_at`).all();res.json({ok:true,bookings})});

app.post('/api/admin/bookings', requireAdmin, (req,res)=>{const parsed=z.object({customer_id:z.string().uuid(),enquiry_id:z.string().uuid().nullable().optional(),title:z.string().trim().min(1).max(200),start_at:z.string().min(10).max(50),end_at:z.string().max(50).nullable().optional(),address:z.string().max(500).nullable().optional(),notes:z.string().max(5000).nullable().optional()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Please check the booking details.'});if(!db.prepare('SELECT id FROM customers WHERE id=?').get(parsed.data.customer_id))return res.status(404).json({ok:false,error:'Customer not found'});const id=crypto.randomUUID(),now=new Date().toISOString();db.prepare(`INSERT INTO bookings (id,enquiry_id,customer_id,title,start_at,end_at,address,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id,parsed.data.enquiry_id||null,parsed.data.customer_id,parsed.data.title,parsed.data.start_at,parsed.data.end_at||null,parsed.data.address||null,parsed.data.notes||null,now,now);if(parsed.data.enquiry_id)db.prepare(`UPDATE enquiries SET status='booked' WHERE id=?`).run(parsed.data.enquiry_id);res.status(201).json({ok:true,id})});

app.patch('/api/admin/bookings/:id', requireAdmin, (req,res)=>{const parsed=z.object({status:z.enum(['tentative','confirmed','in_progress','work_complete','invoiced','paid','completed','cancelled'])}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Invalid booking status'});const result=db.prepare(`UPDATE bookings SET status=?,updated_at=? WHERE id=?`).run(parsed.data.status,new Date().toISOString(),req.params.id);if(!result.changes)return res.status(404).json({ok:false,error:'Not found'});res.json({ok:true})});

app.get('/api/admin/jobs/:id', requireAdmin, (req,res)=>{
  const booking=db.prepare(`SELECT b.*,c.full_name,c.phone,c.email FROM bookings b JOIN customers c ON c.id=b.customer_id WHERE b.id=?`).get(req.params.id);
  if(!booking)return res.status(404).json({ok:false,error:'Job not found'});
  const media=db.prepare(`SELECT id,stage,media_type,original_name,mime_type,size_bytes,notes,marketing_approved,created_at FROM job_media WHERE booking_id=? ORDER BY created_at`).all(booking.id);
  const consents=db.prepare(`SELECT * FROM job_consents WHERE booking_id=? ORDER BY consent_type`).all(booking.id);
  const invoice=db.prepare(`SELECT * FROM invoices WHERE booking_id=?`).get(booking.id)||null;
  const payments=invoice?db.prepare(`SELECT * FROM payments WHERE invoice_id=? ORDER BY received_at`).all(invoice.id):[];
  const reviews=db.prepare(`SELECT * FROM customer_reviews WHERE booking_id=? ORDER BY received_at DESC`).all(booking.id);
  res.json({ok:true,booking,media,consents,invoice,payments,reviews});
});

app.post('/api/admin/jobs/:id/media', requireAdmin, (req,res)=>{
  jobMediaUpload.array('media',10)(req,res,err=>{
    if(err)return res.status(400).json({ok:false,error:err.message});
    const booking=db.prepare(`SELECT id FROM bookings WHERE id=?`).get(req.params.id);
    if(!booking){for(const file of req.files||[])fs.rmSync(file.path,{force:true});return res.status(404).json({ok:false,error:'Job not found'});}
    const stage=String(req.body.stage||'');if(!['before','after'].includes(stage)){for(const file of req.files||[])fs.rmSync(file.path,{force:true});return res.status(400).json({ok:false,error:'Choose before or after work.'});}
    if(!req.files?.length)return res.status(400).json({ok:false,error:'Select at least one photo or video.'});
    const now=new Date().toISOString(),marketingApproved=Boolean(db.prepare(`SELECT id FROM job_consents WHERE booking_id=? AND consent_type='marketing_media' AND granted=1`).get(booking.id)),insert=db.prepare(`INSERT INTO job_media (id,booking_id,stage,media_type,original_name,stored_name,mime_type,size_bytes,relative_path,notes,marketing_approved,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(()=>{for(const file of req.files){insert.run(crypto.randomUUID(),booking.id,stage,file.mimetype.startsWith('video/')?'video':'photo',file.originalname,file.filename,file.mimetype,file.size,path.relative(uploadRoot,file.path),String(req.body.notes||'').slice(0,2000),marketingApproved?1:0,now)}})();
    res.status(201).json({ok:true,files_saved:req.files.length,private:true,marketing_approved:marketingApproved});
  });
});

app.get('/api/admin/jobs/:jobId/media/:mediaId', requireAdmin, (req,res)=>{const item=db.prepare(`SELECT * FROM job_media WHERE id=? AND booking_id=?`).get(req.params.mediaId,req.params.jobId);if(!item)return res.status(404).json({ok:false,error:'Media not found'});const absolute=path.resolve(uploadRoot,item.relative_path);if(!absolute.startsWith(path.resolve(uploadRoot)+path.sep)||!fs.existsSync(absolute))return res.status(404).json({ok:false,error:'Stored file not found'});res.type(item.mime_type);res.setHeader('Content-Disposition',`inline; filename="${path.basename(item.original_name).replace(/["\r\n]/g,'')}"`);res.sendFile(absolute)});

app.post('/api/admin/jobs/:id/consents', requireAdmin, (req,res)=>{const parsed=z.object({consent_type:z.enum(['invoice_delivery','marketing_media','review_request']),granted:z.boolean(),evidence:z.string().trim().min(3).max(5000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Consent type, decision and evidence are required.'});const booking=db.prepare(`SELECT * FROM bookings WHERE id=?`).get(req.params.id);if(!booking)return res.status(404).json({ok:false,error:'Job not found'});const now=new Date().toISOString(),id=crypto.randomUUID();db.prepare(`INSERT INTO job_consents (id,booking_id,customer_id,consent_type,granted,evidence,granted_at,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(booking_id,consent_type) DO UPDATE SET granted=excluded.granted,evidence=excluded.evidence,granted_at=excluded.granted_at`).run(id,booking.id,booking.customer_id,parsed.data.consent_type,parsed.data.granted?1:0,parsed.data.evidence,parsed.data.granted?now:null,now);if(parsed.data.consent_type==='marketing_media')db.prepare(`UPDATE job_media SET marketing_approved=? WHERE booking_id=?`).run(parsed.data.granted?1:0,booking.id);res.json({ok:true})});

app.post('/api/admin/jobs/:id/complete-work', requireAdmin, (req,res)=>{const booking=db.prepare(`SELECT * FROM bookings WHERE id=?`).get(req.params.id);if(!booking)return res.status(404).json({ok:false,error:'Job not found'});if(!['confirmed','in_progress'].includes(booking.status))return res.status(409).json({ok:false,error:'Only a confirmed or in-progress job can be marked work complete.'});const consent=db.prepare(`SELECT id FROM job_consents WHERE booking_id=? AND consent_type='invoice_delivery' AND granted=1`).get(booking.id);if(!consent)return res.status(409).json({ok:false,error:'Record customer consent for invoice delivery first.'});const quote=db.prepare(`SELECT * FROM quotes WHERE customer_id=? AND status='accepted' AND (? IS NULL OR enquiry_id=?) ORDER BY accepted_at DESC LIMIT 1`).get(booking.customer_id,booking.enquiry_id,booking.enquiry_id);if(!quote)return res.status(409).json({ok:false,error:'An accepted quote is required to generate the invoice.'});const existing=db.prepare(`SELECT * FROM invoices WHERE booking_id=?`).get(booking.id);if(existing)return res.status(409).json({ok:false,error:'An invoice already exists for this job.'});const now=new Date().toISOString(),invoiceId=crypto.randomUUID(),invoiceNumber=`FPI-${Date.now().toString().slice(-8)}`;db.transaction(()=>{db.prepare(`UPDATE bookings SET status='work_complete',updated_at=? WHERE id=?`).run(now,booking.id);db.prepare(`INSERT INTO invoices (id,invoice_number,booking_id,quote_id,customer_id,status,subtotal_cents,gst_cents,total_cents,created_at,updated_at) VALUES (?,?,?,?,?,'draft',?,?,?,?,?)`).run(invoiceId,invoiceNumber,booking.id,quote.id,booking.customer_id,quote.subtotal_cents,quote.gst_cents,quote.total_cents,now,now);createApproval({approvalType:'invoice',entityId:invoiceId,customerId:booking.customer_id,draftPayload:{invoice_number:invoiceNumber,subtotal_cents:quote.subtotal_cents,gst_cents:quote.gst_cents,total_cents:quote.total_cents}})})();res.status(201).json({ok:true,invoice_id:invoiceId,invoice_number:invoiceNumber,approval_required:true})});

app.post('/api/admin/invoices/:id/mark-sent', requireAdmin, (req,res)=>{const invoice=db.prepare(`SELECT * FROM invoices WHERE id=? AND status='approved'`).get(req.params.id);if(!invoice)return res.status(409).json({ok:false,error:'Approve the invoice before marking it sent.'});const now=new Date().toISOString();db.prepare(`UPDATE invoices SET status='sent',issued_at=?,updated_at=? WHERE id=?`).run(now,now,invoice.id);db.prepare(`UPDATE bookings SET status='invoiced',updated_at=? WHERE id=?`).run(now,invoice.booking_id);res.json({ok:true,transmitted:false})});

app.post('/api/admin/invoices/:id/payments', requireAdmin, (req,res)=>{const parsed=z.object({amount:z.coerce.number().positive().max(1000000),payment_method:z.enum(['bank_transfer','card','cash','other']),reference:z.string().max(200).optional(),evidence:z.string().trim().min(3).max(5000),received_at:z.string().min(10).max(50)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Valid payment amount, method, date and evidence are required.'});const invoice=db.prepare(`SELECT * FROM invoices WHERE id=? AND status IN ('sent','part_paid')`).get(req.params.id);if(!invoice)return res.status(409).json({ok:false,error:'The invoice must be sent before recording payment.'});const amount=Math.round(parsed.data.amount*100),remaining=invoice.total_cents-invoice.amount_paid_cents;if(amount>remaining)return res.status(409).json({ok:false,error:'Payment exceeds the invoice balance.'});const now=new Date().toISOString(),paymentId=crypto.randomUUID(),newPaid=invoice.amount_paid_cents+amount,paid=newPaid===invoice.total_cents;db.transaction(()=>{db.prepare(`INSERT INTO payments (id,invoice_id,amount_cents,payment_method,reference,evidence,received_at,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(paymentId,invoice.id,amount,parsed.data.payment_method,parsed.data.reference||null,parsed.data.evidence,parsed.data.received_at,now);db.prepare(`UPDATE invoices SET amount_paid_cents=?,status=?,paid_at=?,updated_at=? WHERE id=?`).run(newPaid,paid?'paid':'part_paid',paid?parsed.data.received_at:null,now,invoice.id);if(paid){db.prepare(`UPDATE bookings SET status='paid',updated_at=? WHERE id=?`).run(now,invoice.booking_id);const taskId=crypto.randomUUID(),payload={text:`Payment received. Receipt for ${invoice.invoice_number}`,invoice_number:invoice.invoice_number,amount_cents:newPaid};db.prepare(`INSERT INTO automation_tasks (id,task_type,customer_id,booking_id,due_at,status,payload,created_at) VALUES (?,'receipt',?,?,?,'pending_approval',?,?)`).run(taskId,invoice.customer_id,invoice.booking_id,now,JSON.stringify(payload),now);createApproval({approvalType:'receipt',entityId:taskId,customerId:invoice.customer_id,draftPayload:payload})}})();res.status(201).json({ok:true,fully_paid:paid,receipt_approval_created:paid})});

app.post('/api/admin/jobs/:id/request-review', requireAdmin, (req,res)=>{const booking=db.prepare(`SELECT * FROM bookings WHERE id=? AND status='paid'`).get(req.params.id);if(!booking)return res.status(409).json({ok:false,error:'Full payment must be recorded before requesting a review.'});const consent=db.prepare(`SELECT id FROM job_consents WHERE booking_id=? AND consent_type='review_request' AND granted=1`).get(booking.id);if(!consent)return res.status(409).json({ok:false,error:'Record permission to send a review request first.'});const taskId=crypto.randomUUID(),now=new Date().toISOString(),payload={text:'Thank you for choosing Fleet Parlour. If you are happy with the result, we would appreciate your Google review.',review_url:'https://www.google.com/search?q=Fleet+Parlour+Perth'};db.prepare(`INSERT INTO automation_tasks (id,task_type,customer_id,booking_id,due_at,status,payload,created_at) VALUES (?,'review_request',?,?,?,'pending_approval',?,?)`).run(taskId,booking.customer_id,booking.id,now,JSON.stringify(payload),now);createApproval({approvalType:'review_request',entityId:taskId,customerId:booking.customer_id,draftPayload:payload});res.status(201).json({ok:true,approval_required:true})});

app.post('/api/admin/jobs/:id/review-received', requireAdmin, (req,res)=>{const parsed=z.object({platform:z.enum(['google','facebook','other']),rating:z.coerce.number().int().min(1).max(5).optional(),review_text:z.string().max(10000).optional(),evidence:z.string().trim().min(3).max(5000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Review platform and evidence are required.'});const booking=db.prepare(`SELECT * FROM bookings WHERE id=? AND status='paid'`).get(req.params.id);if(!booking)return res.status(409).json({ok:false,error:'Paid job not found.'});const now=new Date().toISOString(),reviewId=crypto.randomUUID(),taskId=crypto.randomUUID(),payload={text:'Thank you for your review and for choosing Fleet Parlour. We appreciate your business.'};db.transaction(()=>{db.prepare(`INSERT INTO customer_reviews (id,booking_id,customer_id,platform,rating,review_text,evidence,received_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(reviewId,booking.id,booking.customer_id,parsed.data.platform,parsed.data.rating||null,parsed.data.review_text||null,parsed.data.evidence,now,now);db.prepare(`UPDATE bookings SET status='completed',updated_at=? WHERE id=?`).run(now,booking.id);db.prepare(`INSERT INTO automation_tasks (id,task_type,customer_id,booking_id,due_at,status,payload,created_at) VALUES (?,'thank_you',?,?,?,'pending_approval',?,?)`).run(taskId,booking.customer_id,booking.id,now,JSON.stringify(payload),now);createApproval({approvalType:'thank_you',entityId:taskId,customerId:booking.customer_id,draftPayload:payload})})();res.status(201).json({ok:true,job_completed:true,thank_you_approval_created:true})});

app.get('/api/admin/channel-connections', requireAdmin, (req,res)=>res.json({ok:true,connections:db.prepare(`SELECT * FROM channel_connections ORDER BY channel`).all().map(c=>({...c,capabilities:JSON.parse(c.capabilities)}))}));

app.get('/api/admin/integration-readiness', requireAdmin, (req,res)=>{
  const specs=[
    ['Email',['SMTP_HOST','SMTP_USER','SMTP_PASS']],
    ['Resend Email',['RESEND_API_KEY']],
    ['TikTok',['TIKTOK_CLIENT_KEY','TIKTOK_CLIENT_SECRET']],
    ['Meta / Facebook / Instagram',['META_APP_ID','META_APP_SECRET']],
    ['WhatsApp Business',['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID']],
    ['YouTube',['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET']],
    ['Voice / Telephone',['TELNYX_API_KEY','TELNYX_CONNECTION_ID','TELNYX_PUBLIC_KEY','TELNYX_PHONE_NUMBER']]
  ];
  const integrations=specs.map(([name,keys])=>{const missing=keys.filter(k=>!env[k]);return {name,ready:missing.length===0,missing};});
  res.json({ok:true,integrations,live_activation:false,note:'Readiness only. Provider accounts, approved apps, purchased/ported numbers, HTTPS callback URLs and OAuth authorisation must be completed with each provider before live activation.'});
});

app.get('/api/admin/content-templates', requireAdmin, (req,res)=>res.json({ok:true,templates:[
  {name:'Before & after reveal',format:'short_video',aspect_ratio:'9:16',duration:20,hook:'Watch this oxidised metal return to a mirror finish',cta:'Request your Perth polishing quote'},
  {name:'Process close-up',format:'short_video',aspect_ratio:'9:16',duration:30,hook:'The polishing step most people skip',cta:'Save this and contact Fleet Parlour'},
  {name:'Fleet transformation',format:'youtube_video',aspect_ratio:'16:9',duration:90,hook:'Complete truck metal restoration in Perth',cta:'Book Fleet Parlour for your truck or fleet'},
  {name:'Photo carousel',format:'carousel',aspect_ratio:'4:5',duration:null,hook:'Swipe to see the transformation',cta:'Send photos for a quotation'}],live_trends:false,note:'These are durable Fleet Parlour formats, not a claim of live platform trends.'}));

app.get('/api/admin/content-projects', requireAdmin, (req,res)=>{const projects=db.prepare(`SELECT p.*,b.title booking_title FROM content_projects p LEFT JOIN bookings b ON b.id=p.booking_id ORDER BY p.updated_at DESC`).all().map(p=>({...p,media_ids:JSON.parse(p.media_ids),platforms:JSON.parse(p.platforms)}));res.json({ok:true,projects})});

app.post('/api/admin/content-projects', requireAdmin, (req,res)=>{const parsed=z.object({title:z.string().trim().min(2).max(200),booking_id:z.string().uuid().nullable().optional(),format:z.enum(['short_video','youtube_video','carousel','image_post','story']),aspect_ratio:z.enum(['9:16','16:9','1:1','4:5']),target_duration_seconds:z.coerce.number().int().min(5).max(3600).nullable().optional(),hook:z.string().max(500).optional(),caption:z.string().max(5000).optional(),cta:z.string().max(500).optional(),editing_prompt:z.string().max(5000).optional(),media_ids:z.array(z.string().uuid()).max(50).default([]),platforms:z.array(z.enum(['facebook','instagram','tiktok','youtube','website'])).min(1)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Check the content title, format, platforms and media selection.'});if(parsed.data.media_ids.length){const placeholders=parsed.data.media_ids.map(()=>'?').join(','),approved=db.prepare(`SELECT COUNT(*) count FROM job_media WHERE id IN (${placeholders}) AND marketing_approved=1`).get(...parsed.data.media_ids).count;if(approved!==parsed.data.media_ids.length)return res.status(409).json({ok:false,error:'Every selected job photo/video must have recorded marketing consent.'})}const id=crypto.randomUUID(),now=new Date().toISOString();db.prepare(`INSERT INTO content_projects (id,title,booking_id,format,aspect_ratio,target_duration_seconds,hook,caption,cta,editing_prompt,media_ids,platforms,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,parsed.data.title,parsed.data.booking_id||null,parsed.data.format,parsed.data.aspect_ratio,parsed.data.target_duration_seconds||null,parsed.data.hook||null,parsed.data.caption||null,parsed.data.cta||null,parsed.data.editing_prompt||null,JSON.stringify(parsed.data.media_ids),JSON.stringify(parsed.data.platforms),now,now);res.status(201).json({ok:true,id,rendered:false,note:'Edit plan saved. Final video rendering requires the local FFmpeg renderer in the next build step.'})});

app.post('/api/admin/content-projects/:id/prepare-posts', requireAdmin, (req,res)=>{const project=db.prepare(`SELECT * FROM content_projects WHERE id=?`).get(req.params.id);if(!project)return res.status(404).json({ok:false,error:'Content project not found'});const platforms=JSON.parse(project.platforms),now=new Date().toISOString(),insert=db.prepare(`INSERT INTO social_posts (id,content_project_id,platform,status,scheduled_at,platform_caption,created_at,updated_at) VALUES (?,? ,?,'pending_approval',?,?,?,?)`),ids=[];db.transaction(()=>{for(const platform of platforms){const id=crypto.randomUUID(),payload={platform,title:project.title,caption:project.caption,hook:project.hook,cta:project.cta,format:project.format,aspect_ratio:project.aspect_ratio};insert.run(id,project.id,platform,null,project.caption||'',now,now);createApproval({approvalType:'social_post',entityId:id,draftPayload:payload});ids.push(id)}db.prepare(`UPDATE content_projects SET status='pending_approval',updated_at=? WHERE id=?`).run(now,project.id)})();res.status(201).json({ok:true,posts_created:ids.length,approval_required:true,published:false})});

app.get('/api/admin/campaigns', requireAdmin, (req,res)=>res.json({ok:true,campaigns:db.prepare(`SELECT * FROM marketing_campaigns ORDER BY updated_at DESC`).all()}));

app.post('/api/admin/campaigns', requireAdmin, (req,res)=>{const parsed=z.object({name:z.string().trim().min(2).max(200),campaign_type:z.enum(['offer','follow_up','newsletter','lead_generation']),channel:z.enum(['email','sms','whatsapp','facebook','instagram','tiktok','youtube','website']),offer:z.string().trim().min(2).max(2000),message:z.string().trim().min(2).max(10000),audience_rule:z.enum(['all_marketing_contacts','past_customers','unconverted_leads']),scheduled_at:z.string().max(50).nullable().optional()}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Check the campaign fields.'});const eligible=db.prepare(`SELECT COUNT(*) count FROM customers WHERE marketing_consent=1`).get().count,id=crypto.randomUUID(),now=new Date().toISOString();db.prepare(`INSERT INTO marketing_campaigns (id,name,campaign_type,channel,offer,message,audience_rule,status,scheduled_at,eligible_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending_approval',?,?,?,?)`).run(id,parsed.data.name,parsed.data.campaign_type,parsed.data.channel,parsed.data.offer,parsed.data.message,parsed.data.audience_rule,parsed.data.scheduled_at||null,eligible,now,now);createApproval({approvalType:'campaign',entityId:id,draftPayload:{...parsed.data,eligible_count:eligible,consent_required:true}});res.status(201).json({ok:true,id,eligible_count:eligible,approval_required:true,sent:false})});

app.get('/api/admin/receptionist-settings', requireAdmin, (req,res)=>res.json({ok:true,settings:db.prepare('SELECT * FROM receptionist_settings WHERE id=1').get()}));

app.put('/api/admin/receptionist-settings', requireAdmin, (req,res)=>{const parsed=z.object({business_name:z.string().trim().min(1).max(100),greeting:z.string().trim().min(10).max(1000),transfer_number:z.string().trim().min(8).max(30),service_area:z.string().trim().min(2).max(500),business_hours:z.string().trim().min(2).max(500),escalation_rules:z.string().trim().min(10).max(3000),required_questions:z.string().trim().min(10).max(3000),screening_mode:z.enum(['business_only','business_or_personal']),personal_transfer_rules:z.string().trim().min(10).max(3000),recording_notice:z.string().trim().min(10).max(1000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'Please check all receptionist settings.'});db.prepare(`UPDATE receptionist_settings SET business_name=@business_name,greeting=@greeting,transfer_number=@transfer_number,service_area=@service_area,business_hours=@business_hours,escalation_rules=@escalation_rules,required_questions=@required_questions,screening_mode=@screening_mode,personal_transfer_rules=@personal_transfer_rules,recording_notice=@recording_notice,updated_at=@updated_at WHERE id=1`).run({...parsed.data,updated_at:new Date().toISOString()});res.json({ok:true})});

// -----------------------------------------------------------------------------
// Fleet Office AI - Voice Enquiry API
// -----------------------------------------------------------------------------

const voiceEnquiries = new Map();

function requireAiToolSecret(req, res, next) {
  const expected = String(env.AI_TOOL_SHARED_SECRET || '').trim();
  const provided = String(req.get('x-ai-tool-secret') || '').trim();

  if (!expected || !provided) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized'
    });
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized'
    });
  }

  next();
}

app.post(
  '/api/ai-tools/enquiry',
  requireAiToolSecret,
  (req, res) => {
    try {
      const body = req.body || {};

      const id =
        String(body.enquiry_id || '').trim() ||
        crypto.randomUUID();

      const existing = voiceEnquiries.get(id) || {};

      const row = {
        ...existing,

        id,

        updated_at:
          new Date().toISOString()
      };

      if (!row.created_at) {
        row.created_at = row.updated_at;
      }

      const fields = [
        'call_session_id',
        'call_control_id',
        'customer_name',
        'callback_number',
        'business_name',
        'call_type',
        'priority',
        'personal_call',
        'urgent',
        'transfer_requested',
        'owner_notification_required',
        'location',
        'service_address',
        'project_type',
        'vehicle_make_model',
        'components',
        'quantity',
        'material',
        'condition',
        'oxidation',
        'corrosion',
        'pitting',
        'scratches',
        'coating',
        'desired_finish',
        'service_mode',
        'deadline',
        'recurring_fleet',
        'message',
        'notes',
        'transcript_summary'
      ];

      for (const field of fields) {
        if (body[field] !== undefined) {
          row[field] = body[field];
        }
      }

      row.callback_number_confirmed =
        body.callback_number_confirmed === true;

      // Personal/private calls always receive Priority 1.
      row.personal_call =
        body.personal_call === true ||
        ['personal_friend_family', 'private_other'].includes(
          String(body.call_type || row.call_type || '')
        );

      if (row.personal_call) {
        row.priority = 1;
        row.owner_notification_required = true;
      } else if (body.priority !== undefined) {
        const requestedPriority = Number(body.priority);

        row.priority =
          Number.isFinite(requestedPriority)
            ? Math.max(
                1,
                Math.min(4, requestedPriority)
              )
            : (row.priority || 3);
      } else if (!row.priority) {
        if (
          String(body.call_type || row.call_type || '') ===
            'existing_customer' &&
          body.urgent === true
        ) {
          row.priority = 2;
        } else {
          row.priority = 3;
        }
      }

      row.urgent =
        body.urgent === true;

      row.transfer_requested =
        body.transfer_requested === true;

      row.owner_notification_required =
        row.owner_notification_required === true ||
        body.owner_notification_required === true;

      voiceEnquiries.set(id, row);

      console.log(
        '[VOICE ENQUIRY] Saved.',
        {
          id: row.id,
          callType: row.call_type || null,
          priority: row.priority,
          personalCall: row.personal_call,
          urgent: row.urgent
        }
      );

      return res.json({
        ok: true,
        enquiry_id: id,
        enquiry: row
      });
    } catch (error) {
      console.error(
        '[VOICE ENQUIRY] Unable to save enquiry:',
        error
      );

      return res.status(500).json({
        ok: false,
        error: 'Unable to save voice enquiry.'
      });
    }
  }
);

app.get(
  '/api/admin/voice-enquiries',
  requireAdmin,
  (req, res) => {
    const enquiries =
      Array.from(voiceEnquiries.values())
        .sort((a, b) => {
          const priorityDifference =
            Number(a.priority || 99) -
            Number(b.priority || 99);

          if (priorityDifference !== 0) {
            return priorityDifference;
          }

          return String(b.updated_at || '')
            .localeCompare(
              String(a.updated_at || '')
            );
        });

    res.json({
      ok: true,
      count: enquiries.length,
      enquiries
    });
  }
);

// -----------------------------------------------------------------------------
// Telnyx Voice API webhook
// -----------------------------------------------------------------------------

function telnyxPublicKeyObject() {
  const encoded = String(env.TELNYX_PUBLIC_KEY || '').trim();
  if (!encoded) return null;

  // Telnyx exposes the Ed25519 public key as 32 raw bytes encoded with Base64.
  // Node's crypto API expects a SubjectPublicKeyInfo (SPKI) wrapper.
  const raw = Buffer.from(encoded, 'base64');
  if (raw.length !== 32) {
    throw new Error('TELNYX_PUBLIC_KEY must decode to a 32-byte Ed25519 public key.');
  }

  const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
  return crypto.createPublicKey({
    key: Buffer.concat([ed25519SpkiPrefix, raw]),
    format: 'der',
    type: 'spki'
  });
}

function verifyTelnyxWebhook(req) {
  const signature = String(req.get('telnyx-signature-ed25519') || '').trim();
  const timestamp = String(req.get('telnyx-timestamp') || '').trim();
  const publicKey = telnyxPublicKeyObject();

  if (!publicKey || !signature || !timestamp || !req.rawBody) return false;

  // Reject stale/replayed requests. Telnyx timestamps are Unix seconds.
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  const signedPayload = Buffer.concat([
    Buffer.from(`${timestamp}|`, 'utf8'),
    req.rawBody
  ]);

  let signatureBytes;
  try {
    signatureBytes = Buffer.from(signature, 'base64');
  } catch {
    return false;
  }

  return crypto.verify(null, signedPayload, publicKey, signatureBytes);
}

app.post('/api/webhooks/telnyx', (req, res) => {
  try {
    if (!env.TELNYX_PUBLIC_KEY) {
      console.error(
        '[TELNYX WEBHOOK] TELNYX_PUBLIC_KEY is not configured.'
      );

      return res.status(503).json({
        ok: false,
        error:
          'Telnyx webhook verification is not configured.'
      });
    }

    if (!verifyTelnyxWebhook(req)) {
      console.warn(
        '[TELNYX WEBHOOK] Rejected request with invalid or stale signature.'
      );

      return res.status(401).json({
        ok: false,
        error:
          'Invalid Telnyx webhook signature.'
      });
    }

    const event = req.body?.data;

    const eventId =
      String(
        event?.id ||
        req.body?.data?.id ||
        ''
      ).trim();

    const eventType =
      event?.event_type || 'unknown';

    const payload =
      event?.payload || {};

    console.log(
      '[TELNYX WEBHOOK]',
      {
        eventId: eventId || null,
        eventType,

        callControlId:
          payload.call_control_id || null,

        callSessionId:
          payload.call_session_id || null,

        from:
          payload.from || null,

        to:
          payload.to || null,

        receivedAt:
          new Date().toISOString()
      }
    );

    /*
    |--------------------------------------------------------------------------
    | Acknowledge Telnyx immediately
    |--------------------------------------------------------------------------
    |
    | Voice processing happens asynchronously after the webhook has been
    | authenticated. Telnyx should not have to wait for AI or Call Control.
    |
    */

    res.status(200).json({
      ok: true,
      received: true,
      verified: true,
      provider: 'telnyx',
      event_type: eventType
    });

    /*
    |--------------------------------------------------------------------------
    | Duplicate-event protection
    |--------------------------------------------------------------------------
    */

    if (!rememberTelnyxEvent(eventId)) {
      console.log(
        '[TELNYX WEBHOOK] Duplicate event ignored.',
        {
          eventId,
          eventType
        }
      );

      return;
    }

    /*
    |--------------------------------------------------------------------------
    | Voice lifecycle
    |--------------------------------------------------------------------------
    */

    if (eventType === 'call.initiated') {
      void handleTelnyxCallInitiated(
        eventId,
        payload
      );

      return;
    }

    if (eventType === 'call.answered') {
      void handleTelnyxCallAnswered(
        eventId,
        payload
      );

      return;
    }

    if (eventType === 'call.hangup') {
      console.log(
        '[TELNYX VOICE] Call ended.',
        {
          callControlId:
            payload.call_control_id || null,

          callSessionId:
            payload.call_session_id || null,

          hangupCause:
            payload.hangup_cause || null,

          hangupSource:
            payload.hangup_source || null
        }
      );

      return;
    }

    if (eventType === 'call.cost') {
      console.log(
        '[TELNYX VOICE] Call cost event received.',
        {
          callControlId:
            payload.call_control_id || null,

          callSessionId:
            payload.call_session_id || null
        }
      );

      return;
    }

  } catch (error) {
    console.error(
      '[TELNYX WEBHOOK ERROR]',
      error
    );

    if (!res.headersSent) {
      return res.status(500).json({
        ok: false,
        error:
          'Telnyx webhook processing failed'
      });
    }
  }
});


/*
|--------------------------------------------------------------------------
| Start server
|--------------------------------------------------------------------------
*/

app.listen(
  port,
  () => {

    console.log(
      `Fleet Office AI backend running on http://localhost:${port}`
    );

    console.log(
      `Open the contact form at http://localhost:${port}/contact.html`
    );

    console.log(
      `TikTok OAuth status: http://localhost:${port}/api/tiktok/status`
    );
  }
);
