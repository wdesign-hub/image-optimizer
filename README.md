# Image Optimizer

Local Raycast extension using ImageMagick. Select JPEG, PNG, WebP or AVIF files in Finder, choose output format and quality, then compress the whole selection. No upload or API key.

## Install and run

Requires macOS, Raycast, Node.js 22.22.2+ and ImageMagick 7. 

1. If needed, install ImageMagick with `brew install imagemagick`.
2. Open Terminal and enter this extension folder:

   ```sh
   git clone https://github.com/wdesign-hub/image-optimizer.git
   cd image-optimizer
   npm install
   npm run dev
   ```

3. Keep the development command running while trying changes. It registers the extension in Raycast. Search Raycast for **Optimize Images** (extension: **Image Optimizer**).
4. Select image files in Finder before launching the command. Allow Raycast access to Finder/files if macOS asks. You can also use **Choose Files**, or **Refresh Finder Selection** from the action menu.
5. Choose settings and press Return / **Optimize Images**. Results show each file’s before/after size, percentage saved, and dimensions. Open the action menu to reveal or open an output.

To import manually, use Raycast’s **Import Extension** command and select this project folder (the folder containing `package.json`), then run `npm run dev` once. `npm run build` validates and bundles the extension into Raycast’s local extensions directory; it does not produce a standalone installer. You can assign a hotkey in Raycast Settings → Extensions → Image Optimizer.

## Defaults and behavior

- Original format, Balanced quality 80, remove descriptive metadata, and save only smaller outputs.
- Presets: Smaller File 60, Balanced 80, High Quality 92; custom quality 1–100. These are encoder settings, not a promised size or identical quality across formats.
- Files go beside their originals, or into an optional existing output folder. Names are `photo-optimized.webp`, then `photo-optimized-1.webp`, etc. Existing files and originals are never overwritten. Temporary files are removed after processing, including failures; a forced process termination can leave a hidden `.image-optimizer-*` folder.
- No resizing. EXIF orientation is applied so images stay visually upright; encoded width/height may swap for rotated photos. Output dimensions are verified before saving.
- JPEG is lossy and transparency becomes white. WebP and AVIF use lossy quality settings and support alpha when the installed encoder supports it.
- PNG defaults to lossless compression. Quality does not affect PNG unless **Reduce palette** is checked. Palette reduction is lossy and can alter colors/transparency. ImageMagick alone is not TinyPNG’s encoder, so savings differ, especially for PNG.
- Metadata removal targets EXIF, IPTC, XMP and comments; ICC color profiles are retained. It is not a forensic metadata sanitization guarantee. Disable it to retain supported metadata; orientation metadata may still change.
- Animated/multi-frame inputs and folders are rejected rather than flattened or traversed. Unsupported inputs and encoder failures appear per file while the rest of the batch continues.
- Batch processing is sequential to limit resource usage. Each ImageMagick call has a three-minute timeout. AVIF can be slow. The selected files are snapshotted when processing begins.
- “Save only if smaller” applies even when converting formats; turn it off if a conversion is needed regardless of size. Skipped outputs are discarded.

## Troubleshooting

**ImageMagick not found:** Set **ImageMagick Path** in the extension preferences to `/opt/homebrew/bin/magick` (Apple Silicon), `/usr/local/bin/magick` (Intel), or your custom absolute executable path.

**AVIF/WebP errors:** Run `magick -list format` and check that AVIF/WebP have write support. Homebrew’s ImageMagick package normally includes these delegates. The extension reports the encoder’s error if support is absent.

**Finder access denied:** Check macOS System Settings → Privacy & Security → Automation / Files and Folders for Raycast, or choose files directly.

**No smaller output:** Try a lower quality, WebP/AVIF, or enable PNG palette reduction. You can disable the size check to keep larger conversions.

## Verify or modify

```sh
npm run typecheck
npm test
npm run build
```

The integration test exercises actual ImageMagick encoders for all four outputs, dimensions, safe filename handling, collision handling, original preservation, output folders, animation rejection, and temporary-file cleanup. Finder permissions and the native Raycast screen require a manual launch in Raycast.

Source: `src/optimize.tsx` (interface), `src/optimizer.ts` (engine). Dependencies are pinned by `package-lock.json`. This is a local development extension; Store publishing is not configured.

References: [Raycast extension manifest](https://developers.raycast.com/information/manifest), [Raycast forms](https://developers.raycast.com/api-reference/user-interface/form), [ImageMagick options](https://imagemagick.org/command-line-options/), [supported formats](https://imagemagick.org/formats/).
