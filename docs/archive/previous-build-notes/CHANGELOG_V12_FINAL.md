# Super Pro AI Office Manager — v12 Final Candidate

## Consolidated changes

This build is based on the latest v11 candidate and preserves the security, governance, onboarding, AI, workforce, Content Studio, receptionist, billing and key-control foundations already present.

### Brand and navigation
- User-facing product brand changed to **Super Pro AI Office Manager** without renaming backend route/session/security identifiers.
- New premium SP visual mark is used across the public/auth/workspace/Office Manager surfaces.
- Front-page **Explore the platform** now scrolls directly to “Everything a service business needs to operate with clarity.”
- Office Manager “Super Pro workspace” links return to the SaaS workspace without clearing the Office Manager admin-key session.
- Explicit Sign out / Lock controls remain the only intentional sign-out paths.

### 429 / interaction stability
- The overly-low broad API limiter was raised for normal interactive workspace polling.
- Authentication, business verification, support submission and AI-guide endpoints retain their own stricter dedicated limits.
- User-facing 429 errors are now explained rather than shown as raw “Request failed (429)”.
- Search/filter requests in the Office Manager are debounced to avoid request bursts.

### Historical business memory
- Added Records & Archive for imported previous conversations, enquiries, quotes, bookings, jobs, invoices, payments and campaigns.
- Unified Inbox filters by channel, customer/text search and Current vs Previous records.
- Approval Queue can display pending, approved, rejected or all approval history.
- Enquiries show repeat-enquiry count for the same customer.
- Customer 360 view combines enquiries, conversations, quotes, bookings/jobs, invoices and imported history.
- Previous invoices and completed jobs have dedicated archive views.
- Provider-native automatic history sync is prepared as a future connected-provider step; manual historical import works without provider keys.

### Marketing and channels
- Added a product-newsletter opt-in that is completely separate from Fleet Parlour customer marketing.
- Newsletter opt-in records consent and includes an unsubscribe action.
- Campaign history includes channel, audience, eligibility, status and schedule.
- Connections displays audience/engagement metrics (followers/subscribers, views, likes, comments) when authorised provider sync exists.
- AI public-comment policy supports Off, AI draft + human approval, or owner-configured safe auto-reply after an authorised live provider is connected.

### Content Studio
- Added Snapchat and X / Twitter as supported planning targets.
- Added AI Creative Director prompts for transitions, pacing, hooks, CTAs and platform-specific adaptations.
- Live trend claims remain disabled unless a real authorised trend/provider data source is connected.

### AI and multilingual access
- Multilingual / automatic language detection is explicitly promoted on the front page and registration experience.
- Workspace and Office AI Co-pilots retain multilingual voice + typing guidance.

### Help, governance and website
- Help & Governance buttons open the protected Help Desk or relevant Trust/Policy pages.
- Support case references use the new SPAI visual prefix for new cases; legacy records remain compatible.
- Website iframe dependency was replaced by a Website Control Center with reachability status and a secure “Open live website” action.

### AI receptionist
- Business-only routing remains enforced.
- Owner personal number remains server-side and private.
- Customer can choose provider default, female, male or neutral licensed synthetic voice plus locale.
- No voice-cloning/impersonation feature is enabled.

### Existing features retained
- ABN / ACN / authorised manual-review registration path.
- Email + Australian mobile OTP.
- Trial countdown, read-only restriction, retention and final restoration-window foundations.
- Stripe / PayPal / bank-payment architecture placeholders.
- Platform-operator key control and customer OAuth/consent foundations.
- Digital user manual / live location map, contextual AI help, staff chat, live status notices, premium gold interactions, governance/audit controls and responsive layouts.
