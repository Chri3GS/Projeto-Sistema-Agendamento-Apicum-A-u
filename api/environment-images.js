const { randomUUID } = require('node:crypto');
const { put } = require('@vercel/blob');
const {
    IMAGE_TYPES,
    MAX_IMAGE_BYTES,
    isValidImageKey,
    supportedImage
} = require('../functions/image-validation');
const { getAdminSession, getRuntime, sameOrigin, sendJson } = require('../netlify/shared/runtime');

function uploadBytes(event) {
    if (event.isBase64Encoded) return Buffer.from(event.body || '', 'base64');
    return Buffer.from(event.body || '', 'utf8');
}

function netlifyOrigin(configuredUrl) {
    if (!configuredUrl) return null;
    try {
        const url = new URL(configuredUrl);
        if (url.protocol !== 'https:' || url.username || url.password ||
            url.pathname !== '/' || url.search || url.hash) return null;
        return url.origin;
    } catch {
        return null;
    }
}

function createEnvironmentImagesHandler({
    runtimeProvider = getRuntime,
    adminSessionProvider = getAdminSession,
    putBlob = put,
    fetchImage = fetch,
    getNetlifySiteUrl = () => process.env.NETLIFY_SITE_URL,
    createId = randomUUID
} = {}) {
    return async (event) => {
        if (event.httpMethod === 'GET') {
            const key = event.queryStringParameters?.key;
            if (!isValidImageKey(key)) {
                return sendJson(400, { error: 'Referência de imagem inválida.' });
            }
            const origin = netlifyOrigin(getNetlifySiteUrl());
            if (!origin) {
                return sendJson(503, { error: 'A origem das imagens legadas não está configurada.' });
            }
            try {
                const url = new URL('/.netlify/functions/environment-images', origin);
                url.searchParams.set('key', key);
                const response = await fetchImage(url, {
                    cache: 'no-store',
                    redirect: 'error'
                });
                if (response.status === 404) {
                    return sendJson(404, { error: 'Imagem não encontrada.' });
                }
                if (!response.ok) {
                    return sendJson(502, { error: 'Não foi possível carregar esta imagem.' });
                }
                const bytes = Buffer.from(await response.arrayBuffer());
                const extension = key.split('.').pop().toLowerCase();
                if (bytes.length > MAX_IMAGE_BYTES ||
                    supportedImage(bytes, IMAGE_TYPES[extension]) !== extension) {
                    return sendJson(502, { error: 'A imagem legada não passou pela validação.' });
                }
                return {
                    statusCode: 200,
                    headers: {
                        'Cache-Control': 'public, max-age=31536000, immutable',
                        'Content-Type': IMAGE_TYPES[extension],
                        'X-Content-Type-Options': 'nosniff'
                    },
                    body: bytes.toString('base64'),
                    isBase64Encoded: true
                };
            } catch (error) {
                console.error('Falha ao carregar imagem legada:', error);
                return sendJson(502, { error: 'Não foi possível carregar esta imagem.' });
            }
        }

        if (event.httpMethod !== 'POST') {
            return sendJson(405, { error: 'Método não permitido.' }, { Allow: 'GET, POST' });
        }
        if (!sameOrigin(event)) return sendJson(403, { error: 'Origem da requisição inválida.' });

        try {
            const { db } = runtimeProvider();
            const session = await adminSessionProvider(event, db);
            if (!session) return sendJson(401, { error: 'Sessão administrativa inválida ou expirada.' });

            const contentType = event.headers?.['content-type'] || '';
            if (!Object.values(IMAGE_TYPES).includes(contentType)) {
                return sendJson(415, { error: 'Envie uma imagem JPG, PNG ou WebP.' });
            }
            const bytes = uploadBytes(event);
            if (!bytes.length) return sendJson(400, { error: 'O arquivo enviado está vazio.' });
            if (bytes.length > MAX_IMAGE_BYTES) {
                return sendJson(413, { error: 'A imagem deve ter no máximo 4 MB.' });
            }
            const extension = supportedImage(bytes, contentType);
            if (!extension) {
                return sendJson(415, { error: 'O conteúdo do arquivo não corresponde a uma imagem JPG, PNG ou WebP válida.' });
            }

            const key = `${createId()}.${extension}`;
            const blob = await putBlob(`environment-images/${key}`, bytes, {
                access: 'public',
                addRandomSuffix: false,
                contentType
            });
            return sendJson(201, { image: blob.url });
        } catch (error) {
            console.error('Falha ao enviar imagem de ambiente na Vercel:', error);
            return sendJson(500, { error: 'Não foi possível enviar a imagem. Tente novamente.' });
        }
    };
}

module.exports = createEnvironmentImagesHandler();
module.exports.createEnvironmentImagesHandler = createEnvironmentImagesHandler;
