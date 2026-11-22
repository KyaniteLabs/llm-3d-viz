import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { expect, it } from "vitest";

const run = promisify(execFile);

it.each(["public", "private"])("checks the correct entry and frontier for the %s data plane", async (plane) => {
  const isPublic = plane === "public";
  const comparison = "/compare/one-vs-two/";
  const blog = "/blog/2026-08-24-model-observatory/";
  const assets = {
    "/": '<title>Iolite</title><script src="/assets/index-candidate.js"></script>',
    "/assets/index-candidate.js": isPublic ? "public-decision-view.js" : "main-observatory.js",
    "/assets/public-decision-view.js": "Choose a model by price and capability. Test model.",
    "/assets/main-observatory.js": "Pareto view for Test model.",
    [blog]: "We Built an Open-Source Model Observatory",
    "/llms.txt": "# Iolite\n" + blog,
    "/sitemap.xml": `<loc>${blog}</loc>${isPublic ? "" : `<loc>${comparison}</loc>`}`,
    [comparison]: '<link rel=canonical><div class="verdict">measured comparison</div>',
    "/frontier-watch.json": isPublic ? "Epoch Capabilities Index" : "Private catalog",
    "/frontier-watch.xml": `<feed xmlns="http://www.w3.org/2005/Atom">${isPublic ? "" : "<entry></entry>"}</feed>`,
  };
  const server = createServer((req, res) => {
    if (req.url === "/frontier-watch.xml") res.setHeader("Content-Type", "application/atom+xml");
    res.end(assets[req.url] ?? "");
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    const { stdout } = await run("bash", ["scripts/public-smoke.sh", `http://127.0.0.1:${port}`], {
      env: { ...process.env, VIZ_DATA_PLANE: plane, SMOKE_MODEL: "Test model" },
    });
    expect(stdout).toContain("all content assertions passed");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
