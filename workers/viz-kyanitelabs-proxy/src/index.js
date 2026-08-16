/**
 * viz.kyanitelabs.tech worker:
 * 1) POST /api/atlas/tts → OpenAI neural TTS (male voice) when OPENAI_API_KEY is set
 * 2) Everything else → reverse proxy to llm-3d-viz.pages.dev
 *
 * Critical: do NOT forward the browser Host header to Pages.
 */
const ORIGIN = "llm-3d-viz.pages.dev";

/** Only allow TTS requests from our own origins — blocks cross-site credit-burn. */
const ALLOWED_ORIGINS = new Set([
  "https://viz.kyanitelabs.tech",
  "https://llm-3d-viz.pages.dev",
]);

/**
 * Strict egress allowlist: exact-origin match enforced before EVERY outbound
 * fetch. Covers exactly what this worker legitimately reaches today — the
 * OpenAI TTS upstream and the Pages origin it reverse-proxies — and nothing
 * else. Unlisted destinations are rejected loudly (logged + 403 JSON), never
 * silently passed through.
 */
const EGRESS_ALLOWED_ORIGINS = new Set([
  "https://api.openai.com", // handleAtlasTts upstream
  `https://${ORIGIN}`, // proxyToPages destination
]);

/** Returns a loud 403 Response when url's origin is not egress-allowlisted, else null. */
function egressBlocked(url, route) {
  if (EGRESS_ALLOWED_ORIGINS.has(url.origin)) return null;
  console.error(`[egress] destination not allowed (${route}): ${url.origin}`);
  return new Response(
    JSON.stringify({
      error: "egress_destination_not_allowed",
      route,
      destination: url.origin,
    }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}

/** Male, operator-grade voice. onyx = deep; ash = clear male; cedar = high quality when available. */
const TTS_VOICE = "onyx";
const TTS_MODEL = "gpt-4o-mini-tts";
const TTS_INSTRUCTIONS =
  "Speak as a calm, competent adult male technical operator. Mid-low register, natural conversational pacing, confident but not theatrical. No cartoon, no whisper, no uptalk.";

function corsHeaders(origin) {
  // Only echo the origin if it is in our allowlist; otherwise send no ACAO header
  // so the browser blocks cross-origin script access to the TTS endpoint.
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : null;
  if (!allowed) return {};
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

async function handleAtlasTts(request, env) {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Origin allowlist: reject cross-site requests that would burn OpenAI credits.
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: "origin_not_allowed" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { "content-type": "application/json", ...corsHeaders(origin) },
    });
  }

  // Per-IP rate limit via Cloudflare's cf metadata: max 10 TTS requests / minute.
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const rlKey = `tts:${ip}`;
  const rlWindow = 60;
  const rlMax = 10;
  const now = Math.floor(Date.now() / 1000);
  const stored = await env.TTS_RATE_LIMIT?.get(rlKey);
  const bucket = JSON.parse(stored || '{"count":0,"reset":0}');
  if (now >= bucket.reset) {
    bucket.count = 0;
    bucket.reset = now + rlWindow;
  }
  bucket.count++;
  await env.TTS_RATE_LIMIT?.put(rlKey, JSON.stringify(bucket), { expirationTtl: rlWindow });
  if (bucket.count > rlMax) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": String(bucket.reset - now), ...corsHeaders(origin) },
    });
  }
  const key = env.OPENAI_API_KEY;
  if (!key || typeof key !== "string" || key.length < 10) {
    return new Response(
      JSON.stringify({
        error: "premium_tts_unconfigured",
        message: "Set OPENAI_API_KEY on viz-kyanitelabs-proxy for neural male TTS.",
      }),
      {
        status: 503,
        headers: { "content-type": "application/json", ...corsHeaders(origin) },
      },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "content-type": "application/json", ...corsHeaders(origin) },
    });
  }

  const input = typeof body?.text === "string" ? body.text.trim() : "";
  if (!input || input.length > 2000) {
    return new Response(JSON.stringify({ error: "text_required_max_2000" }), {
      status: 400,
      headers: { "content-type": "application/json", ...corsHeaders(origin) },
    });
  }

  const voice = typeof body?.voice === "string" && body.voice ? body.voice : TTS_VOICE;
  const model = typeof body?.model === "string" && body.model ? body.model : TTS_MODEL;

  const payload = {
    model,
    voice,
    input: input.slice(0, 2000),
    response_format: "mp3",
  };
  // Steerable instructions only on gpt-4o-mini-tts family
  if (String(model).includes("gpt-4o-mini-tts") || String(model).includes("tts")) {
    payload.instructions = body?.instructions || TTS_INSTRUCTIONS;
  }

  const ttsUrl = new URL("https://api.openai.com/v1/audio/speech");
  // Egress allowlist: reject any destination drift before the outbound fetch.
  const ttsBlocked = egressBlocked(ttsUrl, "atlas-tts");
  if (ttsBlocked) return ttsBlocked;

  const upstream = await fetch(ttsUrl.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok) {
    const errText = await upstream.text();
    return new Response(
      JSON.stringify({
        error: "openai_tts_failed",
        status: upstream.status,
        detail: errText.slice(0, 400),
      }),
      {
        status: 502,
        headers: { "content-type": "application/json", ...corsHeaders(origin) },
      },
    );
  }

  const audio = await upstream.arrayBuffer();
  return new Response(audio, {
    status: 200,
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "no-store",
      "x-atlas-tts": "openai",
      "x-atlas-voice": voice,
      ...corsHeaders(origin),
    },
  });
}

async function proxyToPages(request) {
  const url = new URL(request.url);
  url.hostname = ORIGIN;
  // The incoming URL's protocol/port are request-controlled; normalize them to
  // the Pages origin (https, default port) so they cannot survive into the
  // outbound fetch. No-op for normal https traffic.
  url.protocol = "https:";
  url.port = "";
  // Egress allowlist: reject any destination drift before the outbound fetch.
  const proxyBlocked = egressBlocked(url, "pages-proxy");
  if (proxyBlocked) return proxyBlocked;

  const headers = new Headers(request.headers);
  headers.set("Host", ORIGIN);
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");
  headers.delete("cf-ipcountry");
  headers.delete("x-forwarded-host");
  headers.delete("x-forwarded-proto");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
    cf: { cacheTtl: 0, cacheEverything: false },
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  const resp = await fetch(url.toString(), init);
  const outHeaders = new Headers(resp.headers);
  outHeaders.set("x-proxied-from", "viz-worker");
  outHeaders.set("x-proxy-origin", ORIGIN);
  if ((resp.headers.get("content-type") || "").includes("text/html")) {
    outHeaders.set("cache-control", "public, max-age=0, must-revalidate");
  }

  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: outHeaders,
  });
}

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (incoming.pathname === "/api/atlas/tts" || incoming.pathname === "/api/atlas/tts/") {
      return handleAtlasTts(request, env);
    }
    return proxyToPages(request);
  },
};
