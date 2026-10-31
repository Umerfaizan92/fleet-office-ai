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
