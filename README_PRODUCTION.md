Production runbook — PM2 & monitoring

Overview
--------
This document lists recommended steps to run the app in production using PM2, monitoring suggestions and basic operational commands.

Environment
-----------
Create a `.env` with at least the following variables:

DB_HOST=127.0.0.1
DB_USER=app_user
DB_PASSWORD=secure_password
DB_NAME=congo_knowledge_db
REDIS_URL=redis://127.0.0.1:6379
SESSION_SECRET=choose_a_long_random_secret
NODE_ENV=production
PORT=3000

PM2 setup
---------
Install pm2 globally on your production server:

  npm install -g pm2

Start using the provided ecosystem file:

  pm2 start ecosystem.config.js

This will start two processes: `app-kongo-sirius` and `app-kongo-worker` (queue worker). To check status:

  pm2 status

To view logs (combined):

  pm2 logs app-kongo-sirius
  pm2 logs app-kongo-worker

To restart after an update:

  pm2 reload ecosystem.config.js

Ensure pm2 restarts on machine reboot:

  pm2 startup
  pm2 save

Monitoring & log rotation
-------------------------
- Use PM2 built-in monitoring (pm2 monit) for quick checks.
- For long-term logs and retention use a log shipper (filebeat) or PM2 plus logrotate.
- Example: enable `pm2-logrotate` module:

  pm2 install pm2-logrotate

Health checks
-------------
- Create an external healthcheck endpoint (e.g., /health) if desired. Use HTTP prober in your load balancer to check `http://localhost:3000`.
- Ensure worker is running — queue length is a vital metric. Use the admin UI `/admin/activation-queue` and track `COUNT(*)` of `activation_queue WHERE status='pending'`.

Backups & DB
-----------
- Regularly backup MySQL (mysqldump or managed snapshots). Keep at least daily backups.
- Create a DB user with limited privileges for the app (not root). Example privileges: SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX.

Security
--------
- Put the app behind a reverse proxy (nginx) with TLS termination (Let's Encrypt).
- Ensure SESSION_SECRET is strong and not checked into source control.
- Enforce least-privilege MySQL user.

Scaling
-------
- For moderate load, run multiple app instances behind a load balancer and share sessions using Redis.
- Keep the worker as a single or multiple instances depending on queue throughput — PM2 can scale worker instances.

Notes
-----
This runbook is a starting point — adapt paths and commands for your environment. If you want, I can add a sample `nginx` config and a `docker-compose.prod.yml` for containerized production.
