# Business staff access and platform separation

Business owners manage staff at **People → Staff Accounts & Roles**. Each member has a role, a **Feature & task access** editor, and an **Activity log**. Use role defaults or choose individual view/create/edit/approve/delete grants. View must be granted before an action. These controls affect only that membership in the current organisation; another member or another business does not inherit them.

The platform founder uses the separate `/saas/operator-sign-in.html` page, available from the landing page's Platform menu. Business sign-in has no operator tab. Existing operator bookmarks redirect. The operator's admin-key/MFA session remains independent of business cookies and staff grants. Navigation placement is not an access-control boundary.

Individual policies are checked on every authenticated API request, including existing sessions. Unclassified endpoints fail closed for a custom policy. Owner-only controls, global operator APIs, credential authorisation, and data exports retain their original guards. Job/worker assignment and identity restrictions continue to apply. Custom AI history is limited to the requesting user's threads. A custom grant does not change the user's role.

Policies are keyed by organisation and user, bound to the current membership creation time, and deleted when business membership is revoked. The editor uses revision checks to reject stale updates. Role defaults preserve existing account behaviour; custom mode explicitly restricts and can delegate supported feature actions. Owner authority cannot be edited through the staff editor.

Permission changes and sampled feature use/denials are written to the existing append-only, hash-chained audit log. The member activity dialog requires that business's owner and returns only that member's events in that organisation. Other users' personal activity is excluded from live activity feeds. Not every read is recorded: repeated feature/action access is sampled once per minute per actor and business.

Sign out stays visible in the business header on mobile and desktop and invalidates the server session. Logout clears session presence. A failed logout displays an error so the user can retry.

This release preserves the existing gold palette and adds original SVG circuit details and a lightweight shared atmospheric background. It uses CSS transforms, bounded visible icon animation, reduced-motion and data-saver preferences. It does not include paid GetLayers source assets.

## Manual Render deployment

Select the latest merged `main` commit and use **Manual Deploy → Deploy latest commit**. Automatic deployment remains disabled. Test with separate founder, business-owner and employee sessions. Production email/SMS and live AI still depend on the deployment's configured providers.
