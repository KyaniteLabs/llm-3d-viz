#!/usr/bin/env node
/**
 * Wire Atlas LLM → NUCBox Unsloth (Ornith) for local Vite.
 *
 * 1. Pulls agent API key via `ssh nucbox` (never prints the secret).
 * 2. Writes ATLAS_UNSLOTH_* into .env.local (gitignored).
 * 3. Prints how to enable the Atlas UI preset.
 *
 * Usage: node scripts/wire-atlas-nucbox.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT, ".env.local");
const TARGET = process.env.ATLAS_UNSLOTH_TARGET || "http://YOUR_NUCBOX_TAILSCALE_IP:8890";
const MODEL =
  process.env.ATLAS_UNSLOTH_MODEL || "SC117/Ornith-1.0-35B-MTP-APEX-GGUF";

function die(msg, code = 1) {
  console.error(`[wire-atlas-nucbox] ${msg}`);
  process.exit(code);
}

function pullKey() {
  if (process.env.ATLAS_UNSLOTH_API_KEY?.trim()) {
    return process.env.ATLAS_UNSLOTH_API_KEY.trim();
  }
  const r = spawnSync(
    "ssh",
    [
      "-o",
      "ConnectTimeout=8",
      "-o",
      "BatchMode=yes",
      "nucbox",
      "cat ~/.unsloth/studio/auth/agent_api_key",
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    die(
      `ssh nucbox failed (status ${r.status}): ${(r.stderr || r.stdout || "").trim() || "no output"}\n` +
        `Set ATLAS_UNSLOTH_API_KEY in the environment instead.`,
    );
  }
  const key = (r.stdout || "").trim();
  if (key.length < 8) die("agent_api_key empty or too short on nucbox");
  return key;
}

function upsertEnv(path, pairs) {
  let text = existsSync(path) ? readFileSync(path, "utf8") : "";
  // Drop previous managed block
  text = text.replace(
    /\n?# --- atlas-nucbox-unsloth \(managed\) ---[\s\S]*?# --- end atlas-nucbox-unsloth ---\n?/g,
    "\n",
  );
  const block = [
    "# --- atlas-nucbox-unsloth (managed) ---",
    `# Written ${new Date().toISOString()} by scripts/wire-atlas-nucbox.mjs`,
    ...Object.entries(pairs).map(([k, v]) => `${k}=${v}`),
    "# --- end atlas-nucbox-unsloth ---",
    "",
  ].join("\n");
  writeFileSync(path, `${text.trimEnd()}\n\n${block}`, "utf8");
}

function health(key) {
  const r = spawnSync(
    "curl",
    [
      "-sS",
      "-m",
      "12",
      "-H",
      `Authorization: Bearer ${key}`,
      `${TARGET.replace(/\/+$/, "")}/v1/models`,
    ],
    { encoding: "utf8" },
  );
  if (r.status !== 0) {
    console.warn(
      `[wire-atlas-nucbox] health check failed (proxy may still work later): ${(r.stderr || "").trim()}`,
    );
    return;
  }
  try {
    const data = JSON.parse(r.stdout || "{}");
    const loaded = (data.data || [])
      .filter((m) => m.loaded)
      .map((m) => m.id);
    console.log(
      `[wire-atlas-nucbox] loaded on :8890: ${loaded.join(", ") || "(none)"}`,
    );
    if (loaded.length && !loaded.includes(MODEL)) {
      console.warn(
        `[wire-atlas-nucbox] preset model ${MODEL} is not currently loaded; sticky Ornith expected.`,
      );
    }
  } catch {
    console.warn("[wire-atlas-nucbox] /v1/models returned non-JSON");
  }
}

const key = pullKey();
upsertEnv(ENV_PATH, {
  ATLAS_UNSLOTH_TARGET: TARGET,
  ATLAS_UNSLOTH_API_KEY: key,
  ATLAS_UNSLOTH_MODEL: MODEL,
});
console.log(`[wire-atlas-nucbox] wrote ${ENV_PATH} (key len ${key.length}, not printed)`);
console.log(`[wire-atlas-nucbox] target ${TARGET}`);
console.log(`[wire-atlas-nucbox] model  ${MODEL}`);
health(key);
console.log(`
Next:
  1. Restart Vite so the proxy picks up .env.local
  2. Open the app → ATLAS → LLM endpoint → "NUCBox Unsloth"
  3. Ask: floor 50 / cheapest eligible

Atlas base URL (same-origin): /api/atlas/llm/v1
`);
