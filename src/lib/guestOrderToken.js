const jwt = require('jsonwebtoken');
const config = require('../config');

const PURPOSE = 'guest-order-access';

function createGuestOrderToken(orderId, guestEmail) {
  if (!orderId || !guestEmail) {
    throw new Error('orderId and guestEmail are required');
  }
  return jwt.sign(
    {
      purpose: PURPOSE,
      orderId: Number(orderId),
      guestEmail: String(guestEmail).trim().toLowerCase(),
    },
    config.jwt.secret,
    { expiresIn: config.jwt.guestOrderTokenExpiresIn || '7d' }
  );
}

function verifyGuestOrderToken(token) {
  const payload = jwt.verify(token, config.jwt.secret);
  if (!payload || payload.purpose !== PURPOSE) {
    throw new Error('Invalid guest order token');
  }
  if (!Number.isInteger(Number(payload.orderId))) {
    throw new Error('Invalid guest order token');
  }
  if (!payload.guestEmail || typeof payload.guestEmail !== 'string') {
    throw new Error('Invalid guest order token');
  }
  return {
    orderId: Number(payload.orderId),
    guestEmail: String(payload.guestEmail).trim().toLowerCase(),
  };
}

module.exports = {
  createGuestOrderToken,
  verifyGuestOrderToken,
};
