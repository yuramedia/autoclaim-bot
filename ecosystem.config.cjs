module.exports = {
    apps: [
        {
            name: 'autoclaim-bot',
            script: 'src/index.ts',
            interpreter: 'bun',
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            env: {
                NODE_ENV: 'production',
            },
            error_file: './logs/error.log',
            out_file: './logs/out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss',
            merge_logs: true,
        },
    ],
};
