# Fleet Office AI — Phase 7 Premium UI Refresh

## What changed
This build keeps the Phase 7 workforce/allocation functionality and replaces the SaaS presentation layer with a more structured premium operating-system interface.

### Design system
- New graphite/gold professional SaaS visual system
- Dark and light appearance modes with persisted preference
- High-DPI friendly CSS/SVG UI elements (resolution-independent rather than fixed “8K” raster UI)
- Stronger typography hierarchy, spacing rhythm and consistent radii/borders
- More restrained use of gold accents; removed the previous “card wall” feeling
- Clear primary, secondary and tertiary action hierarchy
- Hover, focus, active, loading-ready and reduced-motion considerations

### Navigation
- Persistent desktop sidebar
- Mobile slide-out navigation
- Grouped Operations / Business / Intelligence sections
- Workspace switcher presentation
- Security/MFA status in the shell
- Sticky contextual top bar
- Theme switcher, workspace search affordance, notifications affordance and profile presentation

### Command centre
- Operational metric strip
- AI Operations briefing panel
- Workspace readiness panel
- Connected enquiry → quote → booking → allocation → completion → invoice workflow visual
- Better responsive behaviour

### Business setup
- Sectioned settings architecture instead of a single undifferentiated form
- Business profile, services/brand, approvals and AI controls
- Sticky save control

### Workforce
- Dedicated compliance notice
- Better add-worker form hierarchy
- Improved team directory cards and scheduling status presentation
- Passport remains optional by default
- Australian work-right status remains part of eligibility workflow

### Jobs & allocation
- Structured work-order form
- Better allocation-pool presentation
- Eligibility action retained

### AI Operations
- Dedicated co-pilot composition experience
- Prompt shortcuts
- Clear disclosure that external AI generation still requires an approved provider

### Content studio
- Cleaner render specification interface
- High-resolution output options retained (1080p / 4K)
- UI itself uses scalable CSS/SVG elements so it stays sharp on high-DPI displays

### Connections
- Honest integration states: Setup required / Foundation / Credentials required / Approval controlled
- No provider is visually represented as live unless actually configured

## Functionality preserved
- SaaS register/login
- Tenant workspace loading
- TOTP MFA setup/verification
- Business onboarding/profile API
- Workforce CRUD foundation
- Compliance testing action
- Skills testing action
- Work-order creation
- Eligibility offering
- AI thread storage
- Video render specification storage
- Existing legacy manager link

## Audit workbook items reflected in the UI direction
The uploaded audit/roadmap confirms that the Phase 2–7 product has substantial backend depth. The visual refresh therefore focuses on information architecture and usability rather than pretending missing production integrations are complete. Missing production items from the audit (real AI provider, payments, account recovery/email verification, production hosting/HTTPS, legal pack, live VEVO integration, official channel connectors, independent security review) remain clearly outside the scope of this visual refresh.

## Run locally
1. Open `Website/backend` in a terminal.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:3000/saas/`.

Node.js 20+ is recommended by the existing backend package configuration.

## Validation performed here
- `Website/saas/app.js` passed `node --check`.
- `Website/backend/src/server.js` passed `node --check`.
- `Website/backend/src/db.js` passed `node --check`.
- Package dependency installation could not be completed in the build environment because the network operation timed out, so a full runtime test is not claimed in this document.
