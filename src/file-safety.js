// Checks an uploaded file before it is stored: real content type from its first bytes, size, dangerous formats,
// and an optional malware scan through a ClamAV daemon (clamd). Nothing here trusts the file name or the browser's type.
import net from 'node:net';

const startsWith = (buf, bytes, offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf, from, to) => buf.subarray(from, to).toString('latin1');

// Families a declared type may belong to. A file is accepted only when its sniffed family matches its declared type.
const FAMILY_OF_TYPE = {
  'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'image/heic': 'isobmff', 'image/heif': 'isobmff', 'video/mp4': 'isobmff', 'video/quicktime': 'isobmff',
  'video/webm': 'webm', 'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'zip',
  'text/csv': 'text', 'text/plain': 'text'
};
export const ALLOWED_TYPES = Object.keys(FAMILY_OF_TYPE);

export function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return 'unknown';
  if (startsWith(buf, [0x4d, 0x5a])) return 'executable';                 // Windows MZ
  if (startsWith(buf, [0x7f, 0x45, 0x4c, 0x46])) return 'executable';     // ELF
  if (startsWith(buf, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(buf, [0xfe, 0xed, 0xfa, 0xcf]) || startsWith(buf, [0xca, 0xfe, 0xba, 0xbe])) return 'executable'; // Mach-O
  if (startsWith(buf, [0x23, 0x21])) return 'script';                       // #! shebang
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (ascii(buf, 0, 4) === 'RIFF' && buf.length >= 12 && ascii(buf, 8, 12) === 'WEBP') return 'webp';
  if (ascii(buf, 0, 4) === 'GIF8') return 'gif';
  if (buf.length >= 12 && ascii(buf, 4, 8) === 'ftyp') return 'isobmff';    // MP4, MOV, HEIC/HEIF
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm';
  if (ascii(buf, 0, 5) === '%PDF-') return 'pdf';
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return 'zip';
  const head = buf.subarray(0, Math.min(buf.length, 4096));
  const text = head.toString('utf8');
  if (/<\s*(script|svg|html|iframe|object|embed)\b/i.test(text)) return 'markup';
  if (!head.includes(0)) return 'text';
  return 'unknown';
}

export function validateFile(buf, { declaredType, maxBytes = 25 * 1024 * 1024, allowed = ALLOWED_TYPES } = {}) {
  const type = String(declaredType || '').toLowerCase().split(';')[0].trim();
  if (!Buffer.isBuffer(buf) || !buf.length) return { ok: false, reason: 'empty', message: 'The file is empty.' };
  if (buf.length > maxBytes) return { ok: false, reason: 'too_large', message: 'That file is too large.' };
  if (!allowed.includes(type) || !FAMILY_OF_TYPE[type]) return { ok: false, reason: 'type_not_allowed', message: 'That type of file is not accepted here.' };
  const family = sniff(buf);
  if (['executable', 'script', 'markup'].includes(family)) return { ok: false, reason: 'dangerous_content', message: 'That file contains program or web code and cannot be stored.' };
  if (family !== FAMILY_OF_TYPE[type]) return { ok: false, reason: 'type_mismatch', message: 'The file does not match its type.' };
  return { ok: true, type, family, size: buf.length };
}

// ClamAV INSTREAM protocol. CLAMAV_HOST (and CLAMAV_PORT, default 3310) switch scanning on.
// MALWARE_SCAN_REQUIRED=1 refuses files when the scanner is unreachable instead of storing them as "not scanned".
export function scannerConfig(env = process.env) {
  const host = String(env.CLAMAV_HOST || '').trim();
  return { enabled: Boolean(host), host, port: Number(env.CLAMAV_PORT || 3310), required: /^(1|true|yes|on)$/i.test(String(env.MALWARE_SCAN_REQUIRED || '')), timeoutMs: Number(env.CLAMAV_TIMEOUT_MS || 15000) };
}

export function scanBuffer(buf, cfg) {
  return new Promise((resolve) => {
    if (!cfg?.enabled) return resolve({ status: 'not_scanned', detail: 'No malware scanner configured.' });
    let done = false, reply = '';
    const finish = (r) => { if (done) return; done = true; socket.destroy(); resolve(r); };
    const socket = net.createConnection({ host: cfg.host, port: cfg.port });
    socket.setTimeout(cfg.timeoutMs, () => finish({ status: 'unavailable', detail: 'Scanner timed out.' }));
    socket.on('error', () => finish({ status: 'unavailable', detail: 'Scanner unreachable.' }));
    socket.on('data', (d) => { reply += d.toString('utf8'); });
    socket.on('end', () => {
      const line = reply.replace(/\0/g, '').trim();
      if (/:\s*OK$/.test(line)) return finish({ status: 'clean', detail: 'No threats found.' });
      const m = /:\s*(.+)\s+FOUND$/.exec(line);
      if (m) return finish({ status: 'infected', detail: m[1] });
      finish({ status: 'unavailable', detail: 'Unexpected scanner reply.' });
    });
    socket.on('connect', () => {
      socket.write('zINSTREAM\0');
      for (let i = 0; i < buf.length; i += 65536) {
        const chunk = buf.subarray(i, i + 65536), size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length); socket.write(size); socket.write(chunk);
      }
      socket.write(Buffer.alloc(4)); // zero-length chunk ends the stream
    });
  });
}

// One call for upload handlers: validate, then scan. Returns { ok, scan } or { ok:false, reason, message }.
export async function inspectUpload(buf, { declaredType, maxBytes, env = process.env, allowed } = {}) {
  const v = validateFile(buf, { declaredType, maxBytes, allowed });
  if (!v.ok) return v;
  const cfg = scannerConfig(env);
  const scan = await scanBuffer(buf, cfg);
  if (scan.status === 'infected') return { ok: false, reason: 'malware', message: 'This file was blocked by the malware scanner.', scan };
  if (scan.status === 'unavailable' && cfg.required) return { ok: false, reason: 'scanner_unavailable', message: 'Files cannot be checked right now. Please try again shortly.', scan };
  return { ...v, scan };
}
