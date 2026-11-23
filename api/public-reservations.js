const { handler } = require('../netlify/functions/public-reservations');
const { createVercelFunction } = require('../vercel/adapter');

module.exports = createVercelFunction(handler);
