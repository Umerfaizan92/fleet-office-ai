# Notifications, delivery tracking and recovery

## What changed

- Notification bell stays visible on mobile. Personal alerts are on by default. Each user/business has saved mute, sound, browser and urgent-SMS preferences. Browser permission is requested only by the Enable control. The app polls visible sessions every five seconds; staff chat checks every three seconds. Closed-browser push delivery is not implemented.
- Event notifications cover worker creation, team invitation creation/acceptance, role authorisation, document uploads, onboarding-link opening/submission, incoming inbox messages, hiring applications and outbound provider results. Tenant audiences remain enforced: hiring details and delivery logs are owner/admin only, staff messages stay within their business. Cross-tab broadcasts are now bound to the organisation.
- Staff chat renders sender identity immediately, labels Sent / Delivered / Seen from real receipts, and marks a thread seen only while it is open and the document visible. The team roster is bounded and the status editor collapses separately. Existing status/reason/return time is loaded before editing.
- Team invitations have explicit email/SMS sending, mobile and short-message fields. Hiring advert invitations can be sent from an approved advert through email and optional SMS. Send results distinguish provider acceptance from confirmed delivery. Hiring send requests are idempotent; drafts cannot be sent.
- Recovery persists the issuing verification provider. Telnyx Verify codes are verified with Telnyx instead of compared with an unrelated local OTP. Direct-SMS/email codes retain hashed verification. Pasted whitespace, separators and Urdu/Arabic digits are normalised; 4–8-digit provider codes are supported, and codes are consumed once. Password reset invalidates existing sessions.
- Shared dark/gold email frames include business identity where applicable, Help, Terms, Privacy and Super Pro attribution. Customer replies now have branded HTML as well as plain text. Privacy and terms describe receipt signals and follow-ups, and legal acceptance advances to terms-2026-10-28.

## Receipt integration

Notifications → Delivery activity shows accepted, sent, delivered, email-open signals, replies, failures and follow-up state. Common branded lifecycle emails, team/hiring/workforce invitations, approved customer email/SMS replies and payment messages provide explicit tenant context to the delivery ledger. Security verification emails are excluded from business delivery logs and automatic follow-ups. Operator-wide digest messages have no tenant delivery record.

- Resend: configure RESEND_WEBHOOK_SECRET and subscribe the HTTPS endpoint `/api/webhooks/communications/resend` to email.sent, email.delivered, email.opened, email.failed, email.bounced, email.complained, email.suppressed and email.received as applicable. Open tracking must be enabled at the provider/domain. SDK signature validation rejects forged/stale events; IDs deduplicate replays. Delivered means accepted by the receiving mail server, not a person's read confirmation.
- Telnyx: retain TELNYX_PUBLIC_KEY and point the messaging profile to the existing `/api/webhooks/telnyx`. It now handles message.sent / message.finalized delivery evidence as well as existing inbound messages/calls. `/api/webhooks/communications/telnyx` is also available for delivery-only routing. Ordinary SMS has no reliable read receipt.
- Replies: existing signed inbound email/Telnyx/social paths route through active tenant channel addresses. Signed Resend email.received also retrieves inbound content and routes only when the recipient matches exactly one business's active email channel. Provider DNS/inbox routing must be configured; replies outside the connected inbox cannot be detected.

## 24-hour follow-ups

One follow-up email is queued for approved customer emails and explicitly enabled hiring invitations. The server checks once per minute and atomically claims due work. A recorded reply cancels it; failures suppress it; an owner can disable the workflow from Delivery activity. Delivery acceptance is required before a follow-up is scheduled. Reset/verification codes, private team-access tokens, receipts and notices that do not require a response are excluded. No AI-generated unapproved content is auto-published. A send that is interrupted after claim is not automatically replayed, avoiding duplicate mail.

## Validation / deployment

Tests cover provider/local OTPs, real HTTP reset and session revocation, notification defaults and unread totals, tenant/role restrictions, draft approval, idempotent invitation sending, signed receipt rejection/replay handling, status ordering, follow-up timing/cancellation and owner disable. Browser checks exercise preferences, both-session chat receipts, sender identity and compact availability plus the existing portal routes and responsive controls.

No production message was sent and no provider secret was read or added to GitHub. Production email/SMS delivery, provider webhooks and Asman Aziz's account still require a live smoke test after deployment. Render is not connected in this session; GitHub CI/merge is not deployment confirmation.
