/* Behind Netlify (edge-proxy.js): only a request Netlify signed with the shared secret gets in. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifyEdgeSignature, edgeClientIp } from '../edge-proxy.js';

const SECRET = crypto.randomBytes(24).toString('hex');
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const sign = (payload, { secret = SECRET, alg = 'HS256' } = {}) => {
  const head = b64({ alg, typ: 'JWT' }) + '.' + b64(payload);
  return head + '.' + crypto.createHmac('sha256', secret).update(head).digest('base64url');
};

test('a token Netlify signed with the secret passes', () => {
  assert.equal(verifyEdgeSignature(sign({ iss: 'netlify', site_url: 'https://x.netlify.app' }), SECRET), true);
});

test('anything else is refused', () => {
  assert.equal(verifyEdgeSignature(undefined, SECRET), false);
  assert.equal(verifyEdgeSignature('a.b', SECRET), false);
  assert.equal(verifyEdgeSignature(sign({ iss: 'netlify' }, { secret: 'other' }), SECRET), false);
  assert.equal(verifyEdgeSignature(sign({ iss: 'someone' }), SECRET), false);
  assert.equal(verifyEdgeSignature(sign({ iss: 'netlify' }, { alg: 'none' }), SECRET), false);
  assert.equal(verifyEdgeSignature(sign({ iss: 'netlify', exp: 1 }), SECRET), false);
  assert.equal(verifyEdgeSignature(sign({ iss: 'netlify' }), ''), false);
});

test('the client address header is taken only when it looks like an address', () => {
  assert.equal(edgeClientIp({ headers: { 'x-nf-client-connection-ip': '203.0.113.7' } }), '203.0.113.7');
  assert.equal(edgeClientIp({ headers: { 'x-nf-client-connection-ip': '<script>' } }), '');
  assert.equal(edgeClientIp({ headers: {} }), '');
});
