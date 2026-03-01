const bcrypt = require('bcryptjs');

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function cleanAttempts() {
  const now = Date.now();
  for (const [key, value] of attempts.entries()) {
    if (now - value.firstAt > WINDOW_MS) {
      attempts.delete(key);
    }
  }
}

function checkRateLimit(ip) {
  cleanAttempts();
  const now = Date.now();
  const value = attempts.get(ip);

  if (!value) {
    attempts.set(ip, { count: 1, firstAt: now });
    return { allowed: true };
  }

  if (now - value.firstAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAt: now });
    return { allowed: true };
  }

  value.count += 1;
  attempts.set(ip, value);

  if (value.count > MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((WINDOW_MS - (now - value.firstAt)) / 1000) };
  }

  return { allowed: true };
}

function clearRateLimit(ip) {
  attempts.delete(ip);
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  checkRateLimit,
  clearRateLimit,
  slugify,
  hashPassword,
  comparePassword
};
