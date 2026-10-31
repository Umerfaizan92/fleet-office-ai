# Navigation validation

Baseline: live Render deploy `dep-dbif0ec9v7es739rf0ug`, source `3edc118051aac8d3aa18fd76ae1da0bdc0240680`. Rechecked during implementation. No production deployment, data writes or provider changes were performed.

All workflow checks below use isolated local fixtures. External send, payment and backup flows use synthetic/local providers; passing them does not establish production integration readiness.

| Check | Result |
|---|---|
| Main UI | 34 checks passed, including all 60 owner routes, touch drawer, permission editing, original form controls and founder separation |
| Pipeline UI | 15 passed: enquiry through quote, booking, job, invoice/payment; refused action and error states |
| Automation UI | 11 passed, including creation, dry run, approvals and founder save/rebuild workflows |
| Founder platform UI | 16 passed across desktop/mobile |
| SEO UI | 11 passed, including website draft, technical audit, keyword plan, Google failure state and reports |
| Communications UI | 10 passed, including consent, approval-gated reply/campaign and founder counts-only overview |
| Finance UI | 11 passed, including invoice approval/issue, signed synthetic payment, refund approval, reconciliation and plan changes |
| Reliability UI | 7 passed: checks, local snapshot and restore, alerts, self-healing approval request, summary and responsive layout |
| Module inventory | 66 modules checked, zero problems; provider requirements retained in `qa/reports/modules.json` |
| Portal screenshots | 12 screens at 390, 768 and 1440 px; reviewed layout changes and repeat comparison passed within existing tolerance |
| Navigation details | 575 checks passed across 60 business and 34 founder pages at desktop/mobile widths, including nested content sections, controlled-panel visibility, keyboard, history, role and contrast coverage; see `qa/reports/navigation-coverage.json` and `SECTIONS.md` |
| Repository checks | npm test: 45 contract files and 73 end-to-end checks; quality, runtime smoke, integration, secrets, memory and manifest checks required before committing |

Browser environment: Node 22.23.4 and Chromium 153.0.8010.0. The pinned Playwright Chromium download was unavailable, so a local external browser executable was used without changing project dependencies. Re-run CI with the pinned browser before release.

The clean checkout did not contain historical PNG baselines. Local navigation screenshots were established, inspected, updated for the authorised layout change, then compared again. This verifies repeatability and layout fit rather than visual equivalence with an older production version. The full-site visual report was preserved; the new scoped report is `qa/reports/visual-regression-portals.json`.

Operational findings remain separate: live daily-backup readiness, tenant channel activation, Google measured-data connections and GST-setting reconciliation need their own production verification. This navigation change does not represent those services as activated or repaired.

Source publication is pending explicit authorisation after automatic approval review rejected the remote recovery push. Local commits and a recovery bundle are prepared for review; merging and deploying remain separate steps.

## Claude re-verification, 2026-10-31

Environment: Node 22.23.4, Playwright 1.62.1 with **its own pinned Chromium**, so the Chromium 153 limitation above no
longer applies. GitHub CI on `f95edb6` also passed: verify, recovered-release-ui, CodeQL, dependency review.

Defects found and fixed:
1. **Unsaved-change warning never cleared.** Nothing emitted `superpro:form-saved`, so any form that keeps its values
   after a successful save warned again on navigation.
   - `navigation-shell.js` now ties requests started by a form submit to that form. Only when all of them succeed do the
     submitted values become the new baseline.
   - Failed saves keep the warning; later edits warn again; nothing goes to browser storage.
   - Regression check added to `test:navigation-ui`.
2. **Navigation coverage could shrink silently.** On a slower machine the suite reported 544 and then 525 checks
   instead of 575, because sections render after content loads.
   - The test now waits for every section listed in SECTIONS.md (46 routes, 187 sections, including nested ones).
   - It fails if any is missing at either width.
   - Result: 576 checks, identical on two consecutive runs.

Results on the final tree:
- `npm test`: 73/73.
- `test:navigation-ui`: 576.
- `test:ui`: 34. `test:pipeline-ui`: 15. `test:console-ui`: 16. `test:automations-ui`: 11. `test:seo-ui`: 11.
  `test:comms-ui`: 10. `test:finance-ui`: 11. `test:reliability-ui`: 7.
- `verify:modules`: 66 modules, 0 problems.
- quality, smoke, integration, secrets, memory and manifest: pass.
- `npm audit`: 0.

`test:console-ui` failed once inside a long run and passed 16/16 when re-run, with and without the fix. It is recorded as
an intermittent timing issue.

Inspected visual changes:
- The 12 changed portal screens against pre-navigation local baselines are the intended sidebar and section layout.
- Pre-existing, outside this release: the floating "Office chat" and "Ask Super Pro" buttons can cover content near the
  bottom of the viewport.
- New follow-up: on a 390 px phone, the Founder Console header button row clips its last button.

Not completed under this pass:
- A per-item functional inventory (function, evidence, status for every control on all 94 pages).
- Dedicated 768 and 1024 px and light-theme screenshot review of every page.
- Email-folder focus retention.
These remain open under T-066.

### Audit fixes, second pass (2026-10-31)

- **Email folders lost keyboard focus.** Selecting a folder (Enter, arrow keys or click) rebuilt the tabs and dropped
  focus to the page start. `mail-centre.js` now returns focus to the selected folder, and only when a folder tab had
  focus. `test:navigation-ui` asserts this on both portals at both widths.
- **Founder theme button was a 27 px touch target** at 390 px (it looked clipped). It is now 40×40 px, matching the
  other header buttons.
- **Floating widgets (Office chat, Ask Super Pro):** measured at 390/768/1024/1440 px with the page scrolled to the
  end; the last control on the page is never covered. Recorded as checked, not a defect.
- Results:
  - `npm test`: 73/73.
  - Navigation: 576.
  - UI: 34. Console: 16. Comms: 10. Pipeline: 15. Automations: 11. SEO: 11. Reliability: 7.
  - Finance: 11/11 on re-run. One intermittent timeout on the change-plan page, which this change does not touch.
  - 66 modules. Quality, smoke, integration, secrets, memory, manifest: pass. npm audit: 0.
- GitHub CI on `2e5c275`: every check passed after one re-run of the intermittent `recovered-release-ui` job.
