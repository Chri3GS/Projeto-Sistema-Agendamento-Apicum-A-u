const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');
const {
    createSessionToken,
    sessionCookie,
    verifyPassword,
    verifySessionToken
} = require('../shared/admin-security');

test('verifies the existing scrypt password hash format without exposing a password', async () => {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync('secret-password', salt, 64);
    const encoded = `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;

    assert.equal(await verifyPassword('secret-password', encoded), true);
    assert.equal(await verifyPassword('wrong-password', encoded), false);
});

test('signs expiring sessions and rejects tampering or expired tokens', () => {
    const secret = crypto.randomBytes(32).toString('hex');
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 60_000;
    const token = createSessionToken(sessionId, expiresAt, secret);

    assert.deepEqual(verifySessionToken(token, secret), { sessionId, expiresAt });
    assert.equal(verifySessionToken(`${token.slice(0, -1)}0`, secret), null);
    assert.equal(verifySessionToken(token, secret, expiresAt), null);
    assert.match(sessionCookie(token), /HttpOnly; Secure; SameSite=Strict; Path=\//);
});
