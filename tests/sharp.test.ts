import { createRequire } from "node:module";
import sharp from "sharp";
import { expect, test } from "vitest";
import manifest from "../package.json";

// A 1×1 RGB PNG with pixel #123456, generated independently of Sharp.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQMgkDAAD4AJ3MaiF4AAAAAElFTkSuQmCC",
  "base64",
);

test("declares Sharp directly for the renderer tests", () => {
  expect(manifest.devDependencies).toHaveProperty("sharp");
});

test("resolves patched Sharp for renderer tests and Transformers", () => {
  const require = createRequire(import.meta.url);
  const requireFromTransformers = createRequire(require.resolve("@huggingface/transformers"));
  const transformersSharp = requireFromTransformers("sharp") as typeof sharp;
  for (const version of [sharp.versions.sharp, transformersSharp.versions.sharp]) {
    const [major, minor, patch] = version.split(".").map(Number);
    expect(major > 0 || (major === 0 && (minor > 35 || (minor === 35 && patch >= 5))), version).toBe(true);
  }
});

test("decodes PNG pixels with the installed Sharp binary", async () => {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  expect(info).toMatchObject({ width: 1, height: 1, channels: 3 });
  expect(data).toEqual(Buffer.from([0x12, 0x34, 0x56]));
});
