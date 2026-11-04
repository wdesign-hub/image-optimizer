import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { constants } from "node:fs";
import { access, stat, mkdtemp, rm, copyFile } from "node:fs/promises";
import path from "node:path";

const exec = promisify(execFile);
export type Format = "original" | "jpeg" | "png" | "webp" | "avif";
export type Options = { format: Format; quality: number; pngLossy: boolean; stripMetadata: boolean; onlySmaller: boolean; destination?: string };
export type Result = { input: string; output?: string; before: number; after?: number; width?: number; height?: number; status: "saved" | "skipped" | "error"; message: string };
export const presets = { balanced: 80, small: 60, high: 92 };
export async function run(magick: string, args: string[]) {
  return (await exec(magick, args, { timeout: 180000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, MAGICK_THREAD_LIMIT: "2" } })).stdout;
}
export async function findMagick(custom?: string) {
  for (const candidate of [custom, "/opt/homebrew/bin/magick", "/usr/local/bin/magick", ...((process.env.PATH || "").split(":").filter(Boolean).map(p => path.join(p, "magick")))]) {
    if (!candidate || !path.isAbsolute(candidate)) continue;
    try { await access(candidate, constants.X_OK); await run(candidate, ["-version"]); return candidate; } catch { /* try next */ }
  }
  throw new Error("ImageMagick was not found. Run brew install imagemagick, or set ImageMagick Path in extension preferences.");
}
const extensions: Record<string, string> = { ".jpg": "jpeg", ".jpeg": "jpeg", ".png": "png", ".webp": "webp", ".avif": "avif" };
export async function optimize(input: string, options: Options, magick: string): Promise<Result> {
  const result: Result = { input, before: 0, status: "error", message: "" };
  let temporary: string | undefined;
  try {
    if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) throw new Error("Quality must be an integer from 1 to 100.");
    const info = await stat(input);
    if (!info.isFile()) throw new Error("Select image files, not folders.");
    result.before = info.size;
    const sourceFormat = extensions[path.extname(input).toLowerCase()];
    if (!sourceFormat) throw new Error("Supported inputs: JPEG, PNG, WebP and AVIF.");
    const format = options.format === "original" ? sourceFormat : options.format;
    if (!["jpeg", "png", "webp", "avif"].includes(format)) throw new Error("Unsupported output format.");
    const directory = options.destination || path.dirname(input);
    if (!(await stat(directory)).isDirectory()) throw new Error("Output destination must be an existing folder.");
    temporary = await mkdtemp(path.join(directory, ".image-optimizer-"));
    // A neutral filename prevents ImageMagick interpreting brackets or format prefixes.
    const stagedInput = path.join(temporary, `source.${sourceFormat}`);
    await copyFile(input, stagedInput);
    // Inspect all frames first; never silently flatten an animation.
    const frames = (await run(magick, ["identify", "-ping", "-format", "%w %h %[orientation]\\n", stagedInput])).trim().split("\n");
    if (frames.length !== 1) throw new Error("Animated or multi-frame images are skipped to preserve their content.");
    const [w, h, orientation] = frames[0].split(" ");
    const rotated = ["LeftTop", "RightTop", "RightBottom", "LeftBottom"].includes(orientation);
    result.width = Number(rotated ? h : w); result.height = Number(rotated ? w : h);
    const encoded = path.join(temporary, `output.${format === "jpeg" ? "jpg" : format}`);
    const args = [stagedInput, "-auto-orient"];
    // Remove descriptive metadata while retaining the color profile.
    if (options.stripMetadata) args.push("+profile", "exif", "+profile", "iptc", "+profile", "xmp", "-set", "comment", "");
    if (format === "jpeg") args.push("-background", "white", "-alpha", "remove", "-alpha", "off", "-quality", String(options.quality), "-interlace", "Plane");
    if (format === "png") {
      if (options.pngLossy) args.push("-colors", String(Math.max(16, Math.round(256 * options.quality / 100))));
      args.push("-define", "png:compression-level=9");
    }
    if (format === "webp") args.push("-quality", String(options.quality), "-define", "webp:method=6");
    if (format === "avif") args.push("-quality", String(options.quality), "-define", "heic:speed=5");
    args.push(encoded);
    await run(magick, args);
    const dimensions = (await run(magick, ["identify", "-format", "%w %h", encoded])).trim();
    if (dimensions !== `${result.width} ${result.height}`) throw new Error("Output dimensions did not match; output discarded.");
    result.after = (await stat(encoded)).size;
    if (!result.after) throw new Error("Encoder produced an empty output.");
    if (options.onlySmaller && result.after >= result.before) return { ...result, status: "skipped", message: "No smaller output; original kept." };
    const base = path.parse(input).name;
    for (let suffix = 0; ; suffix++) {
      const output = path.join(directory, `${base}-optimized${suffix ? `-${suffix}` : ""}.${format === "jpeg" ? "jpg" : format}`);
      try { await copyFile(encoded, output, constants.COPYFILE_EXCL); result.output = output; break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    return { ...result, status: "saved", message: "Saved optimized copy" };
  } catch (error) {
    return { ...result, status: "error", message: error instanceof Error ? error.message : String(error) };
  } finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
}
export function size(bytes: number) { return bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`; }
