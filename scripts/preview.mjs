#!/usr/bin/env node
/**
 * Safari-safe local preview.
 *
 * Vite preview hangs WebKit/Safari on some macOS setups (port-dependent).
 * Port 4190 is additionally unusable for Safari on this machine; Chrome still works.
 * This serves dist/ with Python's http.server on 4200 (WebKit + Safari verified).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const PORT = Number(process.env.PORT || 4200);
const HOST = process.env.HOST || "127.0.0.1";

if (!existsSync(path.join(dist, "index.html"))) {
  console.error("dist/ missing — run: npm run build");
  process.exit(1);
}

function canListen(port) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, HOST);
  });
}

const free = await canListen(PORT);
if (!free) {
  console.error(`Port ${PORT} is busy. Free it or set PORT=....`);
  process.exit(1);
}

const child = spawn(
  process.execPath.includes("node") ? "python3" : "python3",
  ["-m", "http.server", String(PORT), "--bind", HOST],
  { cwd: dist, stdio: "inherit" },
);

const url = `http://${HOST}:${PORT}/`;
console.log(`\n  llm-3d-viz (Safari-safe preview)\n  ${url}\n  Ctrl+C to stop\n`);

// Best-effort open browsers (Chrome + Safari)
for (const app of ["Google Chrome", "Safari"]) {
  spawn("open", ["-a", app, url], { stdio: "ignore", detached: true }).unref();
}

const stop = () => {
  child.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
