const { handler } = require('../netlify/functions/admin-api');
const { createVercelFunction } = require('../vercel/adapter');

module.exports = createVercelFunction(handler);
