# Business Communications Architecture

Super Pro AI Office Manager v11 separates public business communications from the owner's private contact details.

## Public business identity
- `BUSINESS_PRIMARY_NUMBER`: confirmed public business call number.
- `BUSINESS_WHATSAPP_NUMBER`: confirmed/approved business WhatsApp identity or number reference.
- Telnyx/provider credentials remain server-side.

## Private owner transfer
- `OWNER_PRIVATE_TRANSFER_NUMBER`: optional server-only destination for a genuine business caller who needs the owner.
- It must never be returned in browser APIs, displayed in the receptionist UI, included in AI prompts visible to callers, or stored in public customer data.
- The transfer tool receives a business reason and performs the transfer through the telephony provider without exposing the destination.

## Business-only receptionist
The AI receptionist handles business enquiries. Personal/family/friend screening/routing is not a public workflow in v11. Old/legacy payloads classified as private are rejected from the business-enquiry store rather than becoming a business lead.

## WhatsApp
Business WhatsApp should connect through the official provider/account authorisation flow. Customers should connect their own business accounts without receiving Super Pro AI Office Manager platform secrets.
