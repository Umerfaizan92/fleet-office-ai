# Navigation implementation and release checklist

Scope: authenticated Business Portal and Founder Console. The starting source is production commit `3edc118051aac8d3aa18fd76ae1da0bdc0240680`, verified against Render's live deployment on 31 October 2026. The public marketing website is excluded.

## Work sequence

| Stage | Result |
|---|---|
| 1. Preserve the current inventory | [MAPPING.md](MAPPING.md) and MAPPING.json retain all 60 business pages and 34 founder pages in their existing group/order, with canonical routes, default permissions and reconciled labels. |
| 2. Build the shared sidebar | Expandable groups contain their page links in the left rail. Active page and parent are identified. Expanded/compact preference is scoped to the signed-in identity and workspace. Compact navigation uses a click/keyboard flyout. |
| 3. Organise business sections | Fourteen existing page configurations use contextual top tabs in place of the section dropdown. Existing native Finance, Growth, Automation, SEO, Settings and Hiring controls remain on their original panels. Email folders use top tabs. Forms and pagination retain their existing handlers. |
| 4. Organise founder sections | The same rail lists all authorised console pages. Multi-section content provides heading-based contextual tabs. Tabs rebind after modules rebuild content following a save. Record lists remain record lists. Data-heavy modules with related forms use a top section jump index so their interdependent controls remain visible. |
| 5. Preserve usability and verify workflows | Section URLs, reload and Back/Forward restore selection. Keyboard controls, mobile modal drawer/focus, contrast, role filtering, unsaved form preservation and existing workflows are exercised with synthetic local data. Top section indexes identify real heading panels; individual audit events and records are not converted into navigation tabs. See SECTIONS.md and the QA reports. |
| 6. Prepare a reviewable release | Update manifest, complete repository checks, save project-memory checkpoint and commit the feature branch locally. Remote publishing requires explicit authorisation after automatic approval review rejected a source push. No deployment is included. |

## Behaviour and boundaries

- The navigation is presentation only. Existing server permissions, custom grants, tenancy boundaries, approval gates, routes and record IDs remain authoritative.
- Page sections show the original DOM panels. Switching a section does not clone a form, submit it, or reload the page. Hidden role-specific panels remain unavailable.
- Section controls support Left/Right, Home/End, roving focus and ARIA tab/panel associations. Mobile navigation closes on selection or Escape and restores background interaction.
- Unsaved form values trigger a conservative warning when leaving through sidebar links or unloading. Reset forms, removed forms and forms emitting `superpro:form-saved` are cleared from tracking. Existing forms that keep saved values without emitting that event can conservatively warn again; this is not a claim of server-side draft persistence.
- Existing request forms and provider setup states remain explicit. Navigation changes do not activate phone services, link Google accounts, repair backup permissions or establish GST registration.
- Provider-backed checks use fixtures and stubs. A passing synthetic send/payment/backup test does not establish production provider readiness.

## Verification environment

Node 22.23.4, the repository's locked dependencies and isolated SQLite fixtures. The pinned Playwright browser download failed in this environment; browser checks use externally installed Chromium 153.0.8010.0 through a local executable override. This executable is not a new project dependency. Re-run CI with the pinned Playwright browser before releasing.

The first visual run in this clean checkout establishes local screenshots. It cannot prove pixel equivalence with historical screenshots that are absent from the checkout. Screenshots are inspected for layout and navigation visibility; public-site visual baselines are outside this change.

## Resume and release

Run `npm run memory:resume` and inspect the latest generated handover before editing. The feature branch is `codex/navigation-hierarchy-20261031`; do not revert to the older recovery baseline in historical notes. Latest checkpoints, local commits and recovery refs identify exactly what has been saved and verified.

Before publishing, review the diff and validation evidence, obtain explicit remote-source publication authorisation, then push this feature branch and create a pull request. Recheck production/main for intervening changes before merge. Keep production deployment separate from this navigation release candidate.
