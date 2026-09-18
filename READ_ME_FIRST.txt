SUPER PRO AI OFFICE MANAGER — UNIFIED FINAL RELEASE
18 SEPTEMBER 2026

This is the single merged release intended to replace the separate working ZIPs/branches for deployment testing.

MERGED SOURCE LINES
- super-pro-v15-cleanup
- super-pro-v15-registration-fix
- super-pro-v15-persistent-session
- super-pro-v15-public-guide-fix
- super-pro-v15-live-test
- protected v15 final candidate and v14 final baseline were audited for missing paths

IMPORTANT
- Real API keys/secrets are NOT included.
- Do not commit .env, databases, uploads, logs, or provider secrets to GitHub.
- Use .env.example as the template.
- Approval/governance controls are intentionally retained.

QUICK LOCAL TEST (WINDOWS CMD)
1. Extract this ZIP.
2. Open Command Prompt in the folder containing package.json.
3. Run:
   copy .env.example .env
   npm install
   npm run validate:final
   npm run quality:check
   npm run generate:admin-key
4. Put the generated key into .env as ADMIN_API_KEY=<your private key>.
5. For local testing make sure:
   PORT=3000
   NODE_ENV=development
   PUBLIC_BASE_URL=http://localhost:3000
   SAAS_VERIFICATION_TEST_MODE=1
6. Run:
   npm run check:config
   npm start
7. Open:
   http://localhost:3000/saas/

READ NEXT
- docs/current/FINAL_MERGE_AUDIT_2026-09-18.txt
- docs/current/INSTALL_AND_DEPLOY_V15.txt
- docs/current/FINAL_V15_TEST_CHECKLIST.txt
- docs/reference/PRODUCTION_SECURITY_CHECKLIST.md
