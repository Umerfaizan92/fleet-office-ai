# Install & Test — Super Pro AI Office Manager v13

## Windows local test
1. Extract the ZIP to a normal folder.
2. Open Command Prompt in the extracted root folder (the folder containing `package.json`).
3. Run:
```bat
copy .env.example .env
npm install
npm run validate:final
npm run generate:admin-key
```
4. Copy the generated key into `.env` as `ADMIN_API_KEY=...`.
5. For local testing set:
```env
PORT=3000
NODE_ENV=development
PUBLIC_BASE_URL=http://localhost:3000
SAAS_VERIFICATION_TEST_MODE=1
```
6. Start:
```bat
npm run check:config
npm start
```
7. Keep the Command Prompt open and browse to:
```text
http://localhost:3000/saas/
```

## Important
- `MISSING` in `npm run check:config` is expected until that provider is connected.
- Never paste real secrets into chat or browser forms.
- Only the explicit Sign out control should end the SaaS session.
- Use `SAAS_VERIFICATION_TEST_MODE=1` only for local testing; set it to `0` in production.
