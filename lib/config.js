require('dotenv').config();

const isProduction = (process.env.NODE_ENV === 'production');

// Keep configuration minimal and read secrets from environment variables.
// Do NOT embed production secrets in the source. For local development you
// may leave DB_PASSWORD empty and use a local DB user with no password.
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'congo_knowledge_db',
  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000', 10)
};

// Session secret must come from env. Keep empty default to avoid committing
// any secret in source control. `lib/env_safety.js` will enforce a strong
// value in production.
const sessionSecret = process.env.SESSION_SECRET || '';

module.exports = {
  isProduction,
  dbConfig,
  sessionSecret
};
