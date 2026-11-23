const { handler } = require('../netlify/functions/admin-session');
const { createVercelFunction } = require('../vercel/adapter');

module.exports = createVercelFunction(handler);
