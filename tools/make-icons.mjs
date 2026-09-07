// Rasterises extension/icons/icon.svg into the PNG sizes the two add-on
// stores want. Run it only when the artwork changes — the PNGs are committed,
// so neither a build nor a store submission depends on having a browser here.
//
// Needs a Chromium/Chrome binary. Set CHROMIUM=/path/to/chrome to point at
// one; otherwise the usual install locations are tried.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const svg = join(root, "extension", "icons", "icon.svg");
const SIZES = [16, 32, 48, 128];

const CANDIDATES = [
  process.env.CHROMIUM,
  "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium"
].filter(Boolean);

const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error("No Chromium found. Set CHROMIUM=/path/to/chrome and re-run.");
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), "pt-icons-"));
try {
  for (const size of SIZES) {
    // The SVG is referenced rather than inlined so Chromium scales the vector
    // rather than a bitmap: 16px stays crisp.
    const html = join(tmp, `i${size}.html`);
    writeFileSync(html,
      `<style>html,body{margin:0;padding:0;background:transparent}` +
      `img{display:block;width:${size}px;height:${size}px}</style>` +
      `<img src="file://${svg}">`);
    const out = join(tmp, `i${size}.png`);
    execFileSync(chrome, [
      "--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
      "--force-device-scale-factor=1", "--default-background-color=00000000",
      `--window-size=${size},${size}`, `--screenshot=${out}`, `file://${html}`
    ], { stdio: ["ignore", "ignore", "pipe"] });
    const dest = join(root, "extension", "icons", `icon-${size}.png`);
    copyFileSync(out, dest);
    console.log(`wrote extension/icons/icon-${size}.png`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
