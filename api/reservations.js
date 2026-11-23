const { handler } = require('../netlify/functions/reservations');
const { createVercelFunction } = require('../vercel/adapter');

module.exports = createVercelFunction(handler);
