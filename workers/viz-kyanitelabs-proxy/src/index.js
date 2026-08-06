/**
 * Tiny reverse proxy: viz.kyanitelabs.tech → llm-3d-viz.pages.dev
 * Exists because zone DNS write is not available on the Wrangler OAuth token;
 * Worker custom domains still work.
 *
 * Critical: do NOT forward the browser Host header to Pages (it freezes the
 * wrong cache key / origin variant). Always set Host to the Pages hostname.
 */
const ORIGIN = "llm-3d-viz.pages.dev";

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const url = new URL(request.url);
    url.hostname = ORIGIN;

    const headers = new Headers(request.headers);
    headers.set("Host", ORIGIN);
    // Avoid CF edge cache poisoning from branded host on the origin fetch.
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
      // Bypass CF cache on the subrequest so Pages production always wins.
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
    // HTML must revalidate so deploys show up on the branded domain immediately.
    if ((resp.headers.get("content-type") || "").includes("text/html")) {
      outHeaders.set("cache-control", "public, max-age=0, must-revalidate");
    }

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: outHeaders,
    });
  },
};
