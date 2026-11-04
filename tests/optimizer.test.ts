import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { findMagick, optimize, run, type Options } from "../src/optimizer";
const defaults: Options = { format: "original", quality: 80, pngLossy: false, stripMetadata: true, onlySmaller: false };
test("real encoders, dimensions, transparency, collisions, skips and cleanup", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "optimizer-test-"));
  try {
    const magick = await findMagick();
    const source = path.join(dir, "image [1];$ test.png");
    const plain = path.join(dir, "fixture.png");
    await run(magick, ["-size", "192x128", "gradient:red-blue", plain]);
    const { copyFile } = await import("node:fs/promises"); await copyFile(plain, source);
    const original = await readFile(source);
    for (const format of ["jpeg", "png", "webp", "avif"] as const) {
      const result = await optimize(source, { ...defaults, format }, magick);
      assert.equal(result.status, "saved", result.message);
      assert.equal(await run(magick, ["identify", "-format", "%w %h", result.output!]), "192 128");
    }
    const again = await optimize(source, { ...defaults, format: "jpeg" }, magick);
    assert.match(again.output!, /-optimized-1\.jpg$/);
    assert.deepEqual(await readFile(source), original);
    const skipped = await optimize(source, { ...defaults, format: "png", onlySmaller: true }, magick);
    if (skipped.after! >= skipped.before) assert.equal(skipped.status, "skipped");
    assert.equal((await optimize(dir, defaults, magick)).status, "error");
    assert.equal((await optimize(source, { ...defaults, quality: 101 }, magick)).status, "error");
    const dest = path.join(dir, "destination"); await mkdir(dest);
    assert.equal((await optimize(source, { ...defaults, destination: dest }, magick)).status, "saved");
    const animated = path.join(dir, "animated.webp");
    await run(magick, ["-delay", "20", plain, "(", plain, "-negate", ")", "-loop", "0", animated]);
    assert.equal((await optimize(animated, defaults, magick)).status, "error");
    assert.ok(!(await readdir(dir)).some(f => f.startsWith(".image-optimizer-")));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
