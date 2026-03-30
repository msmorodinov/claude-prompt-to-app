module.exports = {
  apps: [{
    name: "forge-simple",
    script: ".venv/bin/python",
    args: "-m backend.server",
    cwd: __dirname,
    interpreter: "none",
    env: { PYTHONUNBUFFERED: "1" },
    autorestart: true,
    max_restarts: 10,
    restart_delay: 3000,
    out_file: "deploy/logs/app-out.log",
    error_file: "deploy/logs/app-err.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    merge_logs: true,
  }],
};
