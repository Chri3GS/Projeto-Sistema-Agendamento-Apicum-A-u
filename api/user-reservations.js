const { handler } = require('../netlify/functions/user-reservations');
const { createVercelFunction } = require('../vercel/adapter');

module.exports = createVercelFunction(handler);
