# Master plan: Super Pro AI Office Manager

Durable roadmap. Phases run in order unless a dependency says otherwise. A phase is DONE only when its
deliverables are committed and its tests pass (see COMPLETED_TASKS.md for evidence). Status values:
NOT_STARTED, IN_PROGRESS, BLOCKED, TESTING, COMPLETED.

## Product

- **What:** an AI office manager for Australian service businesses (trades, clinics, retail, agencies, cleaning).
  Customers and jobs, money, communications, growth, people and compliance, AI drafts. Every consequential action waits
  for a person to approve it. Tagline: "Your office runs. You approve."
- **Who:** owners of small service businesses and their staff (owner, admin, manager, worker, contractor), plus the
  founder who operates the platform through the Founder Console.
- **Goal:** visitors start a 14-day free trial; the platform matches or beats Salesforce, HubSpot and monday.com for
  this market without copying them.
- **Three surfaces:** public website (`/`, `saas/site/`), subscriber Business OS (`/saas/workspace.html`),
  Founder Console (`/office/`).
- **Production:** Render web service `super-pro-ai-office-manager` (manual deploys). Repository:
  `Umerfaizan92/fleet-office-ai`.

## Phases

| ID | Phase | Status | Depends on | Branch / commit |
|---|---|---|---|---|
| P00 | Repository discovery and preservation audit | COMPLETED | none | report delivered in chat (no repo changes) |
| P01 | Competitor intelligence and master blueprint | COMPLETED | P00 | report delivered in chat (no repo changes) |
| P02 | Enterprise infrastructure and security | COMPLETED (not yet on GitHub) | P00, P01 | `phase-02-infrastructure-security` / `5cf7377` |
| P03 | Cinematic design system and frontend transformation | COMPLETED (not yet on GitHub) | P02 | `phase-03-cinematic-design` / `6b387fd`, `6a5ddc8` |
| P03.5 | Persistent autosave, checkpoint and resume system | IN_PROGRESS | none (process) | `phase-03-cinematic-design` |
| P04 | Subscriber Workspace (Business OS) | NOT_STARTED | P03 | prompt not yet received |
| P05 | Founder Console | NOT_STARTED | P03 | prompt not yet received |
| P06 | AI automation and human approvals | NOT_STARTED | P04, P05 | prompt not yet received |
| P07 | Website automation, SEO and Google integrations | NOT_STARTED | P03 | prompt not yet received |
| P08 | Communications and marketing | NOT_STARTED | P04, P06 | prompt not yet received |
| P09 | Payments and accounting | NOT_STARTED | P04 | prompt not yet received |
| P10 | AWS S3 storage and automated backups | NOT_STARTED (foundations in P02) | P02 | prompt not yet received |
| P11 | Security review | NOT_STARTED (foundations in P02) | P02 | prompt not yet received |
| P12 | Testing programme | NOT_STARTED (suites exist, see PROGRESS.md) | all feature phases | prompt not yet received |
| P13 | GitHub workflow (branches, CI, pull requests) | NOT_STARTED (CI files added in P02) | P02 | prompt not yet received |
| P14 | Render deployment and staging | NOT_STARTED (plan in docs/infrastructure) | P02, owner approval | prompt not yet received |

Phase numbers after P03 are provisional: the owner sends each phase prompt; when one arrives, record its full text in
`PENDING_TASKS.md` before starting and renumber here if needed.

## Standing rules (never change without the owner's explicit approval)

1. No destructive changes, database resets, credential rotation, deploys or infrastructure changes.
2. Never claim a feature exists unless verified in the repository or connected environment.
3. Never expose credentials or delete production data. Secrets are "[stored separately]", never in the repo.
4. Preserve the current Render deployment (`render.yaml`) until a tested migration is approved.
5. Never trust a client-supplied `workspace_id`; tenancy comes from the server session.
6. Never assume backup credentials are primary storage credentials.
7. Every existing button, menu, link, form, route, API endpoint and element ID keeps working.
8. Do not rewrite the frontend just to adopt a library. Avoid copying competitor intellectual property.
9. Do not touch the Fleet Parlour website.
10. No invented testimonials: only approved entries in `saas/content/testimonials.json`; examples are labelled.
11. Do not push, force-push, rewrite history or delete branches unless the owner authorises it.

## Owner preferences

- Owner: Faizan. Always reply in English (he often writes in Hindi).
- Every page must fit phone, iPad and laptop. No busy or looping animation.
- He pushes from Windows PowerShell; work is delivered as a git bundle plus patch when the session cannot push.
- He sends work as phase prompts; run each phase fully with the tools available, then report plainly.
