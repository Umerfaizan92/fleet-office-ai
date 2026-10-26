// Background jobs that close gaps people would otherwise have to remember: connections that quietly expire,
// stock that needs reordering, and a content calendar that is about to run out. Each alert goes to the owner once.
import { appendAuditLog } from './db.js';

const DAY = 86400000;

export function createAutomation({ db, runtime, notify, decrypt, persist, audit = (entry) => appendAuditLog(db, entry) }) {
  const day = () => new Date().toISOString().slice(0, 10);

  // Test each connected platform about once a day. A refreshed token is saved; a failure tells the owner to reconnect.
  async function checkConnections() {
    const rows = db.prepare(`SELECT * FROM organisation_integrations WHERE status='connected' AND provider NOT IN ('website','email_sms')`).all();
    let failed = 0;
    for (const row of rows) {
      let settings = {}; try { settings = JSON.parse(row.settings_json || '{}'); } catch { /* ignore */ }
      if (settings.last_tested_at && Date.now() - Date.parse(settings.last_tested_at) < DAY) continue;
      const stamp = (extra) => db.prepare(`UPDATE organisation_integrations SET settings_json=?,updated_at=? WHERE organisation_id=? AND provider=?`).run(JSON.stringify({ ...settings, last_tested_at: new Date().toISOString(), ...extra }), new Date().toISOString(), row.organisation_id, row.provider);
      try {
        const bundle = decrypt(row);
        if (!bundle) throw new Error('No saved sign-in for this platform.');
        const r = await runtime.testConnection(row.provider, bundle);
        if (r.refreshed) persist(row, r.bundle, { last_test_status: 'pass', last_test_error: null });
        else stamp({ last_test_status: 'pass', last_test_error: null });
        audit({ organisation_id: row.organisation_id, action: 'integration.daily_check', module: 'integration', entity_type: 'integration', entity_id: row.provider, metadata: { ok: true, refreshed: Boolean(r.refreshed) } });
      } catch (err) {
        failed++;
        const msg = String(err?.message || err).slice(0, 300);
        stamp({ last_test_status: 'fail', last_test_error: msg });
        audit({ organisation_id: row.organisation_id, action: 'integration.daily_check', module: 'integration', entity_type: 'integration', entity_id: row.provider, metadata: { ok: false, error: msg } });
        await notify.notifyRoles(row.organisation_id, ['owner', 'admin'], { kind: 'connection', title: `Reconnect ${row.display_name || row.provider}`, body: 'Super Pro could not reach this platform, so scheduled posts and messages may stop. Open Connections and sign in again.', link: '#marketing/connections', urgent: true, dedupe: `conn:${row.provider}:${day()}` });
      }
    }
    return failed;
  }

  // One alert a day at most per business, listing the items to reorder.
  async function checkStock() {
    let n = 0;
    for (const { organisation_id: org } of db.prepare(`SELECT DISTINCT organisation_id FROM stock_items WHERE active=1`).all()) {
      const low = db.prepare(`SELECT i.name,i.unit,i.reorder_level,COALESCE((SELECT SUM(qty) FROM stock_moves m WHERE m.item_id=i.id),0) on_hand FROM stock_items i WHERE i.organisation_id=? AND i.active=1 AND i.reorder_level>0`).all(org).filter((i) => i.on_hand <= i.reorder_level);
      if (!low.length) continue;
      n++;
      await notify.notifyRoles(org, ['owner', 'admin', 'manager'], { kind: 'stock', title: `${low.length} item${low.length === 1 ? '' : 's'} to reorder`, body: low.slice(0, 5).map((i) => `${i.name}: ${Math.round(i.on_hand * 100) / 100} ${i.unit} left`).join(', ') + (low.length > 5 ? ` and ${low.length - 5} more` : ''), link: '#customers/stock', dedupe: `stock:${day()}` });
    }
    return n;
  }

  // When fewer than 3 days of approved content are left, remind the owner to plan the next batch.
  async function checkCalendar() {
    let n = 0;
    for (const { organisation_id: org } of db.prepare(`SELECT DISTINCT organisation_id FROM growth_calendar`).all()) {
      const ahead = db.prepare(`SELECT COUNT(*) c FROM growth_calendar WHERE organisation_id=? AND status IN ('approved','draft') AND scheduled_at>? AND scheduled_at<=?`).get(org, new Date().toISOString(), new Date(Date.now() + 3 * DAY).toISOString()).c;
      if (ahead > 0) continue;
      n++;
      await notify.notifyRoles(org, ['owner', 'admin'], { kind: 'content', title: 'Your content calendar is running out', body: 'Nothing is scheduled for the next 3 days. Open Growth to plan and approve the next batch.', link: '#marketing/growth', dedupe: `calendar:${day()}` });
    }
    return n;
  }

  async function runAll() { const out = { connections: await checkConnections(), stock: await checkStock(), calendar: await checkCalendar() }; return out; }
  const timer = setInterval(() => { runAll().catch((e) => console.warn('[automation]', e.message)); }, 3 * 3600 * 1000);
  timer.unref?.();
  return { checkConnections, checkStock, checkCalendar, runAll };
}
