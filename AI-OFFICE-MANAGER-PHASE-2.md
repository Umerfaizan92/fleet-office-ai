# Fleet Parlour AI Office Manager — Live Website + Phase 2

This package is built from the user-supplied live website archive dated 14 September 2026. The public website pages, SEO images, service galleries, maps and performance work are preserved. The private AI Office Manager is the starting area; **Website** is its last navigation option.

## Phase 2 included

- Private Office Manager protected by `ADMIN_API_KEY`
- Overview dashboard and enquiry pipeline
- Automatic customer records from website enquiries
- Customer list with enquiry and quote counts
- Draft quotation creation with automatic 10% GST calculation
- Quote status workflow: draft, sent, accepted, declined or expired
- Tentative bookings with status management
- Activity-history API for calls, SMS, email, notes, quotes and bookings
- Fleet Parlour service catalogue foundation
- AI receptionist configuration for the temporary number `0404 946 656`
- Business-versus-personal call-screening rules
- Recording notice only after a caller confirms the call concerns Fleet Parlour
- Personal, government, medical, legal, family and friend calls excluded from the business enquiry workflow
- Website preview and open-in-new-tab control inside Office Manager
- Google Maps allowed by the local backend security policy

## Private information removed

The uploaded live archive contained an `.env` file, a customer database and an uploaded customer photo. Those items are deliberately not included in this package. Copy your own `.env` and data into the new version only on your own computer. Never publish them to GitHub.

## Start on Windows

1. Extract the ZIP.
2. Open the `Website` folder.
3. Double-click `START-FLEET-PARLOUR.bat`.
4. On the first run, allow dependency installation to finish.
5. If `.env` does not exist, copy `backend/.env.example` to `backend/.env`.
6. Set a long private `ADMIN_API_KEY` in `.env`.
7. Open `http://localhost:3000/office/`.

The Command Prompt window must remain open while using the system.

## Temporary personal-number design

The software is prepared for `0404 946 656`, but it does not activate telephone forwarding by itself.

Recommended future routing:

1. Known private contacts bypass the business AI where the selected carrier supports an allow-list.
2. Unknown or unanswered calls enter a neutral screening step.
3. The AI asks whether the call concerns Fleet Parlour or is for Faizan personally.
4. Personal, family, government, medical and legal callers are transferred immediately without creating a business record.
5. Business callers hear the recording notice and give consent before transcription begins.
6. Confirmed Fleet Parlour calls become structured enquiries.

Important: transferring a screened call back to the same forwarded mobile number can create a forwarding loop. A secondary destination such as a low-cost eSIM, separate mobile, SIP application or another approved transfer endpoint will be required before live activation. Until that is selected, keep telephone integration in test mode.

## Human approval controls

- Quotes are created as drafts and are never sent automatically.
- Bookings begin as tentative.
- Marketing consent defaults to off.
- No bulk email, SMS, social publishing or advertising is enabled.
- No calls are forwarded, answered or recorded by this package.

## Test checklist

1. Submit a test enquiry from `http://localhost:3000/contact.html` with a photo.
2. Confirm that it appears under **Enquiries**.
3. Confirm that the person appears automatically under **Customers**.
4. Create a draft quote and confirm GST and total calculations.
5. Create a tentative booking and change its status.
6. Review and save **AI Receptionist** settings.
7. Open **Website** and confirm the current live design, pages and map remain correct.

Do not upload the private Office Manager publicly through GitHub Pages. The public site can remain on GitHub Pages, while the backend and Office Manager must be deployed separately behind HTTPS and strong authentication.
