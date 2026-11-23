const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createVercelFunction } = require('./adapter');

function responseCapture() {
    return {
        headers: {},
        statusCode: 0,
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        end(body) {
            this.body = body;
        }
    };
}

test('adapta JSON e Set-Cookie da Netlify Function para a resposta Node da Vercel', async () => {
    let event;
    const handler = createVercelFunction(async (request) => {
        event = request;
        return {
            statusCode: 200,
            headers: { 'Set-Cookie': 'techagenda_admin=token; HttpOnly' },
            body: '{"authenticated":true}'
        };
    });
    const response = responseCapture();

    await handler({
        method: 'POST',
        headers: { origin: 'https://agenda.vercel.app', host: 'agenda.vercel.app' },
        query: {},
        body: { idToken: 'firebase-token' }
    }, response);

    assert.equal(event.httpMethod, 'POST');
    assert.equal(event.body, '{"idToken":"firebase-token"}');
    assert.equal(event.isBase64Encoded, false);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Set-Cookie'], 'techagenda_admin=token; HttpOnly');
    assert.equal(response.body, '{"authenticated":true}');
});

test('adapta uploads binários e respostas base64 preservando bytes e query string', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    let event;
    const handler = createVercelFunction(async (request) => {
        event = request;
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'image/png' },
            body: png.toString('base64'),
            isBase64Encoded: true
        };
    });
    const response = responseCapture();

    await handler({
        method: 'POST',
        headers: { 'content-type': 'image/png' },
        query: { key: ['123e4567-e89b-12d3-a456-426614174000.png'] },
        body: png
    }, response);

    assert.equal(event.isBase64Encoded, true);
    assert.deepEqual(Buffer.from(event.body, 'base64'), png);
    assert.equal(event.queryStringParameters.key, '123e4567-e89b-12d3-a456-426614174000.png');
    assert.deepEqual(response.body, png);
});
