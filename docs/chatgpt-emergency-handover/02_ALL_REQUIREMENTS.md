# All requirements: where the original prompt text is

| Prompt | Exact text saved? | Location |
|---|---|---|
| Phase 00 Discovery and preservation | **No**: given in chat only | Summary in `.claude/project-memory/COMPLETED_TASKS.md` (T-000) |
| Phase 01 Competitor analysis and blueprint | **No**: chat only | COMPLETED_TASKS.md (T-001) |
| Phase 02 Security, DB, infrastructure, AWS S3 | **No**: chat only | COMPLETED_TASKS.md (T-002), `docs/infrastructure/` |
| Phase 03 Cinematic 3D design | **No**: chat only | COMPLETED_TASKS.md (T-003–T-006), `docs/design/DESIGN_SYSTEM.md` |
| Phase 03.5 Autosave and resume | **No**: chat only | `docs/process/`, `.claude/project-memory/` |
| Phases 04–10 | **Yes**, verbatim | `docs/phase-04/PROMPT.md` … `docs/phase-10/PROMPT.md` |
| Final consolidation prompt | Yes (below) | This file |
| Emergency handover prompt | Yes | `19_CHATGPT_RESUME_INSTRUCTIONS.md` summarises it |
| Six earlier design prompts | **No** exact text; delivered work documented | `docs/frontend-design/{BENCHMARK,CINEMATIC-UPDATE,COMPACT-LAYOUTS-PRESENCE,NOTIFICATIONS-DELIVERY-RECOVERY,TEAM-AI-THEME-UPDATE}.md`, `docs/restructure/MASTER-V2-STATUS.md` |

The exact wording of the Phase 00–03 prompts and the six earlier prompts **cannot be recovered** from this workspace.
Ask the owner for them if exact wording matters.

## Final consolidation prompt (key requirements)
- Recover history; verify Phases 00–10 and the six earlier prompts against the code; do not assume completion.
- Preserve every feature. Every button, form, menu, workflow, API and permission must be tested or reported as unverified.
- Use one release branch, `consolidated-improvements-2026`. Keep one repository root with organised folders.
  Do not delete historical branches without approval.
- Run dependency, lint, type, build, unit, integration, API, auth, RBAC, tenant-isolation, automation, end-to-end,
  accessibility, responsive and security checks.
- Commit, push without force, record the SHA, no secrets.
- Write `docs/release/` FEATURE_INVENTORY, PHASE_COMPLETION_MATRIX, ARCHITECTURE, INTEGRATIONS, SECURITY_AUDIT,
  TEST_RESULTS, KNOWN_ISSUES, DEPLOYMENT_PLAN, ROLLBACK_PLAN.
- STOP and request approval before production deployment.

## Standing rules
Never trust a client-supplied workspace_id. Backup credentials must not be the primary storage credentials. No
invented testimonials. Do not touch the Fleet Parlour website. Pages must fit phone, iPad and laptop. No looping
animation. Owner approval for refunds and transfers, campaign launches and production deployment; restricted,
explicit authorisation for deleting subscriber records.
