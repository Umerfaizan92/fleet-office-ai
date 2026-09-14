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
      screening_mode TEXT NOT NULL DEFAULT 'business_or_personal',
      personal_transfer_rules TEXT NOT NULL DEFAULT '',
      recording_notice TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS organisations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'trial',
      timezone TEXT NOT NULL DEFAULT 'Australia/Perth',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      mfa_secret TEXT,
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      email_verified INTEGER NOT NULL DEFAULT 0,
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE,
      FOREIGN KEY(plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT
    );

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
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON user_sessions(token_hash, expires_at);
    CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id, organisation_id);
    CREATE INDEX IF NOT EXISTS idx_workers_org ON workers(organisation_id,status);
    CREATE INDEX IF NOT EXISTS idx_worker_documents_worker ON worker_documents(worker_id,expiry_date);
    CREATE INDEX IF NOT EXISTS idx_work_orders_org ON work_orders(organisation_id,start_at,status);
    CREATE INDEX IF NOT EXISTS idx_job_offers_worker ON job_offers(worker_id,status);
    CREATE INDEX IF NOT EXISTS idx_saas_audit_org ON saas_audit_events(organisation_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_threads_org ON ai_threads(organisation_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_render_jobs_org ON video_render_jobs(organisation_id, updated_at DESC);
  `);

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
    '0404 946 656',
    'Perth and surrounding areas, Western Australia',
    'Monday to Friday, 8:00 am to 5:00 pm',
    'Transfer when the caller asks for a person, has a complaint, reports a safety issue, or has a high-value fleet enquiry.',
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
    ['instagram','Instagram'],['tiktok','TikTok'],['youtube','YouTube'],['email','Email'],['sms','SMS']
  ];
  const insertChannel = db.prepare(`INSERT OR IGNORE INTO channel_connections (channel,display_name,status,capabilities,updated_at) VALUES (?,?,'not_connected','{}',?)`);
  for (const channel of channelSeed) insertChannel.run(channel[0], channel[1], now);
  db.prepare(`INSERT OR IGNORE INTO subscription_plans (id,name,setup_fee_cents,monthly_fee_cents,currency,limits_json,active,created_at,updated_at) VALUES ('founder-trial','Founder Trial',0,0,'AUD','{"business_users":5,"ai_usage":"metered","storage":"configurable"}',1,?,?)`).run(now,now);

  const receptionistColumns = new Set(db.prepare(`PRAGMA table_info(receptionist_settings)`).all().map((column) => column.name));
  const receptionistAdditions = [
    ['required_questions', `TEXT NOT NULL DEFAULT ''`],
    ['screening_mode', `TEXT NOT NULL DEFAULT 'business_or_personal'`],
    ['personal_transfer_rules', `TEXT NOT NULL DEFAULT ''`],
    ['recording_notice', `TEXT NOT NULL DEFAULT ''`]
  ];
  for (const [name, definition] of receptionistAdditions) {
    if (!receptionistColumns.has(name)) db.exec(`ALTER TABLE receptionist_settings ADD COLUMN ${name} ${definition}`);
  }

  db.prepare(`
    UPDATE receptionist_settings SET
      required_questions = CASE WHEN required_questions = '' THEN ? ELSE required_questions END,
      personal_transfer_rules = CASE WHEN personal_transfer_rules = '' THEN ? ELSE personal_transfer_rules END,
      recording_notice = CASE WHEN recording_notice = '' THEN ? ELSE recording_notice END
    WHERE id = 1
  `).run(
    'Customer name; callback number; email; Perth suburb or job address; truck make and model; polishing service; parts and quantities; current condition; preferred date; whether it is one vehicle or a fleet; request job photos.',
    'Known private contacts bypass the business workflow. If an unknown caller says the call is personal, from a government department, medical service, lawyer, family member or friend, transfer immediately and do not create a business enquiry.',
    'After the caller confirms the call is for Fleet Parlour: This business call may be recorded and transcribed to manage your enquiry. Would you like to continue?'
  );

  // Give existing enquiries a stable, customer-friendly reference without changing their internal UUID.
  const missingRefs = db.prepare(`SELECT id FROM enquiries WHERE reference_code IS NULL OR reference_code = ''`).all();
  const updateRef = db.prepare(`UPDATE enquiries SET reference_code = ? WHERE id = ?`);
  for (const row of missingRefs) {
    const compact = String(row.id).replace(/-/g, '').slice(0, 8).toUpperCase();
    updateRef.run(`FP-${compact}`, row.id);
  }

  return db;
}
