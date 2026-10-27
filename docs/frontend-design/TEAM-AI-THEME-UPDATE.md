# Team access, AI conversation and theme follow-up

This follows merged cinematic navigation PR #24, preserving its motion and existing palette.

## Changes

- People → Staff Accounts & Roles now explains the profile → invitation → authorisation sequence and allows the owner to change admin, manager, employee or contractor authority. The server binds changes to the owner's business, rejects owner transfer/demotion, audits changes and reads membership authority on subsequent requests. Scheduling eligibility is independent.
- The Home Ask AI command previously submitted the senior-only saved operational task form. It now opens the conversational co-pilot for employees and owners. Durable task permissions remain restricted. Product context is bounded to the server's question limit.
- Fixed an undefined recording status variable. Closing AI, leaving the AI view or unloading invalidates pending playback and recording callbacks. Cancelled microphone permissions release newly granted tracks; cancelled recordings do not transcribe or send a new question. Normal microphone stop still finishes transcription.
- Business AI and founder Office AI expose SVG speaker/mute controls. Founder AI gains optional spoken replies (muted initially). Late answers cannot restart closed panels.
- Shared semantic surface colours cover chat, AI, support and secure invitation/onboarding controls. Mobile co-pilot header controls wrap; light-mode owner badges use readable gold.
- Removed partial primary/secondary colour pickers from Business Setup. Display name, logo and appearance mode remain. Existing backend branding values and tenant email identities remain compatible.
- Secure join page has the shared brand and clear steps. Verification, workforce onboarding, support escalation and receptionist notification emails now use the common HTML frame and retain plain text. All common-frame emails share the platform's dark/gold layout; tenant identities remain their own. No production email was sent during testing.

## Verification and limits

Runtime security checks cover owner-only role edits, cross-business denial, owner protection and immediate downgrade. Browser checks use a throwaway invited employee, the actual Home Send control, delayed playback cancellation, light/dark layouts and both portals' routes. Voice tests cover buffered audio, provider aborts, late blobs and pending microphone permission. Email checks cover escaping, safe actions and readable custom-colour buttons.

Production provider credentials and Asman Aziz's account are not available in the local test environment. Browser employee guidance is verified with the product-knowledge fallback; live model, voice-provider and real inbox delivery need a deployed smoke test. Render is not connected in this session, so GitHub merge alone is not proof that the new release is live.
