module.exports = {
  apps: [
    {
      name: 'app-kongo-sirius',
      script: './app.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'app-kongo-worker',
      script: './scripts/process_queue.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
