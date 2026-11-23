const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createEnvironmentImagesHandler } = require('../api/environment-images');

const imageKey = '123e4567-e89b-12d3-a456-426614174000.png';
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

function event(overrides = {}) {
    return {
        httpMethod: 'POST',
        headers: {
            origin: 'https://agenda.vercel.app',
            host: 'agenda.vercel.app',
            'content-type': 'image/png',
            cookie: 'techagenda_admin=session'
        },
        body: png.toString('base64'),
        isBase64Encoded: true,
        ...overrides
    };
}

test('exige sessão administrativa e grava uploads validados no Vercel Blob público', async () => {
    let uploaded;
    const handler = createEnvironmentImagesHandler({
        runtimeProvider: () => ({ db: {} }),
        adminSessionProvider: async () => ({ uid: 'uid-admin' }),
        putBlob: async (pathname, bytes, options) => {
            uploaded = { pathname, bytes, options };
            return { url: 'https://images.public.blob.vercel-storage.com/environment-images/image.png' };
        },
        createId: () => '123e4567-e89b-12d3-a456-426614174000'
    });
    const response = await handler(event());

    assert.equal(response.statusCode, 201);
    assert.deepEqual(JSON.parse(response.body), {
        image: 'https://images.public.blob.vercel-storage.com/environment-images/image.png'
    });
    assert.equal(uploaded.pathname, `environment-images/${imageKey}`);
    assert.deepEqual(uploaded.bytes, png);
    assert.deepEqual(uploaded.options, {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'image/png'
    });
});

test('nega upload sem sessão, fora de origem ou com conteúdo inválido', async () => {
    const handler = createEnvironmentImagesHandler({
        runtimeProvider: () => ({ db: {} }),
        adminSessionProvider: async () => null,
        putBlob: async () => {
            throw new Error('upload must not be called');
        }
    });

    assert.equal((await handler(event())).statusCode, 401);
    assert.equal((await handler(event({
        headers: { ...event().headers, origin: 'https://attacker.example' }
    }))).statusCode, 403);
    const authenticatedHandler = createEnvironmentImagesHandler({
        runtimeProvider: () => ({ db: {} }),
        adminSessionProvider: async () => ({ uid: 'uid-admin' }),
        putBlob: async () => {
            throw new Error('upload must not be called');
        }
    });
    assert.equal((await authenticatedHandler(event({
        body: Buffer.from('<svg></svg>').toString('base64')
    }))).statusCode, 415);
});

test('proxy de imagens legadas restringe origem, valida bytes e não requer sessão pública', async () => {
    let requestedUrl;
    const handler = createEnvironmentImagesHandler({
        getNetlifySiteUrl: () => 'https://techagenda.netlify.app',
        fetchImage: async (url, options) => {
            requestedUrl = { url, options };
            return {
                status: 200,
                ok: true,
                arrayBuffer: async () => png
            };
        }
    });

    const response = await handler({
        httpMethod: 'GET',
        queryStringParameters: { key: imageKey }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Content-Type'], 'image/png');
    assert.deepEqual(Buffer.from(response.body, 'base64'), png);
    assert.equal(requestedUrl.url.origin, 'https://techagenda.netlify.app');
    assert.equal(requestedUrl.url.pathname, '/.netlify/functions/environment-images');
    assert.equal(requestedUrl.url.searchParams.get('key'), imageKey);
    assert.equal(requestedUrl.options.redirect, 'error');

    const invalidOrigin = await createEnvironmentImagesHandler({
        getNetlifySiteUrl: () => 'http://127.0.0.1:8080'
    })({
        httpMethod: 'GET',
        queryStringParameters: { key: imageKey }
    });
    assert.equal(invalidOrigin.statusCode, 503);
});
