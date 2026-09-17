# Test the Premium Governance Build on Windows

## 1. Extract and open the project root
Open Command Prompt in the folder that contains `package.json`.

## 2. Create local environment file
```bat
copy .env.example .env
```

For local account-registration testing only, set:
```env
PORT=3000
NODE_ENV=development
SAAS_VERIFICATION_TEST_MODE=1
SUPPORT_MAX_FILE_MB=8
```

Do not use `SAAS_VERIFICATION_TEST_MODE=1` in production.

## 3. Install and run
```bat
npm install
npm start
```

Leave the Command Prompt open while testing.

Open:
`http://localhost:3000/saas/`

## 4. Public customer journey
Test:
- premium front page;
- typed AI Product Specialist questions;
- microphone input and spoken reply in Chrome/Edge;
- satisfaction flow;
- Trust Center, Complaints, Privacy and Terms links;
- floating `24/7 Help & complaints` button.

## 5. Help Desk tests
Submit a normal help case and confirm:
- reference is created;
- private access key is shown once;
- status can be checked with reference + access key;
- file evidence uploads;
- browser voice note can upload when microphone permission is allowed.

Submit a protected/anonymous case and confirm name is not required.

Test a complaint where `Concern involves = Manager`; it should be routed above manager level. Test `Concern involves = Owner`; it should route to the complaint-officer/dedicated escalation path.

Email/SMS/voice alerts will report `not configured` locally unless the corresponding real provider credentials and escalation contacts are configured.

## 6. Account / workspace tests
Complete the local ABN/email/mobile test registration and sign in. Then open `Trust & governance` in the workspace.

Confirm:
- industry profile displays;
- policies appear and can be acknowledged;
- a normal employee role does not receive senior audit/ledger data;
- senior authorised roles receive permitted complaint/security/audit information;
- confidential/conflict cases are filtered according to role;
- audit events display linked hashes.

## 7. Connections Hub
Open Connections and review the self-service provider cards. Saving an account label/capability preference must not ask the customer for developer API secrets and must not pretend the provider is fully connected before OAuth/provider authorisation succeeds.

## 8. Production reminder
Local SQLite/local files are for testing. Follow `PRODUCTION_SECURITY_CHECKLIST.md` before any real customer launch.
