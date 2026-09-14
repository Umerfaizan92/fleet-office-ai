# Fleet Office AI — Premium UI V2

## What changed
- Authentication now opens on **Sign in** first with a clear **Create account** alternative.
- Registration requires password + confirm password on both client and server.
- Registration no longer creates an authenticated workspace session automatically. After a successful account creation, the interface returns to Sign in and pre-fills the email address.
- The secure workspace is shown only after successful authentication.
- Password-match feedback, stronger focus states, keyboard-visible accessibility, and clearer security messaging were added.
- The primary SaaS shell received additional typography, spacing, panel, navigation, button, form, hover, and high-DPI refinements.
- External Google Font loading was removed from the SaaS shell so the interface uses fast system UI fonts and remains consistent offline/local.
- Legacy Manager was visually rebuilt to match Fleet Office AI: same background, gold accent, cards, tables, fields, navigation language, interactions, and responsive behaviour.
- Legacy Manager now clearly links back to the Primary Workspace, while retaining its separate admin-key protection and existing legacy endpoints.
- Existing Phase 7 workforce, job allocation, MFA, business setup, AI-thread storage, video specifications, and legacy Office Manager functionality were preserved.

## Security behaviour
1. Create account.
2. Server verifies both submitted passwords match and requires a minimum 12-character password.
3. Account is created without opening a SaaS session.
4. User is moved to Sign in.
5. Only successful login creates the HttpOnly, SameSite=Strict session cookie.
6. MFA is still enforced for users who enable it.

## Local live test
From `Website/backend`:

```bash
npm install
npm start
```

Open:
- Primary workspace: `http://localhost:3000/saas/`
- Legacy operations manager: `http://localhost:3000/office/`

### Authentication test
- Confirm Sign in is the default tab.
- Switch to Create account.
- Try mismatched passwords: submission must be blocked.
- Create a valid account with matching passwords.
- Confirm the interface returns to Sign in and pre-fills the new email.
- Enter the password and sign in.
- Confirm the entire access screen disappears and only the authenticated workspace remains.
- Log out and confirm the workspace disappears and Sign in returns.

### Visual test
Check at 100%, 125%, 150% browser/Windows scaling and at desktop/tablet/mobile widths. The interface is CSS/vector-driven; UI chrome remains resolution-independent on high-DPI and 4K displays.

## Validation completed in build environment
- `node --check Website/saas/app.js` — passed.
- `node --check Website/backend/src/server.js` — passed.
- `node --check Website/office/office.js` — passed.
- SaaS and Legacy HTML parser checks — passed.
- Full dependency/runtime launch was not completed in the build environment because `npm ci` hit the environment network timeout. No fake runtime-pass claim is made.
