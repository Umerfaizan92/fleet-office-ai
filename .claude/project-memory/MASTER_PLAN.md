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
| P02 | Enterprise infrastructure and security | COMPLETED | P00, P01 | `5cf7377`, now included on GitHub |
| P03 | Cinematic design system and frontend transformation | COMPLETED | P02 | `6b387fd`, `6a5ddc8` |
| P03.5 | Persistent checkpoint and resume system | COMPLETED | none | included in consolidated branch |
| P04 | Subscriber Business OS and Founder Console | COMPLETED | P03 | `f1cfa16` and preceding Phase 04 commits |
| P05 | AI operations and human governance | COMPLETED | P04 | `2863893`, `605edcd` |
| P06 | SEO, Google and website intelligence | COMPLETED | P03, P04 | `426b472`, `2519c2c` |
| P07 | Communications and campaign automation | COMPLETED | P04, P05 | `4af3df6`, `ed9de92` |
| P08 | Finance, payments and compliance automation | COMPLETED | P04 | `e5c8c8c` |
| P09 | Backup and reliability engine | COMPLETED | P02 | `96bf844` |
| P10 | Final QA, security audit and release candidate | TESTING | P02–P09 | `7074e36`, `9e895b8`; recovery T-063 verifies combined tree |
| Release | Consolidation, correct-source CI and isolated preview | IN_PROGRESS | P10 | T-062, T-063; production release remains pending |

Correction during recovery: the previous table stopped at Phase 03 and incorrectly described later prompts as not received. The owner's eleven prompts (00–10) are present in `consolidated-improvements-2026` at `24dd8c7`. Completion above records implemented phases and their historical evidence; it does not certify external providers or production deployment. Outstanding integration limits remain in PENDING_TASKS.md and docs/release/KNOWN_ISSUES.md.

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
