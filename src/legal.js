// Records who accepted which version of the Terms, Privacy Notice and Acceptable Use rules.
// Anyone signed in (owner, staff, worker account) is asked once per version. Nothing is deleted when a version changes.
import crypto from 'node:crypto';
import { z } from 'zod';

export const LEGAL_VERSION = 'terms-2026-10-28';
export const DOCS = [
  { id: 'terms', title: 'Terms of Service', url: '/saas/terms.html' },
  { id: 'privacy', title: 'Privacy Notice', url: '/saas/privacy.html' }
];

export function installLegal(app, { db, requireSaasUser, saasAudit }) {
  db.exec(`CREATE TABLE IF NOT EXISTS legal_acceptances (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, organisation_id TEXT, version TEXT NOT NULL, role TEXT, ip TEXT, accepted_at TEXT NOT NULL,
    UNIQUE(user_id, version));`);
  app.get('/api/saas/legal', requireSaasUser, (req, res) => {
    const row = db.prepare(`SELECT accepted_at FROM legal_acceptances WHERE user_id=? AND version=?`).get(req.saas.user_id, LEGAL_VERSION);
    res.json({ ok: true, version: LEGAL_VERSION, accepted: Boolean(row), accepted_at: row?.accepted_at || null, documents: DOCS });
  });
  app.post('/api/saas/legal/accept', requireSaasUser, (req, res) => {
    const p = z.object({ version: z.literal(LEGAL_VERSION), agree: z.literal(true) }).safeParse(req.body);
    if (!p.success) return res.status(400).json({ ok: false, error: 'Please tick the box to agree.' });
    db.prepare(`INSERT OR IGNORE INTO legal_acceptances (id,user_id,organisation_id,version,role,ip,accepted_at) VALUES (?,?,?,?,?,?,?)`).run(crypto.randomUUID(), req.saas.user_id, req.saas.organisation_id, LEGAL_VERSION, req.saas.role, req.ip || null, new Date().toISOString());
    saasAudit(req, 'legal.accepted', 'user', req.saas.user_id, { version: LEGAL_VERSION });
    res.json({ ok: true });
  });
}
