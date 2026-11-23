const { randomUUID } = require('node:crypto');
const { getStore } = require('@netlify/blobs');
const {
    IMAGE_TYPES,
    MAX_IMAGE_BYTES,
    isValidImageKey,
    supportedImage
} = require('../../functions/image-validation');
const { getAdminSession, getRuntime, sameOrigin, sendJson } = require('../shared/runtime');

const STORE_NAME = 'techagenda-environment-images';

function uploadBytes(event) {
    if (event.isBase64Encoded) return Buffer.from(event.body || '', 'base64');
    return Buffer.from(event.body || '', 'utf8');
}

function createHandler({
    getRuntime: runtimeProvider = getRuntime,
    getAdminSession: adminSessionProvider = getAdminSession,
    getBlobStore = getStore,
    createId = randomUUID
} = {}) {
    return async (event) => {
        if (event.httpMethod === 'GET') {
            const key = event.queryStringParameters?.key;
            if (!isValidImageKey(key)) {
                return sendJson(400, { error: 'Referência de imagem inválida.' });
            }
            try {
                const image = await getBlobStore(STORE_NAME).get(`environment-images/${key}`, {
                    type: 'arrayBuffer'
                });
                if (!image) return sendJson(404, { error: 'Imagem não encontrada.' });
                const extension = key.split('.').pop().toLowerCase();
                return {
                    statusCode: 200,
                    headers: {
                        'Cache-Control': 'public, max-age=31536000, immutable',
                        'Content-Type': IMAGE_TYPES[extension],
                        'X-Content-Type-Options': 'nosniff'
                    },
                    body: Buffer.from(image).toString('base64'),
                    isBase64Encoded: true
                };
            } catch (error) {
                console.error('Falha ao carregar imagem de ambiente:', error);
                return sendJson(500, { error: 'Não foi possível carregar esta imagem.' });
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
            const arrayBuffer = bytes.buffer.slice(
                bytes.byteOffset,
                bytes.byteOffset + bytes.byteLength
            );
            await getBlobStore(STORE_NAME).set(`environment-images/${key}`, arrayBuffer, {
                metadata: { contentType }
            });
            return sendJson(201, {
                image: `/.netlify/functions/environment-images?key=${key}`
            });
        } catch (error) {
            console.error('Falha ao enviar imagem de ambiente:', error);
            return sendJson(500, { error: 'Não foi possível enviar a imagem. Tente novamente.' });
        }
    };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
exports.isValidImageKey = isValidImageKey;
exports.supportedImage = supportedImage;
