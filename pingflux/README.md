# Pingflux

Pingflux exposes a lightweight UI to run traceroute diagnostics from the browser. The backend executes the operating system traceroute (with Windows-friendly defaults) and persists every execution in a local SQLite database.

## Scripts

```bash
npm install
npm start
```

The server listens on `127.0.0.1` and serves the UI at `http://127.0.0.1:3000` by default.

Environment variables can be configured via `.env` (see `.env.example`).
