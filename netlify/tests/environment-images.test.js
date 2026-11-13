const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validateEnvironment, StoreError } = require('../../functions/admin-store');
const { createHandler, supportedImage } = require('../functions/environment-images');

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const imageKey = '123e4567-e89b-12d3-a456-426614174000.png';

function event(overrides = {}) {
    return {
        httpMethod: 'POST',
        headers: {
            origin: 'https://techagenda.netlify.app',
            host: 'techagenda.netlify.app',
            'content-type': 'image/png',
            cookie: 'techagenda_admin=session'
        },
        body: png.toString('base64'),
        isBase64Encoded: true,
        ...overrides
    };
}

function testDependencies(overrides = {}) {
    const objects = new Map();
    const dependencies = {
        getRuntime: () => ({ db: {} }),
        getAdminSession: async () => ({ username: 'admin' }),
        getBlobStore: () => ({
            async set(key, value, options) {
                objects.set(key, { value, options });
            },
            async get(key) {
                return objects.get(key)?.value || null;
            }
        }),
        createId: () => '123e4567-e89b-12d3-a456-426614174000',
        ...overrides
    };
    return { dependencies, objects };
}

test('exige sessão administrativa e grava arquivo validado no Netlify Blobs', async () => {
    const { dependencies, objects } = testDependencies();
    const handler = createHandler(dependencies);
    const response = await handler(event());

    assert.equal(response.statusCode, 201);
    assert.deepEqual(JSON.parse(response.body), {
        image: `/.netlify/functions/environment-images?key=${imageKey}`
    });
    assert.ok(objects.has(`environment-images/${imageKey}`));
    assert.deepEqual(objects.get(`environment-images/${imageKey}`).options.metadata, {
        contentType: 'image/png'
    });
});

test('confere assinaturas JPEG, PNG e WebP com o content-type declarado', () => {
    assert.equal(supportedImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'), 'jpg');
    assert.equal(supportedImage(png, 'image/png'), 'png');
    assert.equal(supportedImage(Buffer.from('RIFF0000WEBP'), 'image/webp'), 'webp');
    assert.equal(supportedImage(png, 'image/jpeg'), null);
});

test('rejeita upload sem sessão, fora de origem, tipo falsificado e acima do limite', async () => {
    const { dependencies } = testDependencies({
        getAdminSession: async () => null
    });
    const unauthenticated = await createHandler(dependencies)(event());
    assert.equal(unauthenticated.statusCode, 401);

    const { dependencies: validDependencies } = testDependencies();
    const handler = createHandler(validDependencies);
    assert.equal((await handler(event({
        headers: { ...event().headers, origin: 'https://attacker.example' }
    }))).statusCode, 403);
    assert.equal((await handler(event({
        body: Buffer.from('<svg></svg>').toString('base64')
    }))).statusCode, 415);
    assert.equal((await handler(event({
        body: Buffer.alloc(4 * 1024 * 1024 + 1, 0).toString('base64')
    }))).statusCode, 413);
});

test('serve somente chaves válidas como imagem e rejeita referências malformadas', async () => {
    const { dependencies, objects } = testDependencies();
    objects.set(`environment-images/${imageKey}`, { value: png });
    const handler = createHandler(dependencies);
    const response = await handler({
        httpMethod: 'GET',
        queryStringParameters: { key: imageKey }
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Content-Type'], 'image/png');
    assert.equal(response.isBase64Encoded, true);
    assert.deepEqual(Buffer.from(response.body, 'base64'), png);

    const invalid = await handler({
        httpMethod: 'GET',
        queryStringParameters: { key: '../private.png' }
    });
    assert.equal(invalid.statusCode, 400);
});

test('aceita como referência do ambiente somente URL de imagem emitida pelo endpoint', () => {
    const valid = {
        nome: 'Sala de teste',
        descricao: 'Espaço para atividades.',
        capacidade: 12,
        imagem: `/.netlify/functions/environment-images?key=${imageKey}`,
        informacoes: [],
        recursos: [],
        abertura: '08:00',
        fechamento: '18:00',
        diasDisponiveis: [1, 2, 3, 4, 5],
        ativo: true
    };
    assert.equal(validateEnvironment(valid).imagem, valid.imagem);
    assert.throws(() => validateEnvironment({
        ...valid,
        imagem: '/.netlify/functions/environment-images?key=../../other.png'
    }), StoreError);
});
