# How to test this build on Windows

## 1. Extract the ZIP

Extract the complete ZIP to a normal folder, for example:

`C:\Users\umer_\Desktop\gds-wizard-premium-ai-entry`

**Important:** In this version `package.json` is in the project root. Do not go into a `backend` folder.

## 2. Create the local `.env`

In the extracted root folder, copy `.env.example` and rename the copy to exactly `.env`.

For local registration testing, make sure it contains:

```env
PORT=3000
NODE_ENV=development
SAAS_VERIFICATION_TEST_MODE=1
```

You can leave `ABR_GUID`, Resend and Telnyx messaging credentials empty for the local test flow.

## 3. Install and start

Open Command Prompt in the extracted root folder and run:

```bat
npm install
npm start
```

Keep this Command Prompt open while testing.

You should see:

`Super Pro AI Office Manager backend running on http://localhost:3000`

## 4. Open the product

Open Chrome or Edge:

`http://localhost:3000/saas/`

Hard refresh after code/config changes with `Ctrl + Shift + R`.

## 5. Test the new customer experience

On the introduction page:

- Ask the AI Product Guide questions by typing.
- Allow microphone access and test voice input.
- Toggle spoken AI replies on/off.
- Click the feature and industry “Ask AI” actions.
- After an answer, test **Yes, I’m satisfied** and **I want to ask more**.
- Confirm Create Account / Sign In / Keep Talking routes work.

## 6. Test secure account creation

For the Fleet Parlour local test, you can use the ABN already used during development:

- Business: `Fleet Parlour`
- ABN: `89632664635`
- State: `WA`
- Postcode: `6164`

Click **Check business identity**. In local test mode it should show `LOCAL TEST MODE` after validating the ABN checksum.

Enter owner details, an Australian mobile number, matching 14+ character passwords and accept Terms/Privacy. Click **Verify & continue**.

## 7. Test email + SMS verification

Local test mode displays both temporary six-digit codes on the verification page. Try a wrong code once, then enter the correct email and SMS codes.

The workspace must not be created until **both** codes are correct.

## 8. Test sign-in and guided onboarding

Sign in with the newly verified email and password.

On first login confirm the guided tour walks through:

- Command Centre
- Business Setup
- People & Workforce
- Jobs & Allocation
- AI Operations
- Content Studio
- Connections
- Plans & Billing

Use the `?` button later to replay the tour.

## 9. Test business customisation

In Business Setup, try an industry template such as:

- Trades & field services
- Accounting & professional services
- Salon & hairdressing
- Real estate & property services
- Mobile & appointment services
- Custom service business

The template should suggest services, brand voice, AI instructions and workflow guidance without overwriting fields you already filled in.

## 10. Test AI help inside the workspace

- Click **Ask or search workspace** and type natural requests such as `add an employee`, `open jobs`, `connect WhatsApp`, or `show Content Studio`.
- Test the **Speak** button in search.
- Open the floating **Ask GDS** co-pilot and test both typing and voice.

## If the browser says “Request failed”

First confirm the terminal running `npm start` is still open. Then test:

```bat
curl.exe -i http://localhost:3000/api/health
```

If the server is not reachable, start it again with `npm start` from the project root.
