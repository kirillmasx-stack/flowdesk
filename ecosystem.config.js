// ecosystem.config.js — PM2 process manager config
module.exports = {
  apps: [{
    name:        'flowdesk',
    script:      'server/index.js',
    cwd:         '/var/www/flowdesk',
    instances:   1,
    autorestart: true,
    watch:       false,
    env: {
      NODE_ENV: 'production',
      PORT:     3001,
    },
    error_file:  '/var/log/flowdesk/err.log',
    out_file:    '/var/log/flowdesk/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
