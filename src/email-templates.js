// One email layout for everything Super Pro sends. Platform emails carry the Super Pro name and icon; emails sent on a
// business's behalf (receipts, invoices, payment reminders) carry only that business's name, colour and logo.
import fs from 'node:fs';
import path from 'node:path';

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeColor = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : fallback);
const safeUrl = (v) => (/^https?:\/\//i.test(String(v || '')) ? v : '');

export const PLATFORM_NAME = 'Super Pro AI Office Manager';
export const platformBrand = (env) => ({ name: PLATFORM_NAME, color: '#b8892f', logoSrc: `${String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '')}/saas/superpro-icon-192.png`, footer: [`${PLATFORM_NAME}`, 'You receive this because you have an account on the platform.'] });

// The business logo is attached inline (it is private, so it cannot be linked). Returns null when the business has no logo.
export function tenantBrandFor(db, uploadRoot, organisationId) {
  const o = db.prepare(`SELECT COALESCE(display_name,name) name, brand_primary_color color, brand_logo_url logo, abn FROM organisations WHERE id=?`).get(organisationId) || {};
  let attachment = null;
  const file = path.basename(String(o.logo || ''));
  if (/^[a-f0-9-]{36}\.(png|jpg|webp)$/i.test(file)) {
    const p = path.join(uploadRoot, 'branding', organisationId, file);
    if (fs.existsSync(p) && fs.statSync(p).size < 1_000_000) attachment = { filename: file, content: fs.readFileSync(p).toString('base64'), contentId: 'brandlogo' };
  }
  const name = o.name || 'Your business';
  return { name, color: safeColor(o.color, '#b8892f'), logoSrc: attachment ? 'cid:brandlogo' : '', attachments: attachment ? [attachment] : [], footer: [name + (o.abn ? ` · ABN ${o.abn}` : ''), 'Please keep this email for your records.'] };
}

// frame: { heading, paragraphs[], facts:[[label,value]], button:{label,url}, notes[] }
export function renderEmail(brand, frame) {
  const color = safeColor(brand.color, '#b8892f');
  const p = (frame.paragraphs || []).filter(Boolean), facts = (frame.facts || []).filter((f) => f[1] !== undefined && f[1] !== null && f[1] !== ''), notes = (frame.notes || []).filter(Boolean);
  const button = frame.button && safeUrl(frame.button.url) ? frame.button : null;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f1ec;font-family:Arial,Helvetica,sans-serif;color:#1c2330"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1ec;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3ddd0">
<tr><td style="background:#0d1117;padding:18px 24px;border-bottom:4px solid ${color}"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${brand.logoSrc ? `<td style="padding-right:12px"><img src="${escapeHtml(brand.logoSrc)}" alt="" width="40" height="40" style="display:block;border-radius:8px;object-fit:contain;background:#fff"></td>` : ''}<td style="color:#f5efe0;font-size:17px;font-weight:bold">${escapeHtml(brand.name)}</td></tr></table></td></tr>
<tr><td style="padding:26px 24px 8px"><h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:#10151d">${escapeHtml(frame.heading)}</h1>${p.map((t) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${escapeHtml(t).replace(/\n/g, '<br>')}</p>`).join('')}
${facts.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 16px;border:1px solid #e3ddd0;border-radius:10px">${facts.map(([k, v]) => `<tr><td style="padding:9px 14px;font-size:13px;color:#5b6575;width:42%;border-bottom:1px solid #eee8db">${escapeHtml(k)}</td><td style="padding:9px 14px;font-size:14px;font-weight:bold;border-bottom:1px solid #eee8db">${escapeHtml(v)}</td></tr>`).join('')}</table>` : ''}
${button ? `<p style="margin:8px 0 18px"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:${color};color:#17130b;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 22px;border-radius:10px">${escapeHtml(button.label)}</a></p>` : ''}
${notes.map((t) => `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#5b6575">${escapeHtml(t).replace(/\n/g, '<br>')}</p>`).join('')}</td></tr>
<tr><td style="padding:16px 24px 22px;border-top:1px solid #eee8db;font-size:12px;line-height:1.5;color:#7b8494">${(brand.footer || []).map(escapeHtml).join('<br>')}</td></tr></table></td></tr></table></body></html>`;
  const text = [brand.name, '', frame.heading, '', ...p.flatMap((t) => [t, '']), ...facts.map(([k, v]) => `${k}: ${v}`), ...(facts.length ? [''] : []), ...(button ? [`${button.label}: ${button.url}`, ''] : []), ...notes.flatMap((t) => [t, '']), ...(brand.footer || [])].join('\n');
  return { html, text };
}
