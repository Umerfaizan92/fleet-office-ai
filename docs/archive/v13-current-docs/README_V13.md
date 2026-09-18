# Super Pro AI Office Manager — v13 Final Candidate

## What this build consolidates

This v13 candidate preserves the v12 security, governance, registration, historical-record, customer-360, newsletter, Content Studio, connections and Office Manager work and adds the latest test corrections.

### UX corrections
- Logged-in workspace brand returns to the signed-in dashboard instead of the public introduction.
- No navigation control intentionally signs a user out; only the explicit Sign out control ends the SaaS session.
- Floating Workspace Staff Chat now has Minimise and Close controls, closes with Escape, and keeps the full message composer and Send button visible.
- Office Manager full Staff Chat has Minimise and Close controls and Escape navigation.
- Office Manager header actions wrap responsively instead of being clipped.
- Product Guide voice notice is moved away from the Send control.
- Universal footer shows copyright, AI disclosure, security controls and legal/trust links on every SaaS/Office surface.

### Product Guide multilingual voice
- Reply language can be Auto or selected manually.
- Voice preference can be Auto, Female or Male where compatible browser/provider voices exist.
- Text language and spoken language are matched.
- Urdu uses `ur-PK` and will only use an Urdu-compatible browser voice. If no compatible voice exists, audio is not played using an English voice; the text reply remains available with a clear notice.
- Language matching takes priority over male/female preference.

### Fleet Parlour AI Receptionist
- Business-only workflow; personal/family routing is excluded.
- Fleet Parlour is currently mobile/on-site only. The assistant must not offer a workshop/drop-off location.
- Routine enquiries are captured rather than transferred.
- Protected transfer is only for a genuine business caller explicitly asking for Faiz/Faz/Faizan/the owner, or for a critical active-business safety/security situation.
- Private transfer destination is server-side only.
- Voice enquiries are persisted in SQLite and can notify configured email; urgent/owner-attention enquiries can additionally notify configured SMS.
- The assistant must never claim forwarding/notification success until the relevant tool reports success.

### AWS readiness
The build contains AWS-ready configuration fields for S3/KMS/backup planning. It does **not** claim AWS certification. AWS certification/compliance badges must only be displayed after the deployed environment and organisation have the relevant verified status.

## Important production principle
Provider secrets belong in `.env` for local development only, and in a managed secret store/IAM/KMS-based deployment in production. Customer workspaces must never receive platform master secrets.
