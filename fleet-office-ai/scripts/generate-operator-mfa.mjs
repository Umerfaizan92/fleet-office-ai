// Prints a new authenticator secret for the platform operator console. Add it to your environment as OPERATOR_TOTP_SECRET,
// then scan the address below in an authenticator app (or type the secret in by hand). Run: npm run generate:operator-mfa
import crypto from 'node:crypto';
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let bits = 0, value = 0, secret = '';
for (const byte of crypto.randomBytes(20)) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { secret += A[(value >>> (bits - 5)) & 31]; bits -= 5; } }
console.log(`OPERATOR_TOTP_SECRET=${secret}\n\nAuthenticator link (paste into a QR code maker, or type the secret manually):\notpauth://totp/${encodeURIComponent('Super Pro operator')}?secret=${secret}&issuer=${encodeURIComponent('Super Pro AI Office Manager')}\n\nOnce this is set on Render, the operator console needs the admin key plus a 6-digit code, and the admin key alone stops working for the API.`);
