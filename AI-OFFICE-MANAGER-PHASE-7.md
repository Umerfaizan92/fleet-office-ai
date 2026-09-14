# Fleet Office AI — Phase 7 Workforce & Allocation Test Build

## Added in this build
- SaaS command-centre dashboard with live workforce/allocation metrics.
- Tenant-scoped Worker entity; owner is automatically represented as an active Level 7 worker for new workspaces.
- Employment types: full-time, part-time, casual, fixed-term, apprentice, contractor, subcontractor, temporary and owner.
- Australian work-right status model with scheduling gate.
- Passport is optional by default.
- Visa/VEVO evidence is required in the checklist for visa-holder onboarding.
- Contractor/subcontractor onboarding checklist adds ABN and insurance requirements.
- Worker onboarding progress and Approved for Scheduling gate.
- Worker skills matrix with competency states.
- Work orders with required worker count, level and skills.
- Eligibility engine filters workers by active status, availability, scheduling approval, minimum level and verified competency.
- Job-offer pool data model and offer/accept/decline API foundation.
- Tenant-scoped SaaS audit event log for workforce and allocation changes.
- Professional Workforce and Job Pool test UI.

## Safety / legal implementation boundary
This test build models Australian work-right and workforce compliance workflows; it does not claim to perform an official VEVO check. Production VEVO verification requires an approved/authorised integration or verified evidence workflow. Legal employment agreements should use lawyer-reviewed, version-controlled templates before commercial launch.

## Existing Phase 2–6 features preserved
Existing website, enquiries, CRM/quotes/bookings, office manager, approvals, job media, invoicing/payment records, marketing/content, SaaS authentication, MFA, onboarding, AI thread storage, video render specs, social foundations and subscription schema are retained.

## Start
1. Open `Website/backend` in Terminal/Command Prompt.
2. Run `npm install`.
3. Copy/configure `.env` as required by the existing Phase 6 setup.
4. Run `npm start`.
5. Open `http://localhost:3000/saas/`.

## Test flow
1. Create a new secure workspace.
2. Open Workforce. The workspace owner should already exist as an active worker.
3. Add a worker. Choose visa holder to see the work-right workflow state.
4. Use `Test: approve compliance` only for local workflow testing.
5. Add a skill such as `Truck Polishing` with `competent` or above.
6. Create a work order requiring the same skill and a suitable level.
7. Click `Find eligible workers`.
8. Confirm only workers who are active, available, compliance-approved, sufficiently levelled and skill-qualified are offered the job.

## Not represented as live
External AI generation, official VEVO lookup, production e-signature, live billing, live publishing and provider-dependent communication integrations remain configuration/integration work and are not falsely presented as live.
