const { handler } = require('../netlify/functions/admin-logout');
const { createVercelFunction } = require('../vercel/adapter');

module.exports = createVercelFunction(handler);
