# Pending tasks

Ordered: the first task whose status is not COMPLETED is the one to resume. Status values: NOT_STARTED, IN_PROGRESS,
BLOCKED, TESTING, COMPLETED. When a task is verified, move it to COMPLETED_TASKS.md with its evidence.

## T-037 Accessible names that match visible text in the Business OS (P03 follow-up)
- Status: BLOCKED
- Blocked by: owner approval (existing tests and the console page use the current labels; they change together).
- Requirement: "Pin navigation" button labelled "Expand main navigation"; co-pilot button showing "Ask Super Pro"
  labelled "Open Super Pro AI co-pilot"; dashboard tiles' labels do not contain their visible text.
- Acceptance: axe `label-content-name-mismatch` 0 on workspace; tests updated in the same commit.

## T-039 Phase 04: complete Business Operating System integration
- Status: IN_PROGRESS
- Added: 2026-10-30
- Requirement: Owner prompt 2026-10-30 (full text in docs/phase-04/PROMPT.md). Use the Phase 00 inventory as mandatory preservation checklist; improve every existing module; complete broken or disconnected workflows. Subscriber workspace: dashboard, business setup, CRM/customers, enquiries, quotations, bookings, jobs, work orders, worker allocation, workforce compliance, offshore staff, AI receptionist, unified inbox, email and messaging, invoices, payments, accounting and GST, marketing, campaigns, social media, content studio, website management, SEO, AI approvals, files and documents, reports, analytics, branding, notifications, help and support, integrations, automation settings. Preserve pipeline Enquiry > Quote > Booking > Allocation > Completion > Invoice > Payment with correct propagation. Founder console: subscriber admin, organisation management, plans, platform billing, revenue analytics, infrastructure status, storage and backups, AI usage and costs, platform marketing, system email, support tickets, security and audit logs, feature flags, compliance, platform configuration; keep subscriber business comms separate from founder platform comms. Unified navigation, search, filters, notifications, activity history, AI assistance, file attachments, permissions, mobile. Never show success for a backend action that did not succeed. Every existing feature verified working or documented with blockers.
- Files: src/*, saas/*, office/*, scripts/*
- Acceptance: Feature inventory saved; pipeline end-to-end test passes; every module verified or blocker documented in docs/phase-04/VERIFICATION.md; no false success messages (tested); npm test and UI suites pass

## P04 onwards
- Status: NOT_STARTED. Waiting for the owner's next phase prompt (see MASTER_PLAN.md). Record the prompt here
  in full before starting.
