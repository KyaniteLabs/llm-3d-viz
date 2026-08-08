import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { models, validateModels } from "./src/data/models";

/** Enforces the curated-data contract before Vite emits any production assets. */
function validateDataset(): Plugin {
  return {
    name: "validate-model-dataset",
    buildStart() {
      validateModels(models);
    },
  };
}

/**
 * Buffer request body (Atlas chat payloads are small JSON, not streams of GBs).
 */
function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Same-origin reverse proxy → NUCBox Unsloth OpenAI API (:8890) via curl.
 *
 * Why curl (not Node http / http-proxy):
 * Unsloth Studio's BaseHTTP often emits Duplicate Content-Length. Node's
 * HTTP parser rejects that even with insecureHTTPParser. curl is lenient.
 * Also avoids browser CORS (Studio OPTIONS → 501) and keeps the agent key
 * server-side only.
 */
function atlasUnslothProxyPlugin(env: Record<string, string>): Plugin {
  const target =
    env.ATLAS_UNSLOTH_TARGET?.trim() || "http://YOUR_NUCBOX_TAILSCALE_IP:8890";
  const apiKey = env.ATLAS_UNSLOTH_API_KEY?.trim() || "";
  const prefix = "/api/atlas/llm";

  const mount = (
    middlewares: {
      use: (
        fn: (
          req: IncomingMessage,
          res: ServerResponse,
          next: (err?: unknown) => void,
        ) => void,
      ) => void;
    },
    label: string,
  ) => {
    middlewares.use((req, res, next) => {
      const url = req.url || "";
      if (!url.startsWith(prefix)) {
        next();
        return;
      }

      void (async () => {
        const upstreamPath = url.slice(prefix.length) || "/";
        const upstreamUrl = `${target.replace(/\/+$/, "")}${upstreamPath}`;
        const method = (req.method || "GET").toUpperCase();
        let body: Buffer = Buffer.alloc(0);
        if (method !== "GET" && method !== "HEAD") {
          body = await readBody(req);
        }

        const id = randomUUID();
        const bodyPath = join(tmpdir(), `atlas-llm-body-${id}`);
        const hdrPath = join(tmpdir(), `atlas-llm-hdr-${id}`);
        const outPath = join(tmpdir(), `atlas-llm-out-${id}`);

        try {
          if (body.length) writeFileSync(bodyPath, body);

          // No --fail: forward upstream 4xx/5xx bodies to the browser.
          const curlArgs = [
            "-sS",
            "-m",
            "300",
            "-D",
            hdrPath,
            "-o",
            outPath,
            "-w",
            "%{http_code}",
            "-X",
            method,
            "-H",
            "Content-Type: application/json",
            "-H",
            `Authorization: Bearer ${apiKey || "missing"}`,
          ];
          if (body.length) {
            curlArgs.push("--data-binary", `@${bodyPath}`);
          }
          curlArgs.push(upstreamUrl);

          const codeText = await new Promise<string>((resolve, reject) => {
            const child = spawn("curl", curlArgs, { stdio: ["ignore", "pipe", "pipe"] });
            let stdout = "";
            let stderr = "";
            child.stdout.on("data", (d) => {
              stdout += String(d);
            });
            child.stderr.on("data", (d) => {
              stderr += String(d);
            });
            child.on("error", reject);
            child.on("close", (code) => {
              if (code !== 0 && !stdout.trim()) {
                reject(new Error(stderr.trim() || `curl exit ${code}`));
                return;
              }
              resolve(stdout.trim());
            });
          });

          const status = Number(codeText) || 502;
          let rawHeaders = "";
          try {
            rawHeaders = readFileSync(hdrPath, "utf8");
          } catch {
            rawHeaders = "";
          }
          // Drop the HTTP status line; forward a cleaned subset of headers.
          const headerLines = rawHeaders.split(/\r?\n/).slice(1);
          const outHeaders: Record<string, string> = {
            "content-type": "application/json",
          };
          for (const line of headerLines) {
            if (!line || line.startsWith("HTTP/")) continue;
            const i = line.indexOf(":");
            if (i < 0) continue;
            const name = line.slice(0, i).trim().toLowerCase();
            const value = line.slice(i + 1).trim();
            if (
              name === "content-type" ||
              name === "cache-control" ||
              name === "x-request-id"
            ) {
              outHeaders[name] = value;
            }
          }

          let outBody = Buffer.alloc(0);
          try {
            outBody = readFileSync(outPath);
          } catch {
            outBody = Buffer.from(
              JSON.stringify({ error: "empty_upstream_body", status }),
            );
          }

          res.writeHead(status, outHeaders);
          res.end(outBody);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[atlas-llm] ${label} proxy error:`, message);
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                error: "atlas_unsloth_proxy_error",
                message,
                hint: "Is NUCBox Unsloth :8890 up? ssh nucbox '~/unsloth-ops/bin/ornith-workhorse-verify.sh'",
              }),
            );
          }
        } finally {
          for (const p of [bodyPath, hdrPath, outPath]) {
            try {
              unlinkSync(p);
            } catch {
              /* ignore */
            }
          }
        }
      })().catch((err) => {
        console.error(`[atlas-llm] ${label} unhandled:`, err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "atlas_proxy_internal" }));
        }
      });
    });
  };

  return {
    name: "atlas-unsloth-proxy",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const status = apiKey
          ? `key loaded (len ${apiKey.length})`
          : "NO KEY — run: node scripts/wire-atlas-nucbox.mjs";
        console.info(`[atlas-llm] proxy ${prefix} → ${target} (${status}, curl)`);
      });
      mount(server.middlewares, "dev");
    },
    configurePreviewServer(server) {
      server.httpServer?.once("listening", () => {
        console.info(`[atlas-llm] preview proxy ${prefix} → ${target} (curl)`);
      });
      mount(server.middlewares, "preview");
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load all env keys (not only VITE_*) so ATLAS_UNSLOTH_* stays server-side.
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [validateDataset(), atlasUnslothProxyPlugin(env)],
    // Kokoro / transformers.js: keep ONNX WASM + dynamic import out of the main bundle.
    optimizeDeps: {
      exclude: ["kokoro-js", "@huggingface/transformers"],
    },
    build: {
      target: "esnext",
      chunkSizeWarningLimit: 2000,
    },
    worker: {
      format: "es",
    },
    test: {
      exclude: [
        "node_modules",
        "dist",
        ".idea",
        ".git",
        ".cache",
        "tests/*.spec.ts",
      ],
    },
  } as any;
});
