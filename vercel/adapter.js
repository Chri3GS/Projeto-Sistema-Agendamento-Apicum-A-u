function requestBody(req) {
    const body = req.body;
    if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
        return { body: Buffer.from(body).toString('base64'), isBase64Encoded: true };
    }
    if (body === undefined || body === null) {
        return { body: '', isBase64Encoded: false };
    }
    return {
        body: typeof body === 'string' ? body : JSON.stringify(body),
        isBase64Encoded: false
    };
}

function createVercelFunction(netlifyHandler) {
    return async function vercelFunction(req, res) {
        const queryStringParameters = Object.fromEntries(
            Object.entries(req.query || {}).map(([key, value]) => [
                key,
                Array.isArray(value) ? value[0] : String(value)
            ])
        );
        const event = {
            httpMethod: req.method,
            headers: req.headers,
            queryStringParameters,
            ...requestBody(req)
        };
        const result = await netlifyHandler(event);
        res.statusCode = result.statusCode;
        Object.entries(result.headers || {}).forEach(([name, value]) => {
            res.setHeader(name, value);
        });
        if (result.isBase64Encoded) {
            res.end(Buffer.from(result.body || '', 'base64'));
            return;
        }
        res.end(result.body || '');
    };
}

module.exports = { createVercelFunction };
