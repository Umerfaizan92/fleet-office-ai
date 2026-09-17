# Final v12 local test checklist

1. Copy `.env.example` to `.env` and use `SAAS_VERIFICATION_TEST_MODE=1` only for local development.
2. Generate a private admin key with `npm run generate:admin-key`, save it to `.env`, and never paste that secret into chat/screenshots.
3. Run `npm install`, `npm run validate:final`, then `npm start`.
4. Open `http://localhost:3000/saas/` and hard-refresh.
5. Confirm the Super Pro AI Office Manager visual brand/logo appears across public, auth, workspace and Office Manager pages.
6. Confirm Explore the platform scrolls to the Capabilities section.
7. Test AI Product Guide by typing and microphone in at least two languages.
8. Test ABN and ACN selector flow in local test mode.
9. Create/sign in to a test workspace and confirm onboarding navigation, User Manual, contextual AI and Staff Chat.
10. Click the top `?` walkthrough button repeatedly at a reasonable pace: no normal-use raw 429 error should appear.
11. Open `/office/`, enter the admin key, and use both Super Pro workspace links. They must return to the workspace and must not clear the admin key.
12. Unified Inbox: search, channel filter, Current/Previous filter, import one historical conversation.
13. Approvals: test Pending, Approved, Rejected and All filters.
14. Enquiries: test search/status and repeat customer count.
15. Customers: open Customer 360 for a customer with records.
16. Records & Archive: import test history for quote/job/invoice/campaign and verify it appears.
17. Campaigns: confirm product-newsletter subscriber panel and campaign-history filtering.
18. Public front page: subscribe a test email to product updates, then test unsubscribe for the same email.
19. Connections: confirm channel metric cards include Facebook, Instagram, TikTok, YouTube, Snapchat, X, website/email/SMS where seeded/connected; unconnected metrics must show awaiting sync rather than invented numbers.
20. Content Studio: confirm Snapchat/X choices and AI Creative Director buttons.
21. AI Receptionist: confirm business-only wording and voice/locale choices; personal contact type must not appear.
22. Help & Governance: Support, Complaints, Trust and Policy links/buttons must work.
23. Website: confirm Website Control Center opens the live website in a new tab even if embedding is blocked.
24. Resize to desktop, laptop, tablet and mobile widths and confirm no core control is hidden or overlapped.
25. Run `npm run check:config`. Provider groups should remain MISSING until you intentionally add real operator-controlled keys.

## Provider limitation before keys
Meta/WhatsApp/TikTok/Google/YouTube/Snapchat/X/Telnyx/email/live analytics cannot truthfully sync or publish until the corresponding provider applications, permissions and keys are connected. The UI is prepared for that connection but does not fake live provider results.
