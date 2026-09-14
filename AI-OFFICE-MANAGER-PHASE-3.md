# Fleet Parlour AI Office Manager — Phase 3

Phase 3 adds an approval-controlled enquiry-to-booking workflow to the supplied live Fleet Parlour website. The public website design and pages are preserved.

## What works locally

- Import an existing WhatsApp, email, phone or social-media conversation.
- Match an existing customer by phone or email, or create the customer automatically.
- Keep the imported conversation in **Unified Inbox**.
- Prepare a Fleet Parlour reply and place it in **Approvals**.
- Edit and approve or reject reply drafts. Approval never transmits a message by itself.
- Create and edit quotation items with automatic 10% GST calculations.
- Approve a quote, then mark it as manually sent.
- Record customer acceptance only with an evidence note.
- Propose booking dates and approve them before confirming a booking.
- Create confirmation and reminder tasks for every confirmed booking. Each follow-up also enters **Approvals**.
- Keep the public website available as the final Office Manager navigation option.

## Current safe boundary

This package does not connect to or send through WhatsApp, Facebook, Instagram, TikTok, email or SMS. Those platforms require official API credentials, webhooks and a public HTTPS deployment. Until those connections are configured, paste/import conversations and mark approved items as sent only after you send them manually.

The draft reply is currently a safe pre-filled template. A local language model or approved AI provider can later replace it without changing the database workflow.

## Start on Windows

1. Extract the ZIP and open its `Website` folder.
2. Double-click `START-FLEET-PARLOUR.bat`.
3. If asked, allow the dependency installation to finish.
4. Copy `backend/.env.example` to `backend/.env` if `.env` does not exist.
5. Set a long, private `ADMIN_API_KEY` in `.env`.
6. Open `http://localhost:3000/office/` and enter the same key.

Keep the Command Prompt window open while using the Office Manager.

## First workflow test

1. Open **Unified Inbox** and paste the real customer conversation.
2. Check that the customer and draft reply are created.
3. Open **Approvals**, edit the reply, and approve it.
4. Send the reply manually in the original channel.
5. Create a quote, open it by clicking its number, edit it, and request approval.
6. Approve the quote, mark it manually sent, then record acceptance evidence.
7. Propose a date, approve it, and confirm the booking.
8. Review the three follow-up items in **Approvals**.

## Important privacy rule

Do not import personal calls, family messages, medical, legal or government communications into the business inbox. The existing `0404 946 656` number is still shared; live call screening cannot be activated safely until a carrier/voice API and a separate transfer destination are selected.

Never publish `backend/.env`, `backend/data`, customer photos, or the private Office Manager on GitHub Pages.
