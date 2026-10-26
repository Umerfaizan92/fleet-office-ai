// Payment provider activation: what each provider needs, what is certified by whom, and the owner's written
// authorisation to connect it. Super Pro never holds card numbers; the provider's own certifications (for example
// PCI DSS) belong to the provider and are shown here as information only, never as a Super Pro certification.
import { z } from 'zod';
import crypto from 'node:crypto';
import { appendAuditLog } from './db.js';

export const AUTH_VERSION = '2026-10';
const OWNERS = ['owner', 'admin'];
const iso = () => new Date().toISOString();

export const PROVIDER_CHECKS = {
  stripe: {
    name: 'Stripe (card, Apple Pay, Google Pay)',
    needs: 'A Stripe account in your business name, with identity checks completed and payouts to your bank turned on.',
    certification: 'Stripe is certified by the card schemes as a PCI DSS Level 1 service provider. That certification belongs to Stripe. Card details go straight to Stripe and never reach Super Pro.',
    statements: [
      ['own', 'This Stripe account belongs to my business and I am authorised to connect it.'],
      ['terms', 'I have read and accept Stripe\'s terms for my account, and I am responsible for them.'],
      ['wallets', 'I understand Apple Pay and Google Pay appear on the pay page only after they are switched on in my own Stripe dashboard.']
    ]
  },
  paypal: {
    name: 'PayPal',
    needs: 'A PayPal Business account with a verified email, and a REST app (client ID and secret) from the PayPal developer dashboard.',
    certification: 'PayPal holds its own PCI DSS compliance. Buyer details stay with PayPal.',
    statements: [
      ['own', 'This PayPal account belongs to my business and I am authorised to connect it.'],
      ['terms', 'I have read and accept PayPal\'s terms for my account, and I am responsible for them.']
    ]
  },
  bank: {
    name: 'Bank transfer / PayID',
    needs: 'Your business bank account name, BSB and account number (and PayID if you use one).',
    certification: 'No card data is involved. Customers pay from their own bank. Bank transfers are confirmed by you, because a bank does not tell Super Pro when money arrives.',
    statements: [
      ['own', 'This bank account is in my business\'s name and I am authorised to receive payments into it.'],
      ['accurate', 'The account details I entered are correct. I understand customers will be shown them on invoices and pay links.']
    ]
  }
};

export function createBillingSetup({ db }) {
  db.exec(`CREATE TABLE IF NOT EXISTS billing_authorisations (
    id TEXT PRIMARY KEY, organisation_id TEXT NOT NULL, provider TEXT NOT NULL, version TEXT NOT NULL,
    statements TEXT NOT NULL, confirmed_by TEXT, confirmed_at TEXT NOT NULL, withdrawn_at TEXT,
    FOREIGN KEY(organisation_id) REFERENCES organisations(id) ON DELETE CASCADE);
    CREATE INDEX IF NOT EXISTS idx_billing_auth ON billing_authorisations(organisation_id, provider);`);

  const current = (org, provider) => db.prepare(`SELECT * FROM billing_authorisations WHERE organisation_id=? AND provider=? AND withdrawn_at IS NULL ORDER BY confirmed_at DESC LIMIT 1`).get(org, provider);

  function install(app, { requireSaasUser, requireSaasRole, saasAudit }) {
    const guard = [requireSaasUser, requireSaasRole(...OWNERS)];
    app.get('/api/saas/billing/setup', ...guard, (req, res) => {
      const org = req.saas.organisation_id;
      const row = db.prepare(`SELECT * FROM payment_settings WHERE organisation_id=?`).get(org) || {};
      const connected = { stripe: Boolean(row.stripe_secret_enc), paypal: Boolean(row.paypal_client_id && row.paypal_secret_enc), bank: Boolean(row.bank_bsb && row.bank_account_number) };
      const providers = Object.entries(PROVIDER_CHECKS).map(([id, p]) => {
        const a = current(org, id);
        return { id, name: p.name, needs: p.needs, certification: p.certification, connected: connected[id], statements: p.statements.map(([key, text]) => ({ key, text })),
          authorised: Boolean(a && a.version === AUTH_VERSION), authorised_at: a?.confirmed_at || null, authorised_version: a?.version || null,
          status: connected[id] ? (a && a.version === AUTH_VERSION ? 'live' : 'needs_authorisation') : 'not_connected' };
      });
      res.json({ ok: true, version: AUTH_VERSION, providers });
    });
    app.post('/api/saas/billing/authorise', ...guard, (req, res) => {
      const p = z.object({ provider: z.enum(Object.keys(PROVIDER_CHECKS)), confirmed: z.array(z.string()).max(10) }).safeParse(req.body);
      if (!p.success) return res.status(400).json({ ok: false, error: 'Choose a provider and tick each statement.' });
      const need = PROVIDER_CHECKS[p.data.provider].statements.map(([k]) => k);
      if (!need.every((k) => p.data.confirmed.includes(k))) return res.status(400).json({ ok: false, error: 'Tick every statement to confirm. Nothing is saved until you do.' });
      const org = req.saas.organisation_id, id = crypto.randomUUID();
      db.prepare(`UPDATE billing_authorisations SET withdrawn_at=? WHERE organisation_id=? AND provider=? AND withdrawn_at IS NULL`).run(iso(), org, p.data.provider);
      db.prepare(`INSERT INTO billing_authorisations (id,organisation_id,provider,version,statements,confirmed_by,confirmed_at) VALUES (?,?,?,?,?,?,?)`).run(id, org, p.data.provider, AUTH_VERSION, JSON.stringify(need), req.saas.user_id, iso());
      saasAudit(req, 'billing.provider_authorised', 'billing_authorisation', id, { provider: p.data.provider, version: AUTH_VERSION });
      res.json({ ok: true, message: `${PROVIDER_CHECKS[p.data.provider].name} is now authorised.` });
    });
    app.post('/api/saas/billing/withdraw', ...guard, (req, res) => {
      const p = z.object({ provider: z.enum(Object.keys(PROVIDER_CHECKS)) }).safeParse(req.body);
      if (!p.success) return res.status(400).json({ ok: false, error: 'Choose a provider.' });
      const org = req.saas.organisation_id;
      const r = db.prepare(`UPDATE billing_authorisations SET withdrawn_at=? WHERE organisation_id=? AND provider=? AND withdrawn_at IS NULL`).run(iso(), org, p.data.provider);
      if (!r.changes) return res.status(404).json({ ok: false, error: 'There is no authorisation to withdraw.' });
      saasAudit(req, 'billing.provider_authorisation_withdrawn', 'billing_authorisation', p.data.provider, { provider: p.data.provider });
      res.json({ ok: true, message: 'Authorisation withdrawn. New payment links for that provider are paused until you confirm again.' });
    });
  }
  return { install, isAuthorised: (org, provider) => { const a = current(org, provider); return Boolean(a && a.version === AUTH_VERSION); } };
}
