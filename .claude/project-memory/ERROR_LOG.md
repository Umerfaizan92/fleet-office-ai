# Error log

Errors met during development, whether they were partially executed, and how to recover safely. Newest last.
Never paste secrets, tokens or customer data here.

| ID | Date | Task | Error | Partially executed? | Resolution / safe recovery |
|---|---|---|---|---|---|
| E-001 | 2026-10-29 | T-002 | `git push` and add_repo with push access refused: GitHub account not linked to the cloud session. | No (nothing reached GitHub). | Deliver bundle + patch; owner pushes from PowerShell. Re-check access before every push. |
| E-002 | 2026-10-29 | T-002 | Playwright expected Chromium build 1234, container has 1243. | No. | Local-only symlinks in `/opt/pw-browsers` (`chromium_headless_shell-1234` and `chromium-1234` → `-1243`). Not needed on the owner's machine. |
| E-003 | 2026-10-29 | T-002 | Job-queue back-off test flaky because of jitter. | No. | Test advances 2100/1500/1600 ms; no product change. |
| E-004 | 2026-10-29 | T-002 | Secret scan flagged the `whsec_wrong…` test placeholder. | No. | PLACEHOLDER allow-list in `scripts/secret-scan.mjs`. |
| E-005 | 2026-10-30 | T-004 | 3D hero never loaded in the container (2 CPU cores). | No. | `?force3d=1` override for testing; capability rule unchanged. |
| E-006 | 2026-10-30 | T-005 | Legacy `--sp-ink` variable (dark text) clashed with the new token name. | No. | New text tokens renamed `--sp-fg`, `--sp-fg-2`, `--sp-fg-muted`. |
| E-007 | 2026-10-30 | T-006 | Gold link buttons showed white text (`.sp-site a{color:inherit}` beat `.sp-btn`). | No. | Link rule wrapped in `:where()`; fixed in `6a5ddc8`. |
| E-008 | 2026-10-30 | T-006 | Concern that the delivery patch might lose binary files (compressed assets, images). | No. | Checked: the patch reproduced the commit tree exactly in a fresh clone. Keep passing `--binary` and always verify a patch by applying it to a fresh clone before delivery. |
| E-009 | 2026-10-30 | T-035 | Resume check named T-035 (first active task in the file) although the handover said work stopped in T-036. Found in the recovery-drill dry run. | No. | The open task named in the handover's CURRENT TASK now wins; contract test covers it. |
