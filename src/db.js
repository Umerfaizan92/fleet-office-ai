import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function createDb(databasePath) {
  const absolute = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const db = new Database(absolute);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS enquiries (
      id TEXT PRIMARY KEY,
      reference_code TEXT UNIQUE,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      source TEXT NOT NULL DEFAULT 'website',
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      suburb_postcode TEXT NOT NULL,
      service_address TEXT,
      vehicle_type TEXT NOT NULL,
      make_model TEXT,
      registration TEXT,
      service_required TEXT NOT NULL,
      parts_to_polish TEXT NOT NULL,
      condition TEXT NOT NULL,
      preferred_date TEXT,
      job_details TEXT,
      power_available TEXT NOT NULL,
      covered_work_area TEXT,
      privacy_consent INTEGER NOT NULL,
      ai_status TEXT NOT NULL DEFAULT 'pending',
      ai_summary TEXT,
      ai_quote_draft TEXT
    );

    CREATE TABLE IF NOT EXISTS enquiry_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enquiry_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_enquiries_created_at ON enquiries(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
    CREATE INDEX IF NOT EXISTS idx_enquiry_photos_enquiry_id ON enquiry_photos(enquiry_id);

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      suburb_postcode TEXT,
      service_address TEXT,
      company_name TEXT,
      notes TEXT,
      marketing_consent INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enquiry_id TEXT,
      customer_id TEXT,
      activity_type TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS service_catalog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      pricing_method TEXT NOT NULL DEFAULT 'manual',
      base_price_cents INTEGER,
      gst_rate REAL NOT NULL DEFAULT 0.10,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      quote_number TEXT NOT NULL UNIQUE,
      enquiry_id TEXT,
      customer_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      issue_date TEXT NOT NULL,
      valid_until TEXT,
      notes TEXT,
      subtotal_cents INTEGER NOT NULL DEFAULT 0,
      gst_cents INTEGER NOT NULL DEFAULT 0,
      total_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(enquiry_id) REFERENCES enquiries(id) ON DELETE SET NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS quote_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price_cents INTEGER NOT NULL,
      line_total_cents INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      enquiry_id TEXT,
      quote_id TEXT,
      customer_id TEXT NOT NULL,
      title TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT,
      address TEXT,
      status TEXT NOT NULL DEFAULT 'tentative',
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(enquiry_id) REFERENCES enquiries(id) ON DELETE SET NULL,
      FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE SET NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS receptionist_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      business_name TEXT NOT NULL,
      greeting TEXT NOT NULL,
      transfer_number TEXT NOT NULL,
      service_area TEXT NOT NULL,
      business_hours TEXT NOT NULL,
      escalation_rules TEXT NOT NULL,
      required_questions TEXT NOT NULL DEFAULT '',
      screening_mode TEXT NOT NULL DEFAULT 'business_only',
      personal_transfer_rules TEXT NOT NULL DEFAULT '',
      recording_notice TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voice_enquiries (
      id TEXT PRIMARY KEY,
      call_type TEXT,
      priority INTEGER NOT NULL DEFAULT 3,
      urgent INTEGER NOT NULL DEFAULT 0,
      owner_notification_required INTEGER NOT NULL DEFAULT 0,
      customer_name TEXT,
      callback_number TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      enquiry_id TEXT,
      channel TEXT NOT NULL,
      external_thread_id TEXT,
      subject TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
      FOREIGN KEY(enquiry_id) REFERENCES enquiries(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      direction TEXT NOT NULL,
      sender_name TEXT,
      sender_address TEXT,
      body TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'imported',
      requires_approval INTEGER NOT NULL DEFAULT 0,
      approved_at TEXT,
      sent_at TEXT,
      external_message_id TEXT,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      approval_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      conversation_id TEXT,
      customer_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      draft_payload TEXT NOT NULL,
      edited_payload TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS date_proposals (
      id TEXT PRIMARY KEY,
      quote_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      proposed_start TEXT NOT NULL,
      proposed_end TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS automation_tasks (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      customer_id TEXT,
      enquiry_id TEXT,
      booking_id TEXT,
      due_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_approval',
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY(enquiry_id) REFERENCES enquiries(id) ON DELETE CASCADE,
      FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS job_media (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      media_type TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      relative_path TEXT NOT NULL,
      notes TEXT,
      marketing_approved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS job_consents (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      consent_type TEXT NOT NULL,
      granted INTEGER NOT NULL DEFAULT 0,
      evidence TEXT NOT NULL,
      granted_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(booking_id, consent_type),
      FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      booking_id TEXT NOT NULL UNIQUE,
      quote_id TEXT,
      customer_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      subtotal_cents INTEGER NOT NULL,
      gst_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      amount_paid_cents INTEGER NOT NULL DEFAULT 0,
      issued_at TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE RESTRICT,
      FOREIGN KEY(quote_id) REFERENCES quotes(id) ON DELETE SET NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      reference TEXT,
      evidence TEXT NOT NULL,
      received_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS customer_reviews (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      rating INTEGER,
      review_text TEXT,
      evidence TEXT NOT NULL,
      received_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS channel_connections (
      channel TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_connected',
      account_reference TEXT,
      capabilities TEXT NOT NULL DEFAULT '{}',
      last_checked_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      booking_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      format TEXT NOT NULL,
      aspect_ratio TEXT NOT NULL,
      target_duration_seconds INTEGER,
      hook TEXT,
      caption TEXT,
      cta TEXT,
      editing_prompt TEXT,
      media_ids TEXT NOT NULL DEFAULT '[]',
      platforms TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS social_posts (
      id TEXT PRIMARY KEY,
      content_project_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TEXT,
      platform_caption TEXT,
      external_post_id TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(content_project_id) REFERENCES content_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      campaign_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      offer TEXT NOT NULL,
      message TEXT NOT NULL,
      audience_rule TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TEXT,
      eligible_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );


    CREATE TABLE IF NOT EXISTS historical_records (
      id TEXT PRIMARY KEY,
      record_type TEXT NOT NULL,
      source_channel TEXT,
      customer_id TEXT,
      customer_name TEXT,
      reference_code TEXT,
      title TEXT,
      summary TEXT,
      occurred_at TEXT,
      imported_at TEXT NOT NULL,
      import_source TEXT NOT NULL DEFAULT 'manual',
      external_id TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT,
      organisation_name TEXT,
      source TEXT NOT NULL DEFAULT 'public_site',
      status TEXT NOT NULL DEFAULT 'subscribed',
      consent_text TEXT NOT NULL,
      subscribed_at TEXT NOT NULL,
      unsubscribed_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_metrics (
      channel TEXT PRIMARY KEY,
      followers INTEGER NOT NULL DEFAULT 0,
      subscribers INTEGER NOT NULL DEFAULT 0,
      views INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      reach INTEGER NOT NULL DEFAULT 0,
      sends INTEGER NOT NULL DEFAULT 0,
      delivered INTEGER NOT NULL DEFAULT 0,
      opens INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      replies INTEGER NOT NULL DEFAULT 0,
      leads INTEGER NOT NULL DEFAULT 0,
      conversions INTEGER NOT NULL DEFAULT 0,
      spend_cents INTEGER NOT NULL DEFAULT 0,
      attributed_revenue_cents INTEGER NOT NULL DEFAULT 0,
      ai_reply_mode TEXT NOT NULL DEFAULT 'approval',
      last_synced_at TEXT,
      updated_at TEXT NOT NULL
    );


    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      booking_id TEXT,
      customer_id TEXT,
      category TEXT NOT NULL,
      subcategory TEXT,
      vendor TEXT,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      gst_cents INTEGER NOT NULL DEFAULT 0,
      expense_date TEXT NOT NULL,
      recurring INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      receipt_reference TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
      FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS performance_events (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      entity_name TEXT,
      metric_key TEXT NOT NULL,
      metric_value REAL NOT NULL DEFAULT 0,
      period_start TEXT,
      period_end TEXT,
      source TEXT NOT NULL DEFAULT 'system',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS referral_codes (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL UNIQUE,
      owner_user_id TEXT,
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS referral_events (
      id TEXT PRIMARY KEY,
      referrer_code TEXT NOT NULL,
      direct_referrer_code TEXT,
      referred_email TEXT,
      referred_user_id TEXT,
      referred_organisation_id TEXT,
      parent_event_id TEXT,
      level INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'registered',
      reward_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      qualified_at TEXT,
      FOREIGN KEY(referred_user_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(referred_organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
      FOREIGN KEY(parent_event_id) REFERENCES referral_events(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ai_verification_runs (
      id TEXT PRIMARY KEY,
      organisation_id TEXT,
      task_type TEXT NOT NULL,
      hypothesis TEXT,
      maker_output TEXT NOT NULL,
      checker_output TEXT NOT NULL,
      score REAL NOT NULL DEFAULT 0,
      threshold REAL NOT NULL DEFAULT 0.8,
      status TEXT NOT NULL DEFAULT 'review',
      lesson TEXT,
      created_at TEXT NOT NULL,
      decided_at TEXT,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS search_visibility_snapshots (
      id TEXT PRIMARY KEY,
      organisation_id TEXT,
      source TEXT NOT NULL,
      metric_key TEXT NOT NULL,
      metric_value REAL NOT NULL DEFAULT 0,
      page_url TEXT,
      query_text TEXT,
      captured_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS organisations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'trial',
      timezone TEXT NOT NULL DEFAULT 'Australia/Perth',
      abn TEXT,
      business_identifier_type TEXT NOT NULL DEFAULT 'ABN',
      business_identifier TEXT,
      legal_name TEXT,
      abn_status TEXT,
      abn_verified_at TEXT,
      state TEXT,
      postcode TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      mfa_secret TEXT,
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      email_verified INTEGER NOT NULL DEFAULT 0,
      phone_verified INTEGER NOT NULL DEFAULT 0,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      last_login_at TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memberships (
      organisation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      created_at TEXT NOT NULL,
      PRIMARY KEY(organisation_id,user_id),
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      ip_hash TEXT,
      user_agent TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pending_registrations (
      id TEXT PRIMARY KEY,
      business_name TEXT NOT NULL,
      legal_name TEXT,
      abn TEXT NOT NULL,
      business_identifier_type TEXT NOT NULL DEFAULT 'ABN',
      business_identifier TEXT,
      abn_status TEXT NOT NULL,
      abn_payload_json TEXT NOT NULL DEFAULT '{}',
      state TEXT NOT NULL,
      postcode TEXT NOT NULL,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      terms_version TEXT NOT NULL,
      email_code_hash TEXT NOT NULL,
      sms_code_hash TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 0,
      sms_verified INTEGER NOT NULL DEFAULT 0,
      verification_attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS onboarding_profiles (
      organisation_id TEXT PRIMARY KEY,
      business_type TEXT,
      phone TEXT,
      website TEXT,
      service_area TEXT,
      services TEXT NOT NULL DEFAULT '[]',
      brand_voice TEXT,
      approval_mode TEXT NOT NULL DEFAULT 'everything',
      ai_instructions TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL,
      user_id TEXT,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      role_title TEXT NOT NULL DEFAULT 'Technician',
      employment_type TEXT NOT NULL DEFAULT 'casual',
      worker_level INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'onboarding',
      availability_status TEXT NOT NULL DEFAULT 'available',
      work_rights_status TEXT NOT NULL DEFAULT 'review_required',
      visa_subclass TEXT,
      visa_expiry TEXT,
      work_restrictions TEXT,
      passport_required INTEGER NOT NULL DEFAULT 0,
      onboarding_progress INTEGER NOT NULL DEFAULT 0,
      approved_for_scheduling INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS worker_skills (
      id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, skill_name TEXT NOT NULL, competency TEXT NOT NULL DEFAULT 'unverified',
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(worker_id,skill_name), FOREIGN KEY(worker_id) REFERENCES workers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS worker_documents (
      id TEXT PRIMARY KEY, worker_id TEXT NOT NULL, document_type TEXT NOT NULL, document_name TEXT,
      required INTEGER NOT NULL DEFAULT 0, verification_status TEXT NOT NULL DEFAULT 'pending', issue_date TEXT, expiry_date TEXT,
      notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(worker_id) REFERENCES workers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS work_orders (
      id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, booking_id TEXT, title TEXT NOT NULL, address TEXT, start_at TEXT NOT NULL,
      estimated_hours REAL, required_workers INTEGER NOT NULL DEFAULT 1, required_level INTEGER NOT NULL DEFAULT 1, required_skills TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'awaiting_allocation', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE, FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS organisation_finance_entries (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL,
      work_order_id TEXT,
      entry_type TEXT NOT NULL CHECK(entry_type IN ('revenue','expense')),
      category TEXT NOT NULL,
      description TEXT,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      tax_cents INTEGER NOT NULL DEFAULT 0,
      occurred_on TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY(work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS job_offers (
      id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, work_order_id TEXT NOT NULL, worker_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'offered', offered_at TEXT NOT NULL, responded_at TEXT,
      UNIQUE(work_order_id,worker_id), FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY(work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE, FOREIGN KEY(worker_id) REFERENCES workers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS saas_audit_events (
      id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, actor_user_id TEXT, event_type TEXT NOT NULL, entity_type TEXT, entity_id TEXT,
      detail_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE, FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ai_threads (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_thread_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text',
      content TEXT NOT NULL,
      private_media_path TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(thread_id) REFERENCES ai_threads(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS video_render_jobs (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL,
      content_project_id TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      quality TEXT NOT NULL DEFAULT '1080p',
      edit_spec TEXT NOT NULL,
      output_path TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY(content_project_id) REFERENCES content_projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS subscription_plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      setup_fee_cents INTEGER NOT NULL DEFAULT 0,
      monthly_fee_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'AUD',
      limits_json TEXT NOT NULL DEFAULT '{}',
      active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organisation_subscriptions (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL UNIQUE,
      plan_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'trialing',
      trial_ends_at TEXT,
      external_customer_id TEXT,
      external_subscription_id TEXT,
      payment_provider TEXT,
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      restricted_at TEXT,
      archive_started_at TEXT,
      retention_ends_at TEXT,
      restore_window_ends_at TEXT,
      deletion_due_at TEXT,
      last_lifecycle_notice TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY(plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS staff_chat_messages (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL,
      sender_user_id TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY(sender_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS office_staff_chat (
      id TEXT PRIMARY KEY,
      sender_name TEXT NOT NULL DEFAULT 'Office Admin',
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_cases (
      id TEXT PRIMARY KEY,
      reference_code TEXT NOT NULL UNIQUE,
      organisation_id TEXT,
      reporter_user_id TEXT,
      reporter_type TEXT NOT NULL DEFAULT 'customer',
      reporter_role TEXT,
      reporter_name TEXT NOT NULL,
      reporter_email TEXT,
      reporter_phone TEXT,
      access_token_hash TEXT,
      reported_party_role TEXT NOT NULL DEFAULT 'none',
      category TEXT NOT NULL,
      subject TEXT NOT NULL,
      details TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'normal',
      confidential INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_role TEXT NOT NULL DEFAULT 'complaints_officer',
      escalation_required INTEGER NOT NULL DEFAULT 0,
      triage_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
      FOREIGN KEY(reporter_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS support_case_events (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      organisation_id TEXT,
      actor_user_id TEXT,
      event_type TEXT NOT NULL,
      detail_json TEXT NOT NULL DEFAULT '{}',
      prev_hash TEXT,
      event_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      FOREIGN KEY(case_id) REFERENCES support_cases(id) ON DELETE CASCADE,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE SET NULL,
      FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS support_case_attachments (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(case_id) REFERENCES support_cases(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_support_attachments_case ON support_case_attachments(case_id,created_at);

    CREATE TABLE IF NOT EXISTS governance_policies (
      id TEXT PRIMARY KEY,
      jurisdiction TEXT NOT NULL DEFAULT 'AU',
      industry TEXT NOT NULL DEFAULT 'all',
      audience TEXT NOT NULL DEFAULT 'all',
      policy_key TEXT NOT NULL,
      title TEXT NOT NULL,
      version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      effective_from TEXT,
      summary TEXT NOT NULL,
      body_markdown TEXT NOT NULL,
      requires_ack INTEGER NOT NULL DEFAULT 0,
      source_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(jurisdiction,industry,audience,policy_key,version)
    );

    CREATE TABLE IF NOT EXISTS policy_acknowledgements (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      policy_id TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      acknowledged_at TEXT NOT NULL,
      ip_hash TEXT,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(policy_id) REFERENCES governance_policies(id) ON DELETE RESTRICT,
      UNIQUE(organisation_id,user_id,policy_id,policy_version)
    );

    CREATE TABLE IF NOT EXISTS security_notifications (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      notification_type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      channels_json TEXT NOT NULL DEFAULT '[]',
      delivery_json TEXT NOT NULL DEFAULT '{}',
      audience_role TEXT NOT NULL DEFAULT 'senior',
      status TEXT NOT NULL DEFAULT 'new',
      related_entity_type TEXT,
      related_entity_id TEXT,
      created_at TEXT NOT NULL,
      read_at TEXT,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS organisation_integrations (
      organisation_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      display_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_connected',
      account_label TEXT,
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      settings_json TEXT NOT NULL DEFAULT '{}',
      connected_at TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(organisation_id,provider),
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS governance_ledger (
      id TEXT PRIMARY KEY,
      organisation_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      actor_user_id TEXT,
      payload_hash TEXT NOT NULL,
      prev_hash TEXT,
      event_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TRIGGER IF NOT EXISTS governance_ledger_no_update
    BEFORE UPDATE ON governance_ledger BEGIN
      SELECT RAISE(ABORT, 'governance ledger is append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS governance_ledger_no_delete
    BEFORE DELETE ON governance_ledger BEGIN
      SELECT RAISE(ABORT, 'governance ledger is append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS support_case_events_no_update
    BEFORE UPDATE ON support_case_events BEGIN
      SELECT RAISE(ABORT, 'support case events are append-only');
    END;
    CREATE TRIGGER IF NOT EXISTS support_case_events_no_delete
    BEFORE DELETE ON support_case_events BEGIN
      SELECT RAISE(ABORT, 'support case events are append-only');
    END;

    CREATE INDEX IF NOT EXISTS idx_staff_chat_org ON staff_chat_messages(organisation_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_office_staff_chat_created ON office_staff_chat(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_support_cases_org ON support_cases(organisation_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_support_cases_status ON support_cases(status,severity,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_support_case_events_case ON support_case_events(case_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_policy_ack_user ON policy_acknowledgements(organisation_id,user_id,acknowledged_at DESC);
    CREATE INDEX IF NOT EXISTS idx_security_notifications_org ON security_notifications(organisation_id,status,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_governance_ledger_org ON governance_ledger(organisation_id,created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
    CREATE INDEX IF NOT EXISTS idx_activity_enquiry_id ON activity_log(enquiry_id);
    CREATE INDEX IF NOT EXISTS idx_activity_customer_id ON activity_log(customer_id);
    CREATE INDEX IF NOT EXISTS idx_quotes_customer_id ON quotes(customer_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_start_at ON bookings(start_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, occurred_at);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_date_proposals_quote ON date_proposals(quote_id);
    CREATE INDEX IF NOT EXISTS idx_automation_due ON automation_tasks(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_job_media_booking ON job_media(booking_id, stage);
    CREATE INDEX IF NOT EXISTS idx_job_consents_booking ON job_consents(booking_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id, received_at);
    CREATE INDEX IF NOT EXISTS idx_reviews_booking ON customer_reviews(booking_id, received_at);
    CREATE INDEX IF NOT EXISTS idx_content_projects_updated ON content_projects(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_social_posts_status ON social_posts(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON marketing_campaigns(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_history_type_date ON historical_records(record_type, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_history_customer ON historical_records(customer_id, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status, subscribed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON user_sessions(token_hash, expires_at);
    CREATE INDEX IF NOT EXISTS idx_pending_registration_email ON pending_registrations(email, expires_at);
    CREATE INDEX IF NOT EXISTS idx_pending_registration_phone ON pending_registrations(phone, expires_at);
    CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id, organisation_id);
    CREATE INDEX IF NOT EXISTS idx_workers_org ON workers(organisation_id,status);
    CREATE INDEX IF NOT EXISTS idx_worker_documents_worker ON worker_documents(worker_id,expiry_date);
    CREATE INDEX IF NOT EXISTS idx_work_orders_org ON work_orders(organisation_id,start_at,status);
    CREATE INDEX IF NOT EXISTS idx_job_offers_worker ON job_offers(worker_id,status);
    CREATE INDEX IF NOT EXISTS idx_org_finance_date ON organisation_finance_entries(organisation_id, occurred_on DESC);
    CREATE INDEX IF NOT EXISTS idx_org_finance_work_order ON organisation_finance_entries(organisation_id, work_order_id, occurred_on DESC);
    CREATE INDEX IF NOT EXISTS idx_saas_audit_org ON saas_audit_events(organisation_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_threads_org ON ai_threads(organisation_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_render_jobs_org ON video_render_jobs(organisation_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date DESC);
    CREATE INDEX IF NOT EXISTS idx_expenses_booking ON expenses(booking_id, expense_date DESC);
    CREATE INDEX IF NOT EXISTS idx_performance_entity ON performance_events(entity_type, entity_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_referral_events_code ON referral_events(referrer_code, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_verification_org ON ai_verification_runs(organisation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_search_visibility_org ON search_visibility_snapshots(organisation_id, source, captured_at DESC);

  `);

  // Backwards-compatible SaaS identity migrations for secure Australian registration.
  const userColumns = new Set(db.prepare(`PRAGMA table_info(users)`).all().map((column) => column.name));
  for (const [name, definition] of [
    ['phone', `TEXT`],
    ['phone_verified', `INTEGER NOT NULL DEFAULT 0`],
    ['failed_login_attempts', `INTEGER NOT NULL DEFAULT 0`],
    ['locked_until', `TEXT`],
    ['last_login_at', `TEXT`]
  ]) {
    if (!userColumns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }

  const organisationColumns = new Set(db.prepare(`PRAGMA table_info(organisations)`).all().map((column) => column.name));
  for (const [name, definition] of [
    ['abn', `TEXT`],
    ['business_identifier_type', `TEXT NOT NULL DEFAULT 'ABN'`],
    ['business_identifier', `TEXT`],
    ['legal_name', `TEXT`],
    ['abn_status', `TEXT`],
    ['abn_verified_at', `TEXT`],
    ['state', `TEXT`],
    ['postcode', `TEXT`]
  ]) {
    if (!organisationColumns.has(name)) db.exec(`ALTER TABLE organisations ADD COLUMN ${name} ${definition}`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone IS NOT NULL`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_organisations_abn_unique ON organisations(abn) WHERE abn IS NOT NULL`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_organisations_identifier_unique ON organisations(business_identifier_type,business_identifier) WHERE business_identifier IS NOT NULL`);


  const pendingColumns = new Set(db.prepare(`PRAGMA table_info(pending_registrations)`).all().map((column) => column.name));
  for (const [name, definition] of [
    ['business_identifier_type', `TEXT NOT NULL DEFAULT 'ABN'`],
    ['business_identifier', `TEXT`]
  ]) {
    if (!pendingColumns.has(name)) db.exec(`ALTER TABLE pending_registrations ADD COLUMN ${name} ${definition}`);
  }


  const onboardingColumnsV14 = new Set(db.prepare(`PRAGMA table_info(onboarding_profiles)`).all().map((column) => column.name));
  for (const [name, definition] of [
    ['business_structure', `TEXT NOT NULL DEFAULT 'sole_trader'`],
    ['team_mode', `TEXT NOT NULL DEFAULT 'solo'`],
    ['custom_sections_json', `TEXT NOT NULL DEFAULT '[]'`],
    ['ai_setup_mode', `TEXT NOT NULL DEFAULT 'assist'`]
  ]) {
    if (!onboardingColumnsV14.has(name)) db.exec(`ALTER TABLE onboarding_profiles ADD COLUMN ${name} ${definition}`);
  }

  const pendingColumnsV14 = new Set(db.prepare(`PRAGMA table_info(pending_registrations)`).all().map((column) => column.name));
  if (!pendingColumnsV14.has('referral_code')) db.exec(`ALTER TABLE pending_registrations ADD COLUMN referral_code TEXT`);

  const organisationColumnsV14 = new Set(db.prepare(`PRAGMA table_info(organisations)`).all().map((column) => column.name));
  if (!organisationColumnsV14.has('referrer_code')) db.exec(`ALTER TABLE organisations ADD COLUMN referrer_code TEXT`);

  const metricColumnsV14 = new Set(db.prepare(`PRAGMA table_info(channel_metrics)`).all().map(row => row.name));
  const metricAdditionsV14 = [['impressions','INTEGER NOT NULL DEFAULT 0'],['reach','INTEGER NOT NULL DEFAULT 0'],['sends','INTEGER NOT NULL DEFAULT 0'],['delivered','INTEGER NOT NULL DEFAULT 0'],['opens','INTEGER NOT NULL DEFAULT 0'],['clicks','INTEGER NOT NULL DEFAULT 0'],['replies','INTEGER NOT NULL DEFAULT 0'],['leads','INTEGER NOT NULL DEFAULT 0'],['conversions','INTEGER NOT NULL DEFAULT 0'],['spend_cents','INTEGER NOT NULL DEFAULT 0'],['attributed_revenue_cents','INTEGER NOT NULL DEFAULT 0']];
  for (const [name, definition] of metricAdditionsV14) if (!metricColumnsV14.has(name)) db.exec(`ALTER TABLE channel_metrics ADD COLUMN ${name} ${definition}`);

  const referralEventColumnsV14 = new Set(db.prepare(`PRAGMA table_info(referral_events)`).all().map(row => row.name));
  if (!referralEventColumnsV14.has('direct_referrer_code')) db.exec(`ALTER TABLE referral_events ADD COLUMN direct_referrer_code TEXT`);

  const subscriptionColumns = new Set(db.prepare(`PRAGMA table_info(organisation_subscriptions)`).all().map((column) => column.name));
  for (const [name, definition] of [
    ['payment_provider', `TEXT`],
    ['payment_status', `TEXT NOT NULL DEFAULT 'unpaid'`],
    ['restricted_at', `TEXT`],
    ['archive_started_at', `TEXT`],
    ['retention_ends_at', `TEXT`],
    ['restore_window_ends_at', `TEXT`],
    ['deletion_due_at', `TEXT`],
    ['last_lifecycle_notice', `TEXT`]
  ]) {
    if (!subscriptionColumns.has(name)) db.exec(`ALTER TABLE organisation_subscriptions ADD COLUMN ${name} ${definition}`);
  }

  const auditColumns = new Set(db.prepare(`PRAGMA table_info(saas_audit_events)`).all().map((column) => column.name));
  for (const [name, definition] of [
    ['prev_hash', `TEXT`],
    ['event_hash', `TEXT`]
  ]) {
    if (!auditColumns.has(name)) db.exec(`ALTER TABLE saas_audit_events ADD COLUMN ${name} ${definition}`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_saas_audit_hash ON saas_audit_events(event_hash) WHERE event_hash IS NOT NULL`);


  const supportCaseColumns = new Set(db.prepare(`PRAGMA table_info(support_cases)`).all().map((column) => column.name));
  if (!supportCaseColumns.has('access_token_hash')) db.exec(`ALTER TABLE support_cases ADD COLUMN access_token_hash TEXT`);
  if (!supportCaseColumns.has('reported_party_role')) db.exec(`ALTER TABLE support_cases ADD COLUMN reported_party_role TEXT NOT NULL DEFAULT 'none'`);

  const securityNotificationColumns = new Set(db.prepare(`PRAGMA table_info(security_notifications)`).all().map((column) => column.name));
  if (!securityNotificationColumns.has('audience_role')) db.exec(`ALTER TABLE security_notifications ADD COLUMN audience_role TEXT NOT NULL DEFAULT 'senior'`);

  // Backwards-compatible migration for databases created before public reference codes were added.
  const columns = db.prepare(`PRAGMA table_info(enquiries)`).all().map((column) => column.name);
  if (!columns.includes('reference_code')) {
    db.exec(`ALTER TABLE enquiries ADD COLUMN reference_code TEXT`);
  }
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_enquiries_reference_code ON enquiries(reference_code)`);

  const enquiryColumns = new Set(db.prepare(`PRAGMA table_info(enquiries)`).all().map((column) => column.name));
  const additions = [
    ['customer_id', `TEXT`],
    ['priority', `TEXT NOT NULL DEFAULT 'normal'`],
    ['assigned_to', `TEXT`],
    ['next_action_at', `TEXT`],
    ['customer_consent_marketing', `INTEGER NOT NULL DEFAULT 0`],
    ['last_contact_at', `TEXT`]
  ];
  for (const [name, definition] of additions) {
    if (!enquiryColumns.has(name)) db.exec(`ALTER TABLE enquiries ADD COLUMN ${name} ${definition}`);
  }

  const conversationColumns = new Set(db.prepare(`PRAGMA table_info(conversations)`).all().map((column) => column.name));
  for (const [name, definition] of [
    ['record_class', `TEXT NOT NULL DEFAULT 'current'`],
    ['import_source', `TEXT`]
  ]) {
    if (!conversationColumns.has(name)) db.exec(`ALTER TABLE conversations ADD COLUMN ${name} ${definition}`);
  }

  const quoteColumns = new Set(db.prepare(`PRAGMA table_info(quotes)`).all().map((column) => column.name));
  for (const [name, definition] of [
    ['approved_at', `TEXT`],
    ['accepted_at', `TEXT`],
    ['sent_at', `TEXT`]
  ]) {
    if (!quoteColumns.has(name)) db.exec(`ALTER TABLE quotes ADD COLUMN ${name} ${definition}`);
  }

  const bookingColumns = new Set(db.prepare(`PRAGMA table_info(bookings)`).all().map((column) => column.name));
  if (!bookingColumns.has('quote_id')) db.exec(`ALTER TABLE bookings ADD COLUMN quote_id TEXT`);

  db.prepare(`
    INSERT OR IGNORE INTO receptionist_settings (
      id, business_name, greeting, transfer_number, service_area, business_hours,
      escalation_rules, updated_at
    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'Fleet Parlour',
    "Thank you for calling Fleet Parlour, Perth's mobile truck and metal polishing specialist. How can I help you today?",
    '',
    'Perth and surrounding areas, Western Australia',
    'Monday to Friday, 8:00 am to 5:00 pm',
    'Do not transfer routine enquiries. Transfer to the protected owner destination only when a genuine business caller explicitly requests Faiz/Faz/Faizan/the owner, or for a critical active-job safety/security issue that needs immediate owner attention. Otherwise save the enquiry and request a callback.',
    new Date().toISOString()
  );

  const services = [
    ['Truck polishing', 'Mobile truck and fleet metal polishing'],
    ['Bull bar polishing', 'Bull bar sanding, restoration and mirror polishing'],
    ['Fuel tank polishing', 'Aluminium fuel tank restoration and polishing'],
    ['Truck rim polishing', 'Truck wheel and alloy rim polishing'],
    ['Aluminium polishing', 'Aluminium component sanding and polishing'],
    ['Stainless steel polishing', 'Stainless steel restoration and polishing'],
    ['Metal polishing', 'Other metal components assessed individually']
  ];
  const insertService = db.prepare(`INSERT OR IGNORE INTO service_catalog (name, description) VALUES (?, ?)`);
  for (const service of services) insertService.run(...service);

  const now = new Date().toISOString();
  const channelSeed = [
    ['website','Fleet Parlour Website'],['whatsapp','WhatsApp Business'],['facebook','Facebook Page'],
    ['instagram','Instagram'],['tiktok','TikTok'],['youtube','YouTube'],['google','Google / Business Profile'],['snapchat','Snapchat'],['x','X / Twitter'],['email','Email'],['sms','SMS']
  ];
  const insertChannel = db.prepare(`INSERT OR IGNORE INTO channel_connections (channel,display_name,status,capabilities,updated_at) VALUES (?,?,'not_connected','{}',?)`);
  for (const channel of channelSeed) insertChannel.run(channel[0], channel[1], now);
  const insertMetric = db.prepare(`INSERT OR IGNORE INTO channel_metrics (channel,updated_at) VALUES (?,?)`);
  for (const channel of channelSeed) insertMetric.run(channel[0], now);
  db.prepare(`INSERT OR IGNORE INTO subscription_plans (id,name,setup_fee_cents,monthly_fee_cents,currency,limits_json,active,created_at,updated_at) VALUES ('founder-trial','Founder Trial',0,0,'AUD','{"business_users":5,"ai_usage":"metered","storage":"configurable"}',1,?,?)`).run(now,now);
  db.prepare(`INSERT OR IGNORE INTO subscription_plans (id,name,setup_fee_cents,monthly_fee_cents,currency,limits_json,active,created_at,updated_at) VALUES ('starter','Starter',0,9900,'AUD','{"business_users":3,"ai_usage":"core","workforce_compliance":"basic","job_eligibility":false,"storage":"standard"}',1,?,?)`).run(now,now);
  db.prepare(`INSERT OR IGNORE INTO subscription_plans (id,name,setup_fee_cents,monthly_fee_cents,currency,limits_json,active,created_at,updated_at) VALUES ('operations','Operations',0,19900,'AUD','{"business_users":10,"ai_usage":"operations","workforce_compliance":"full","job_eligibility":true,"storage":"expanded"}',1,?,?)`).run(now,now);
  db.prepare(`INSERT OR IGNORE INTO subscription_plans (id,name,setup_fee_cents,monthly_fee_cents,currency,limits_json,active,created_at,updated_at) VALUES ('scale','Scale',0,34900,'AUD','{"business_users":25,"ai_usage":"higher_limits","workforce_compliance":"full","job_eligibility":true,"advanced_permissions":true,"storage":"high"}',1,?,?)`).run(now,now);

  const receptionistColumns = new Set(db.prepare(`PRAGMA table_info(receptionist_settings)`).all().map((column) => column.name));
  const receptionistAdditions = [
    ['required_questions', `TEXT NOT NULL DEFAULT ''`],
    ['screening_mode', `TEXT NOT NULL DEFAULT 'business_only'`],
    ['personal_transfer_rules', `TEXT NOT NULL DEFAULT ''`],
    ['recording_notice', `TEXT NOT NULL DEFAULT ''`],
    ['business_public_number', `TEXT NOT NULL DEFAULT ''`],
    ['whatsapp_business_number', `TEXT NOT NULL DEFAULT ''`],
    ['owner_transfer_enabled', `INTEGER NOT NULL DEFAULT 1`],
    ['direct_owner_transfer_rules', `TEXT NOT NULL DEFAULT ''`],
    ['voice_preference', `TEXT NOT NULL DEFAULT 'provider_default'`],
    ['voice_locale', `TEXT NOT NULL DEFAULT 'en-AU'`]
  ];
  for (const [name, definition] of receptionistAdditions) {
    if (!receptionistColumns.has(name)) db.exec(`ALTER TABLE receptionist_settings ADD COLUMN ${name} ${definition}`);
  }

  db.prepare(`
    UPDATE receptionist_settings SET
      required_questions = CASE WHEN required_questions = '' THEN ? ELSE required_questions END,
      personal_transfer_rules = CASE WHEN personal_transfer_rules = '' THEN ? ELSE personal_transfer_rules END,
      recording_notice = CASE WHEN recording_notice = '' THEN ? ELSE recording_notice END,
      direct_owner_transfer_rules = CASE WHEN direct_owner_transfer_rules = '' THEN ? ELSE direct_owner_transfer_rules END
    WHERE id = 1
  `).run(
    'Customer name; callback number; email; Perth suburb or job address; truck make and model; polishing service; parts and quantities; current condition; preferred date; whether it is one vehicle or a fleet; request job photos.',
    'Legacy personal-call routing is disabled. The receptionist handles business calls only. Requests to speak directly with the owner may use the protected owner-transfer rule without revealing a private number.',
    'After the caller confirms the call is for Fleet Parlour: This business call may be recorded and transcribed to manage your enquiry. Would you like to continue?',
    'Fleet Parlour is currently mobile/on-site only and has no customer drop-off workshop. Never offer a workshop address. If a genuine business caller explicitly requests Faiz, Faz, Faizan or the owner, confirm the business reason and callback details, then use the protected owner transfer destination if configured. Critical active-job safety/security matters may also escalate immediately. Never disclose the owner private number. Routine enquiries must be saved and forwarded for follow-up rather than transferred.'
  );

  // Give existing enquiries a stable, customer-friendly reference without changing their internal UUID.
  const missingRefs = db.prepare(`SELECT id FROM enquiries WHERE reference_code IS NULL OR reference_code = ''`).all();
  const updateRef = db.prepare(`UPDATE enquiries SET reference_code = ? WHERE id = ?`);
  for (const row of missingRefs) {
    const compact = String(row.id).replace(/-/g, '').slice(0, 8).toUpperCase();
    updateRef.run(`FP-${compact}`, row.id);
  }


  const policyNow = new Date().toISOString();
  const policySeed = [
    ['privacy','Privacy & Personal Information','all','all','1.0','Privacy handling, access, security, retention and complaint pathways.','Super Pro AI Office Manager is designed to support organisation-scoped privacy controls, access restrictions, retention decisions, correction/export workflows and incident response. Australian Privacy Act and APP obligations depend on the entity and circumstances; this template requires legal review before commercial reliance.',1,'Australian Privacy Principles / OAIC guidance'],
    ['complaints','Complaints & Fair Resolution','all','all','1.0','A clear pathway to raise concerns, receive a reference, track progress and escalate serious matters.','Complaints should be acknowledged, triaged, handled fairly, protected from inappropriate access and escalated when serious. Automated triage may assist routing, but consequential outcomes require authorised human review.',1,'Governance template; sector-specific review required'],
    ['acceptable-use','Acceptable Use & Security','all','staff','1.0','Rules for accounts, credentials, customer data, integrations, devices and prohibited misuse.','Users must protect credentials, use only authorised access, avoid exporting or disclosing information without authority, and report suspected compromise promptly. Privileged access should use MFA and least-privilege controls.',1,'Security governance template'],
    ['ai-governance','AI & Automated Decision Governance','all','all','1.0','Human oversight, transparency and restrictions for consequential AI-assisted actions.','AI may draft, classify, summarise and recommend. Employment, legal, financial, safety, privacy, complaint outcomes and other consequential decisions require authorised human review. Significant automated decisions involving personal information require additional transparency where applicable.',1,'Privacy/AI governance template'],
    ['whistleblower','Protected Disclosure / Whistleblower Framework','all','staff','1.0','Confidential reporting pathway for eligible protected disclosures where applicable.','This channel must not promise statutory whistleblower protection to every complaint. Eligibility, recipients, confidentiality and protections depend on the Corporations Act and the circumstances. Reports that may qualify should be restricted to authorised recipients and escalated for legal/governance review.',0,'ASIC whistleblower guidance; applicability varies'],
    ['data-breach','Data Breach & Incident Response','all','staff','1.0','Detection, containment, assessment, escalation, evidence preservation and notification workflow.','Security incidents should be contained and assessed promptly. Where the Notifiable Data Breaches scheme applies, eligible data breaches may require notification to affected individuals and the OAIC. Preserve evidence and restrict incident records to authorised roles.',1,'OAIC Notifiable Data Breaches guidance'],
    ['marketing','Electronic Marketing & Consent','all','marketing','1.0','Consent, sender identification, opt-out and suppression-list controls for commercial messages.','Commercial email and SMS workflows should record consent or another permitted basis, identify the sender accurately, provide a functional unsubscribe mechanism and honour opt-outs. Service messages should be kept separate from promotional content where appropriate.',1,'ACMA Spam Act guidance'],
    ['workplace','Workplace Conduct, Grievances & Safety','all','staff','1.0','Role-aware process for workplace concerns, grievances, conduct and safety escalation.','Workplace concerns should be routed to an appropriate person who is not conflicted. Serious allegations, safety matters, harassment/discrimination concerns and complaints about a direct manager should bypass that manager and be escalated to an authorised senior person or designated officer.',1,'Workplace governance template; employment law review required'],
    ['records-retention','Data Retention, Legal Holds & Secure Disposal','all','staff','1.0','Retention schedules, legal holds, evidence integrity, de-identification and secure disposal.','Operational records should follow a documented retention schedule. Records subject to an active legal hold, investigation or lawful retention duty must be preserved; personal information no longer required should be securely destroyed or de-identified where applicable. Tamper-evident records should minimise personal content and use controlled redaction/de-identification rather than silent editing.',1,'OAIC APP 11 / records-governance template; sector retention review required'],
    ['privileged-access','Privileged Access & Audit Review','all','staff','1.0','Least privilege, MFA, senior-only security logs, conflict controls and review of privileged activity.','Owner, administrator, complaint, privacy and security privileges should be limited to authorised people, protected by strong authentication and reviewed periodically. Sensitive audit records are restricted; conflict-of-interest controls prevent a person or role from administering a complaint that concerns them.',1,'Security governance template'],
    ['connected-services','Connected Services & Credential Handling','all','all','1.0','Safe connection of social, communications, website and business services without exposing developer secrets.','Customers should connect services through approved provider-authorisation flows. Platform secrets and refresh credentials belong in server-side secret storage, never customer-facing forms or browser storage. Access scopes should be minimised and connections revocable.',1,'Integration-security template'],
    ['trade-site','Site Safety & Job Evidence','Trades & field services','staff','1.0','Field-job safety, customer property, before/after evidence and escalation controls.','Field teams should follow job-specific safety procedures, protect customer property, record required evidence accurately and escalate hazards or scope changes before continuing where appropriate. This template does not replace WHS obligations or trade-specific procedures.',1,'Industry overlay — legal/WHS review required'],
    ['property-data','Property, Client & Occupant Information','Real estate & property services','staff','1.0','Separation and careful handling of property, client, buyer, tenant and occupant information.','Property-service workflows should keep client and property context correctly separated, restrict access to personal information by role, and avoid disclosing occupant, buyer, tenant or owner information outside authorised purposes.',1,'Industry overlay — property/privacy review required'],
    ['salon-client','Client Appointments & Sensitive Service Notes','Salon & hairdressing','staff','1.0','Appointment, preference, image and service-note handling for salon clients.','Only collect client preferences, images and service notes needed for the service or authorised marketing. Keep marketing consent separate from service records and restrict access to sensitive client notes.',1,'Industry overlay — privacy/marketing review required'],
    ['professional-confidentiality','Client Confidentiality & Document Handling','Accounting & professional services','staff','1.0','Confidential client files, deadlines, document requests and professional-service boundaries.','Client documents and confidential records should be access-controlled, transmitted through approved channels and retained only as required. AI-generated material must be reviewed by an authorised professional before reliance on consequential advice.',1,'Industry overlay — professional obligations review required'],
    ['mobile-location','Mobile Service Location & Lone-Work Controls','Mobile & appointment services','staff','1.0','Location, travel, appointment and lone-worker safety controls.','Use customer addresses and travel information only for the service purpose, limit visibility to assigned staff, and escalate safety or access concerns. Businesses should define their own lone-work and travel safety procedures.',1,'Industry overlay — safety/privacy review required']
  ];
  const insertPolicy = db.prepare(`INSERT OR IGNORE INTO governance_policies (id,jurisdiction,industry,audience,policy_key,title,version,status,effective_from,summary,body_markdown,requires_ack,source_note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const row of policySeed) {
    const [key,title,industry,audience,version,summary,body,ack,source] = row;
    insertPolicy.run(`au-${key}-${version}`,'AU',industry,audience,key,title,version,'draft',null,summary,body,ack,source,policyNow,policyNow);
  }

  return db;
}
