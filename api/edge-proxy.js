// Behind Netlify (this fork's deployment): the site proxies /app/api/* here and signs every
// request it forwards with a JWS in X-Nf-Sign, made with a secret only Netlify and this server
// hold (EDGE_PROXY_SECRET). With the secret set, a request without a valid signature is someone
// calling the fly.dev address directly, and is refused. That is also what makes Netlify's
// X-Nf-Client-Connection-Ip header worth believing: only the proxy can have set it.
import crypto from 'node:crypto';

const b64json = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

// HS256 only, issuer "netlify", not expired when it carries an expiry.
export function verifyEdgeSignature(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  let header, payload;
  try { header = b64json(parts[0]); payload = b64json(parts[1]); } catch { return false; }
  if (!header || header.alg !== 'HS256') return false;
  const want = crypto.createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest();
  let got;
  try { got = Buffer.from(parts[2], 'base64url'); } catch { return false; }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return false;
  if (!payload || payload.iss !== 'netlify') return false;
  if (typeof payload.exp === 'number' && payload.exp * 1000 < now) return false;
  return true;
}

// The visitor's address as Netlify saw it. Only read once the signature has been checked.
export function edgeClientIp(req) {
  const ip = String(req.headers['x-nf-client-connection-ip'] || '').trim();
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : '';
}
