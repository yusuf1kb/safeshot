# Safeshot — Hide Info

[![Windows](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4)](#requirements)
[![Electron](https://img.shields.io/badge/Electron-45-47848F)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)

[Türkçe](README.tr.md) · **English**

Safeshot is a small, fully offline Windows app for redacting an image by hand. Right-click a photo in Explorer → **Bilgileri Gizle** ("Hide info") and it opens ready to edit. Draw a rectangle or paint a freehand area over whatever has to disappear, then apply **blur**, **pixelate** or a **solid colour fill** to that area. The preview matches the exported file.

> No OCR, no automatic detection, no cloud. You decide what to hide; the app only applies the effect you chose.

## Features

- **Explorer context menu:** right-click any image → **Bilgileri Gizle**. The app launches with the file already loaded (if several files are selected, the first one is opened).
- **Two drawing tools:** **Rectangle** (drag a box) and **Freehand** (hold the mouse button and paint an arbitrary shape; brush width adjustable).
- **Move and resize:** drag inside any area to move it, grab the corner handles of a selected rectangle to resize it.
- **Per-area settings:** every area carries its own method, strength and fill colour. Changing one area never affects the others.
  - While an area is selected, method/strength/colour edits apply **only to that area**.
  - With nothing selected, the current settings become the **template for the next area** you draw.
  - Ranges: blur 0.2×–2.0×, pixelate 0.2×–3.0×, fill 40–100 % opacity.
  - Blur strength is monotonic: higher always hides more. Low values stay readable, high values become unreadable.
- **WYSIWYG preview:** what you see on the canvas is what gets written to disk.
- **Freehand strokes leave no outline:** the pen line disappears the moment you release the mouse; only the masked area remains.
- **Formats:** original type, PNG, JPEG, WebP or PDF. The **Quality** slider appears only for lossy formats, where it actually matters.
- **Metadata stripped:** EXIF, GPS, device and date fields are gone from the saved file.
- **Never overwrites:** saves next to the original as `<name>-gizli.<ext>` (e.g. `receipt-gizli.jpg`), falling back to `-2`, `-3` if needed.
- **Four themes:** Gece, Gündüz, Grafit, Kum — remembered between sessions.
- **Fully offline:** no network requests, no telemetry, no uploads.

## Requirements

| | |
|---|---|
| OS | Windows 10 / 11 (64-bit) |
| Installer | No admin rights needed (per-user install, `HKCU` registration) |
| From source | Node.js 20+ with npm |

## Install

### Installer (recommended)

1. Download `Safeshot Setup <version>.exe` from the repository's **Releases** page (or build it yourself, see [Build](#build)).
2. Run it. Installing **for the current user only** is enough; no administrator prompt is required.
3. Right-click any image file → **Show more options** (Windows 11) → **Bilgileri Gizle**.

The installer writes the context-menu entry to `HKCU`, and uninstalling removes it.

### From source

```powershell
npm install
npm start
```

The context-menu entry is registered automatically on first launch — there is no button to press. If the executable moves (new version, renamed folder) the registration is repaired silently on the next start.

On Windows 11 classic menu entries live under **"Show more options"** (`Shift + F10`).

## Usage

1. Right-click an image → **Bilgileri Gizle** (or use **Open image** / drag and drop).
2. Pick a tool on the left — **Rectangle** or **Freehand** — then hold the mouse button and drag over the part to hide.
3. Drag inside the area to **move** it; use the corner handles to **resize** it; remove it with the ✕ in the list or `Delete`.
4. Click an area (on the image or in the list) and set its **method, strength and colour** — only that area changes.
5. **Save**. The default name is `<name>-gizli.<ext>`.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + O` | Open an image |
| `Ctrl + S` | Save (`<name>-gizli.<ext>` next to the original) |
| `Ctrl + Z` | Undo the last change (draw, move, resize, delete, settings) |
| `Delete` / `Backspace` | Delete the selected area |
| `Esc` | Deselect / cancel the current drag |

## Themes

| Theme | Look |
|---|---|
| **Gece** | Dark navy, the default |
| **Gündüz** | Light, neutral blue-grey |
| **Grafit** | Dark grey with an amber accent |
| **Kum** | Light, warm sand |

The button in the top-right corner cycles through them; the choice is stored locally and restored on the next launch.

## Output formats

| Format | Quality slider | Notes |
|---|---|---|
| **Original** | Only when the source is JPEG / WebP | PNG and WebP sources keep their type; every other input (BMP, GIF, TIFF, AVIF, HEIC …) is written as JPEG |
| **PNG** | No | Lossless, highest compression level |
| **JPEG** | Yes (30–100, default 92) | mozjpeg encoding |
| **WebP** | Yes (30–100) | Lossy WebP |
| **PDF** | No | Single page sized from the image, JPEG (quality 92) embedded |

Files are written as `<original name>-gizli.<ext>`, then `-gizli-2`, `-gizli-3` if that name already exists. **Save as…** opens a dialog so you can pick any folder and name.

## How it works

1. **Normalized geometry.** Areas are stored as `{ shape: 'rect' | 'brush', box, points?, brush?, method, strength, color }` with all coordinates in the 0–1 range. The same region data drives both the canvas preview and the export, independent of image size.
2. **Raw pixels.** `sharp` loads the file rotated to its EXIF orientation and converted to raw pixels — metadata is dropped at this point.
3. **Effect patch per area.** For each area the bounding box (plus the brush radius) is cropped and the effect is generated:
   - **Blur / Pixelate:** downscale, then upscale back to the original size — `cubic` kernel for blur, `nearest` for pixelate. The strength maps to the downscale factor, so a higher value really does destroy more detail instead of fading the area into a pale blob.
   - **Fill:** a solid colour layer with the chosen opacity.
4. **Shape mask.** An SVG mask of the same shape (rectangle, or a polyline for freehand with round caps/joins) is applied to the patch with `dest-in`, so only the marked pixels are replaced and the area keeps its own soft edges.
5. **Composite and encode.** All patches are composited onto the base image, then encoded as PNG / JPEG / WebP or wrapped into a PDF with `pdf-lib`.

```
blurFactor   = clamp(round(minSide * (0.06 + 0.12 * strength)), 2, minSide * 0.4)
pixelFactor  = clamp(round(minSide / 6 * strength), 3, minSide / 3.5)
```

Because the preview uses the same factors as the export, small images and large images behave identically on screen and on disk.

## Privacy

- Everything runs locally; the app makes no network requests and sends no telemetry.
- Images are read from disk and written next to the original — nothing is uploaded anywhere.
- Saving re-encodes from raw pixels, which removes EXIF, GPS, device and timestamp blocks.
- The only persisted data is UI preferences (theme, last used method/strength, format) in the app's `localStorage`.

## Tips

- Very small areas leave little room for blur; raise the strength or use **Fill** instead.
- Higher pixelate values mean coarser mosaic blocks; at low values text may still be legible.
- Click the toast that appears after saving to reveal the file in Explorer.
- If the context menu still opens an old build, run the new installer (or launch the new executable once) — the registration is rewritten automatically.

## Build

```powershell
npm run dist
```

The NSIS installer is written to `dist/`. It installs per user, registers the context-menu entries under `HKCU` and removes them on uninstall. The app icon comes from `build/icon.png` (1024×1024), generated from `build/icon.svg`.

The build is unsigned, so Windows SmartScreen may warn on first run: **More info → Run anyway**.

## Project structure

```
safeshot/
├─ electron/               main process (Node.js)
│  ├─ main.js              window, CLI/--open, IPC, single-instance lock
│  ├─ preload.js           contextBridge API exposed to the renderer
│  ├─ registry.js          Explorer context-menu registration (HKCU)
│  └─ image/
│     └─ export.js         blur / pixelate / fill pipeline + PNG, JPEG, WebP, PDF
├─ renderer/               UI — plain HTML/CSS/JS, no bundler
│  ├─ index.html           markup: top bar, sidebar, canvas stage, export bar
│  ├─ style.css            layout, controls and the four theme palettes
│  └─ app.js               canvas editor, region model, history, export
├─ build/                  packaging assets (not shipped inside the app)
│  ├─ icon.svg             vector source of the app icon
│  ├─ icon.png             1024×1024 icon used by electron-builder and the window
│  └─ installer.nsh        NSIS hooks: write/remove the context-menu keys
├─ resources/
│  └─ icon.png             icon loaded at runtime (window / taskbar)
├─ package.json            scripts, dependencies, electron-builder config
├─ README.md               this file (English)
└─ README.tr.md            Turkish documentation
```

### What each file does

| File | Responsibility |
|---|---|
| `electron/main.js` | Creates the 1320×880 window (minimum 940×620) with context isolation on and Node integration off. Owns the single-instance lock: a second launch forwards its `--open <file>` arguments to the running window instead of opening a new one. Parses `--open` from `argv`, keeps the files pending until the renderer is ready, and sends them over the `open-files` channel. Registers the IPC handlers (`app:info`, `file:pick`, `file:info`, `export`, `export:pick`, `shell:*`, `folder:open`, `files:take`), repairs the context-menu registration on every start via `registry.ensure()`, and loads `renderer/index.html`. Also contains the development-only hooks `SAFESHOT_OPEN`, `SAFESHOT_SHOT`, `SAFESHOT_EVAL`, `SAFESHOT_LOG` and `SAFESHOT_REG`. |
| `electron/preload.js` | The only bridge between the sandboxed page and the main process. Exposes `window.safeshot` with `info`, `pickFiles`, `fileInfo`, `exportImage`, `pickExportPath`, `register`, `unregister`, `shellStatus`, `showInFolder`, `toFileUrl`, `pathForFile` (for drag & drop), `onOpenFiles` and `takePendingFiles`. Nothing else from Node/Electron reaches the renderer. |
| `electron/registry.js` | Writes and removes the Explorer entry at `HKCU\Software\Classes\SystemFileAssociations\image\shell\SafeshotGizle` — label **Bilgileri Gizle**, icon from the executable, `MultiSelectModel=Player`, command `"<exe>" --open "%1"`. Handles both the development path and the installed path. `ensure()` compares the stored command with the current executable and rewrites the keys only when they differ, so an update or a moved folder repairs itself silently. Also exports the list of supported extensions (`EXTS`) used by the open dialog and the installer. |
| `electron/image/export.js` | All image processing, using `sharp` and `pdf-lib`. `loadRaw()` reads the file rotated per EXIF into raw pixels (this is where metadata is lost); `pxBox()` converts normalized box coordinates to pixels; `shapeMask()` builds an SVG mask — a rectangle, or a polyline with round caps, with a circle fallback for a single brush point; `blurFactor()` / `pixelFactor()` map strength to a downscale factor; `blurRegions()` crops each area, generates the effect patch, applies the mask with `dest-in` and composites everything onto the base image; `encodeFormat()` picks PNG / JPEG / WebP encoding; `toPdf()` wraps the result into a single-page PDF; `uniquePath()` avoids overwriting; `exportImage()` ties it together and returns the written path. |
| `renderer/index.html` | The whole UI markup: top bar (brand, file name, theme button, **Open image**), sidebar (tool buttons + brush width, the three method cards, strength slider, colour swatch, area list, **Undo** / **Clear**), stage (canvas, empty-state drop zone, progress overlay), export bar (format, quality, **Save as…**, **Save**) and the toast container. |
| `renderer/style.css` | All styling: two-column layout, canvas presentation, buttons, sliders, lists and toasts. The four themes are pure CSS custom properties declared on `:root[data-theme="gece|gunduz|grafit|kum"]`, so the theme switch only changes one attribute on `<html>` — no re-render, no extra code. |
| `renderer/app.js` | The editor. Holds the state (`regions`, `selected`, `tool`, `brush`, `defaults`, `format`, `quality`, history stack), draws the image and the effect preview on a canvas, handles hit testing, dragging, corner resizing and freehand point collection, renders the area list and the selection info line, keeps per-method strength defaults, manages undo snapshots, keyboard shortcuts, the theme cycle and `localStorage` preferences, and calls `exportImage` with the region data. |
| `build/icon.svg` | Vector source of the app icon (the mark also used in the top bar). |
| `build/icon.png` | 1024×1024 raster of the icon, used by electron-builder for the exe and installer; also the window icon in development. |
| `build/installer.nsh` | NSIS include with two macros: `customInstall` writes the `HKCU` context-menu key pointing at `$INSTDIR\Safeshot.exe`, `customUnInstall` deletes it. |
| `resources/icon.png` | Runtime icon for `BrowserWindow` and the taskbar; shipped inside the asar. |
| `package.json` | Project metadata, `start` / `dist` scripts, runtime dependencies (`sharp`, `pdf-lib`), dev dependencies (`electron`, `electron-builder`) and the electron-builder configuration (NSIS target, per-user install, own `build/` resources directory, icon). |
| `.gitignore` | Keeps `node_modules/`, `dist/`, `out/`, logs and exported test fixtures out of the repository. |

## Known limitations

- **HEIC / HEIF / AVIF preview:** Chromium cannot decode these in an `<img>` element, so the app shows "Image could not be opened" even though `sharp` could export them. Convert to JPEG/PNG first.
- **Animated GIF:** only a single frame is processed and exported.
- **Tiny areas:** blur has very few pixels to work with; pixelate or fill give more reliable hiding.
- **Unsigned build:** SmartScreen may warn on first launch.
- The app deliberately has **no OCR or automatic detection** — every area is drawn by hand.

## License

MIT. Image processing by [sharp](https://sharp.pixelplumbing.com/), PDF generation by [pdf-lib](https://pdf-lib.js.org/), desktop shell by [Electron](https://www.electronjs.org/).
