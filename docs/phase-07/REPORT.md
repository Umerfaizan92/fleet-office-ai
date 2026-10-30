# Phase 07 report: unified communication and campaign automation

Branch `phase-07-communications`, stacked on `phase-06-seo-platform` (PR #36). The prompt is in `PROMPT.md`.

## Most important limitation first

The test machine cannot reach Telnyx or Resend. Every provider request was tested against a local stand-in that
records the requests. The webhooks were signed with Ed25519 exactly as Telnyx signs them. None of this has been tried
against the live providers yet. In particular:

- The Telnyx Call Control parameter names for `ai_assistant_start`, `transcription_start` (engine, tracks) and
  `record_start` follow Telnyx's documentation but have not been sent to the live API. Place a test call on a staging
  number before relying on transcripts, transfer or voicemail.
- Delivered and opened figures, and bounce and complaint suppression, depend on Resend webhooks reaching `/api/webhooks/communications/resend` (needs `RESEND_WEBHOOK_SECRET`). Until they do, campaigns
  show only sent, failed, clicked (Super Pro's own redirect), replies and unsubscribes.

## Set-up needed (owner)

| Setting | Purpose |
|---|---|
| `SUPERPRO_ABN` or `SUPERPRO_POSTAL_ADDRESS` | Shown in the footer of Super Pro newsletter emails. Platform campaigns cannot be submitted without one. |
| `PLATFORM_MAIL_FROM` | Sender for Super Pro newsletters, kept separate from business senders and from account emails. |
| `TELNYX_AI_ASSISTANT_ID` | Already used. The assistant now receives each business's instructions on every call. |
| `TELNYX_TRANSCRIPTION_ENGINE`, `TELNYX_TRANSCRIPTION_LANGUAGE` | Optional. Default to `B` and `en`. |
| `TELNYX_TTS_VOICE` | Optional voice for voicemail greetings and apologies. |
| `SMS_COST_CENTS` | Optional. Used for the cost estimate shown before an SMS campaign is approved. |

Each business needs an ABN or address in its business details before its email campaigns can be submitted, and needs
the Call Handling page set up (transfer number and transcription notice).

## What was built

### Unified Inbox (Communications > Unified Inbox)
- Folders: Inbox, Sent, Drafts, Scheduled, Archived, Failed and Spam. Views: Everything, Customers, Enquiries,
  Invoices and Marketing. Search across names, numbers, emails and subjects.
- One list holds SMS, email, WhatsApp, calls and voicemail, website forms and social messages, plus Email Centre
  mail and campaigns in the outgoing folders.
- The AI runs on each conversation. It sorts the message into a type, judges the tone, writes a summary and reads out
  the details. It also scores the lead (labelled as a Super Pro estimate) and flags escalations: complaints, legal or
  regulator mentions, safety words and high-value customers. It finds possible duplicates and suggests follow-ups.
  It shows upcoming appointment reminders and whether the reminder rule is on.
- Conversations can be linked to customers (existing match or a new customer), linked to enquiries (create one) and
  linked to invoices.
- Replies can be written by hand or drafted by AI from business details. Every reply becomes an approval request.
  A reply can be scheduled; it is sent at that time only after approval. After approval it is sent from the inbox.
- A STOP reply suppresses the number at once. Escalations notify the owner. A new message raises the
  `inbox.message` automation trigger.
- The existing omnichannel inbox (Inbox, all channels) is unchanged.

### Website contact forms
- The Website Builder contact section has a new option: "Show a contact form".
- Each submission creates an enquiry and an inbox conversation. Marketing consent is recorded only when the visitor
  ticks the box, with the form as evidence.
- A hidden field catches bots, and the form is rate-limited. The form works without JavaScript and keeps the page's
  `form-action 'self'` CSP.

### Voice (Communications > Call Handling)
Audit of the previous Telnyx flow, which is now replaced by `src/comms/voice.js`:

| Before | Now |
|---|---|
| Answered every inbound call, even to numbers no business owns | Calls to unknown numbers are rejected; calls to a business number are routed to that business |
| One shared assistant with no business context | The assistant gets the business's name, hours, services and rules on every call |
| Answer, then assistant, in sequence; no retry | Answer is retried on temporary errors. Transcription and assistant start in parallel to cut the delay before the greeting |
| No interruption setting | Callers can interrupt the assistant |
| No transcript | Final transcript segments are stored. Callers hear a "this call is transcribed" notice first; without the notice turned on, no transcript is kept |
| No transfer to a person | Transfer on request, or as a fallback, to the business's transfer number during opening hours. Staff can also press "Transfer to me" on a live call |
| No voicemail | Greeting, then recording; the recording link is stored |
| A failure was only written to the server log | Fallback chain: transfer, then voicemail, then a short apology and hang up. Each failed step is recorded on the call and shown in Call Handling |
| Duplicate webhooks could act twice | Events are de-duplicated in the database, so restarts do not repeat actions |
| Generic call log | Each call writes a Call, Missed call or Voicemail entry to the inbox with its transcript and summary, and notifies staff |

The previous handlers (`handleTelnyxCallInitiated` and `handleTelnyxCallAnswered` in `server.js`) are left in place
but unused, so they can be restored quickly if the live test shows a problem.

### Campaign Studio (Content & Growth > Campaign Studio)
- Email, SMS and social campaigns, with segments by customer status, source, area, service and job dates.
- Audience preview shows how many people are eligible and why others were left out: no consent, unsubscribed, or
  no address.
- Compliance checks run before a campaign can be submitted:
  - email needs a subject and the business's ABN or address;
  - the email footer and List-Unsubscribe and One-Click headers are added automatically;
  - SMS messages start with the business name and end with "Reply STOP to opt out".
- Recommendations come from the campaign's own text. A tip is marked as measured only when it is based on the
  business's own past results.
- Submitting a campaign creates a Level 3 automation run (`send_campaign`). Nothing is sent until an authorised
  person approves it. Editing a campaign after approval cancels that approval.
- Approved campaigns are sent in batches by the job queue, at the scheduled time when one is set. Sending respects
  the automation pause.
- Approved social campaigns go into the content calendar as approved posts.
- Results tracked per campaign: sent, delivered, opened, clicked, replied, unsubscribed, failed, and enquiries in the
  following 30 days.
- The existing Campaigns page is unchanged.

### Consent & Unsubscribes (Content & Growth)
- Record consent with evidence, or record that consent was withdrawn. Add addresses to a do-not-contact list.
- Lists of consents and suppressions, each showing its source: website form, staff, STOP reply, unsubscribe link,
  one-click, bounce or complaint.
- Public unsubscribe page at `/u/<token>`. It asks before unsubscribing and supports one-click POST.

### Founder separation
- Founder Console > Super Pro marketing > Newsletter campaigns.
- These campaigns are email only and go only to subscribed platform newsletter subscribers. They are sent from
  `PLATFORM_MAIL_FROM` and need platform approval.
- The communications overview shows counts only and states that business conversations are not shown.
- Business routes never reach platform rows, and platform routes never reach business customers.

## Existing bug fixed

The webhook routes `/api/webhooks/communications/resend` and `/api/webhooks/communications/telnyx` never kept the raw
request body. Signature checks therefore always failed: every signed Resend delivery receipt was rejected with 401,
so delivered and opened statuses were never recorded. The raw body is now kept for these routes too. A test signs a
Resend receipt exactly as Resend does. Hard bounces and spam complaints now also suppress the address for marketing.

## Tests

| Suite | Result |
|---|---|
| `scripts/comms.test.mjs` (6 end-to-end tests: inbox, contact form, voice, campaigns, founder separation, provider receipts) | 6/6 |
| `npm run test:comms-ui` (10 browser checks incl. axe, phone and iPad fit, Founder Console) | 10/10 |
| Full suites | see the PR description |

## Not done / follow-ups
- Live Telnyx and Resend verification (see above).
- WhatsApp and social replies are approved and saved, but sending them directly needs those providers' send APIs
  connected. Until then staff copy the reply into the app, as before.
- Consent is not imported in bulk. Add consent one record at a time, or through website forms.
