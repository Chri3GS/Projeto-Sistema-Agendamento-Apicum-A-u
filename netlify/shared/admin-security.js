const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function readPasswordHash(value) {
    const match = /^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/i.exec(value || '');
    if (!match) throw new Error('ADMIN_PASSWORD_HASH ausente ou inválido.');
    return { salt: Buffer.from(match[1], 'hex'), hash: Buffer.from(match[2], 'hex') };
}

async function verifyPassword(password, encodedHash) {
    const { salt, hash } = readPasswordHash(encodedHash);
    if (typeof password !== 'string' || Buffer.byteLength(password) > 1024) return false;
    const candidate = await scrypt(password, salt, hash.length);
    return crypto.timingSafeEqual(candidate, hash);
}

function requireSessionSecret(value) {
    if (typeof value !== 'string' || Buffer.byteLength(value) < 32) {
        throw new Error('ADMIN_SESSION_SECRET deve ter pelo menos 32 bytes.');
    }
    return value;
}

function signature(sessionId, expiresAt, secret) {
    return crypto.createHmac('sha256', requireSessionSecret(secret))
        .update(`${sessionId}.${expiresAt}`)
        .digest('hex');
}

function createSessionToken(sessionId, expiresAt, secret) {
    if (!/^[a-f0-9]{64}$/i.test(sessionId) || !Number.isSafeInteger(expiresAt)) {
        throw new Error('Dados da sessão inválidos.');
    }
    return `${sessionId}.${expiresAt}.${signature(sessionId, expiresAt, secret)}`;
}

function verifySessionToken(token, secret, now = Date.now()) {
    const match = /^([a-f0-9]{64})\.(\d{13})\.([a-f0-9]{64})$/i.exec(token || '');
    if (!match) return null;
    const [, sessionId, expiration, suppliedSignature] = match;
    const expiresAt = Number(expiration);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null;
    const expected = Buffer.from(signature(sessionId, expiresAt, secret), 'hex');
    const supplied = Buffer.from(suppliedSignature, 'hex');
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return null;
    return { sessionId, expiresAt };
}

function sessionCookie(token, maxAge = SESSION_TTL_MS) {
    return `techagenda_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${Math.floor(maxAge / 1000)}`;
}

module.exports = {
    createSessionToken,
    readPasswordHash,
    sessionCookie,
    SESSION_TTL_MS,
    verifyPassword,
    verifySessionToken
};
