# Business staff access and platform separation

Business owners manage staff at **People → Staff Accounts & Roles**. Each member has a role, a **Feature & task access** editor, and an **Activity log**. Use role defaults or choose individual view/create/edit/approve/delete grants. View must be granted before an action. These controls affect only that membership in the current organisation; another member or another business does not inherit them.

The platform founder uses the separate `/saas/operator-sign-in.html` page, unlisted in subscriber navigation. Business sign-in has no operator tab. Existing operator bookmarks redirect. The operator's admin-key/MFA session remains independent of business cookies and staff grants. Navigation placement is not an access-control boundary.

Individual policies are checked on every authenticated API request, including existing sessions. Unclassified endpoints fail closed for a custom policy. Owner-only controls, global operator APIs, credential authorisation, and data exports retain their original guards. Job/worker assignment and identity restrictions continue to apply. Custom AI history is limited to the requesting user's threads. A custom grant does not change the user's role.

Policies are keyed by organisation and user, bound to the current membership creation time, and deleted when business membership is revoked. The editor uses revision checks to reject stale updates. Role defaults preserve existing account behaviour; custom mode explicitly restricts and can delegate supported feature actions. Owner authority cannot be edited through the staff editor.

Permission changes and sampled feature use/denials are written to the existing append-only, hash-chained audit log. The member activity dialog requires that business's owner and returns only that member's events in that organisation. Other users' personal activity is excluded from live activity feeds. Not every read is recorded: repeated feature/action access is sampled once per minute per actor and business.

Sign out stays visible in the business header on mobile and desktop and invalidates the server session. Logout clears session presence. A failed logout displays an error so the user can retry.

This release preserves the existing gold palette and adds original SVG circuit details and a lightweight shared atmospheric background. It uses CSS transforms, bounded visible icon animation, reduced-motion and data-saver preferences. It does not include paid GetLayers source assets.

## Manual Render deployment

Select the latest merged `main` commit and use **Manual Deploy → Deploy latest commit**. Automatic deployment remains disabled. Test with separate founder, business-owner and employee sessions. Production email/SMS and live AI still depend on the deployment's configured providers.

## Founder-only account shortcut

Business owners and the application founder are separate identities. The workspace header shows the current member’s name, actual role and saved worker designation. No staff grant or subscriber-owner role exposes the operator shortcut.

To establish your private shortcut once, keep your own business-owner session signed in, open `/saas/operator-sign-in.html`, review the named account, select **Add a private operator shortcut**, and authenticate with the founder key and configured MFA. The server links only that authenticated user, records the event and rejects replacement by another account. Subsequent sign-ins to that founder’s owner workspace show **Open operator console**. The link still requires independent operator authentication. Ordinary owners and staff cannot create a founder identity using only their business session.

The sign-in page has intrinsic height, six optional feature cards and a collapsible authenticator field. Standard phone and desktop views retain readable 44px inputs; smaller screens, browser zoom, expanded MFA and feature details can scroll naturally. Dashboard cards have matching SVG icons and permission-aware shortcuts. Connector manager blocks stay in normal flow, resource checkboxes remain compact, and unsaved selections survive a failed save or enhancement refresh. Import help opens the existing support panel. Finance, Billing, setup, exports and the operator portal share the same surface styling without changing provider or payment behaviour.
