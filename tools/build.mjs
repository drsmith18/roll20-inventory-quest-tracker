// Packages extension/ into a store-ready zip, and refuses to do it if the
// tree is in a state a reviewer would bounce.
//
// One zip serves both stores: the Chrome Web Store and addons.mozilla.org
// both want a zip with manifest.json at the root, and this extension has no
// build step, so the shipped files are the source files. That also settles
// AMO's source-code requirement — there is nothing generated to disclose.
//
// The zip is written by hand rather than by shelling out to `zip`, so the
// build behaves the same on Windows as it does anywhere else and the repo
// keeps its "jsdom is the only dependency" promise.
import { deflateRawSync, crc32 as zlibCrc32 } from "node:zlib";
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "extension");
const outDir = join(root, "dist");

// Anything a file manager or an editor leaves lying about. A stray .DS_Store
// is not fatal, but it is noise in a package a human is going to review.
const EXCLUDE = new Set([".DS_Store", "Thumbs.db", ".gitkeep"]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (EXCLUDE.has(name) || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

// ---- checks ---------------------------------------------------------------
// Each one is a rejection we would otherwise only find out about from a store
// review queue, days later.
const problems = [];

const manifestPath = join(srcDir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("no extension/manifest.json — nothing to package");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

// The version lives in two places: the manifest (what the stores read) and
// PT.VERSION (what the panel shows and what every bug report quotes). They
// drift silently, and a bug report citing the wrong version is worse than
// useless. So: they must match, or there is no build.
const utilSrc = readFileSync(join(srcDir, "src", "util.js"), "utf8");
const declared = /PT\.VERSION\s*=\s*"([^"]+)"/.exec(utilSrc);
if (!declared) problems.push("could not find PT.VERSION in src/util.js");
else if (declared[1] !== manifest.version) {
  problems.push(`version mismatch: manifest.json says ${manifest.version}, src/util.js says ${declared[1]}`);
}

// Store-enforced string limits. Both are hard rejections, not warnings.
if (manifest.description && manifest.description.length > 132) {
  problems.push(`description is ${manifest.description.length} chars; the Chrome Web Store caps it at 132`);
}
if (manifest.name && manifest.name.length > 45) {
  problems.push(`name is ${manifest.name.length} chars; keep it under 45 to satisfy both stores`);
}

// Every file the manifest names must actually be in the package.
const referenced = [];
for (const cs of manifest.content_scripts || []) referenced.push(...(cs.js || []), ...(cs.css || []));
for (const path of Object.values(manifest.icons || {})) referenced.push(path);
for (const ref of referenced) {
  if (!existsSync(join(srcDir, ref))) problems.push(`manifest references ${ref}, which does not exist`);
}

// Both stores reject obfuscated or remotely-fetched code outright. This will
// not catch a determined case, but it catches the accident.
for (const file of walk(srcDir).filter((f) => f.endsWith(".js"))) {
  const text = readFileSync(file, "utf8");
  const rel = relative(srcDir, file).split(sep).join("/");
  if (/\beval\s*\(|new\s+Function\s*\(/.test(text)) {
    problems.push(`${rel} uses eval or new Function — both stores treat that as remote code execution`);
  }
}

if (problems.length) {
  console.error("Not packaging. Fix these first:\n");
  for (const p of problems) console.error("  ✖ " + p);
  console.error("");
  process.exit(1);
}

// ---- zip ------------------------------------------------------------------
const crc32 = typeof zlibCrc32 === "function" ? zlibCrc32 : (() => {
  // Node < 20.15 has no zlib.crc32.
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

// A fixed timestamp keeps the zip byte-identical between builds of the same
// tree, so "did anything actually change?" is answerable with a checksum.
const DOS_TIME = 0x6000; // 12:00:00
const DOS_DATE = 0x2821; // 2020-01-01

const files = walk(srcDir);
const locals = [];
const central = [];
let offset = 0;

for (const file of files) {
  const name = relative(srcDir, file).split(sep).join("/");
  const nameBuf = Buffer.from(name, "utf8");
  const raw = readFileSync(file);
  const deflated = deflateRawSync(raw, { level: 9 });
  // Storing beats deflating on tiny or already-compressed files (the PNGs).
  const useDeflate = deflated.length < raw.length;
  const body = useDeflate ? deflated : raw;
  const method = useDeflate ? 8 : 0;
  const sum = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0x0800, 6);        // UTF-8 names
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(sum, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, nameBuf, body);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4);              // version made by
  dir.writeUInt16LE(20, 6);              // version needed
  dir.writeUInt16LE(0x0800, 8);
  dir.writeUInt16LE(method, 10);
  dir.writeUInt16LE(DOS_TIME, 12);
  dir.writeUInt16LE(DOS_DATE, 14);
  dir.writeUInt32LE(sum, 16);
  dir.writeUInt32LE(body.length, 20);
  dir.writeUInt32LE(raw.length, 24);
  dir.writeUInt16LE(nameBuf.length, 28);
  dir.writeUInt16LE(0, 30);              // extra
  dir.writeUInt16LE(0, 32);              // comment
  dir.writeUInt16LE(0, 34);              // disk
  dir.writeUInt16LE(0, 36);              // internal attrs
  dir.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs: regular file, rw-r--r--
  dir.writeUInt32LE(offset, 42);
  central.push(dir, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}

const centralBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const zipPath = join(outDir, `party-tools-${manifest.version}.zip`);
writeFileSync(zipPath, Buffer.concat([...locals, centralBuf, eocd]));

const size = statSync(zipPath).size;
console.log(`Packaged ${files.length} files -> dist/party-tools-${manifest.version}.zip (${(size / 1024).toFixed(1)} KB)`);
console.log("Upload this same file to both the Chrome Web Store and addons.mozilla.org.");
for (const f of files) console.log("  " + relative(srcDir, f).split(sep).join("/"));
