const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');
const {
    createSessionToken,
    sessionCookie,
    verifySessionToken
} = require('../shared/admin-security');

test('signs expiring sessions and rejects tampering or expired tokens', () => {
    const secret = crypto.randomBytes(32).toString('hex');
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 60_000;
    const token = createSessionToken(sessionId, expiresAt, secret);
    const tamperedToken = `${token.slice(0, -1)}${token.endsWith('0') ? '1' : '0'}`;

    assert.deepEqual(verifySessionToken(token, secret), { sessionId, expiresAt });
    assert.equal(verifySessionToken(tamperedToken, secret), null);
    assert.equal(verifySessionToken(token, secret, expiresAt), null);
    assert.match(sessionCookie(token), /HttpOnly; Secure; SameSite=Strict; Path=\//);
});
