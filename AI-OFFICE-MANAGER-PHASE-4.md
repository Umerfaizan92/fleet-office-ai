# Fleet Parlour AI Office Manager — Phase 4

Phase 4 adds the controlled workflow from the job day through final completion.

## Privacy and personal-contact protection

- Every manual conversation import now starts with **Fleet Parlour business** or **Personal — exclude completely**.
- A personal selection is not stored: no customer, conversation, transcript or draft is created.
- Do not connect a live personal WhatsApp/social inbox until its official connector can reliably filter business traffic. Platform connections are not active in this package.
- Before/after media is served only through the admin-protected backend and is not exposed by the public website.
- Media defaults to private. Marketing eligibility follows the job's recorded `marketing_media` consent and is withdrawn if that consent is withdrawn.

## Job Completion Centre

Open **Job Completion** and choose a booking. Each job contains:

1. Private before-work photos/videos and notes.
2. Private after-work photos/videos and notes.
3. Evidence-based consent records for invoice delivery, marketing-media use and review requests.
4. Work-complete control that prepares an invoice from the accepted quotation.
5. Invoice approval before it can be marked manually sent.
6. Verified part/full payment recording with method, reference and evidence.
7. Receipt draft created only after full payment and placed in Approvals.
8. Review request available only after payment and recorded permission.
9. Review record with platform, rating, text and evidence.
10. Final thank-you draft in Approvals and completed job status.

## Approval rule

Invoice, receipt, review request and thank-you actions enter **Approvals**. Approval does not transmit anything because live messaging/email connectors are not configured. Send approved material manually and retain the evidence until official APIs and public HTTPS hosting are connected.

## Media limits

Supported formats: JPG, PNG, WEBP, HEIC, HEIF, MP4, MOV and WEBM. The default maximum is 100 MB per file and can be changed with `JOB_MEDIA_MAX_MB` in `backend/.env`.

## Data safety

Back up `backend/data` securely. Never publish `.env`, the database, customer media, invoices, payments or the private Office Manager to GitHub Pages.
