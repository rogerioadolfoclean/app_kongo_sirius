// Simple environment safety checks for production
require('dotenv').config();

const issues = [];

// DB password: require in production. Local dev can have an empty password.
const dbPwd = process.env.DB_PASSWORD;
if (process.env.NODE_ENV === 'production') {
  if (!dbPwd || dbPwd.length === 0) {
    issues.push('DB_PASSWORD is not set. A DB password is required in production.');
  }
}

// SESSION_SECRET: require a sufficiently long secret in production.
const sess = process.env.SESSION_SECRET;
if (!sess || sess.length < 16) {
  issues.push('SESSION_SECRET is not set or is too short (min 16 characters). Use a strong random secret in production.');
}

if (issues.length > 0) {
  if (process.env.NODE_ENV === 'production') {
    console.error('Environment safety checks failed:');
    issues.forEach(i => console.error(' -', i));
    console.error('Aborting start in production. Set secure environment variables.');
    process.exit(1);
  } else {
    console.warn('Environment safety warnings:');
    issues.forEach(i => console.warn(' -', i));
    console.warn('These warnings should be addressed before deploying to production.');
  }
}

module.exports = { issues };
