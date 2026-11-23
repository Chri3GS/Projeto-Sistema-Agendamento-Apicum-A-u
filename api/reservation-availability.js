const { handler } = require('../netlify/functions/reservation-availability');
const { createVercelFunction } = require('../vercel/adapter');

module.exports = createVercelFunction(handler);
