// The version number lives in three files and has drifted before (package.json
// sat at 0.9.0 while the extension shipped 0.9.20). PT.VERSION is user-facing:
// it appears in the boot log and in every pre-filled bug report, so when it
// disagrees with the manifest, every report we receive names the wrong build.
//
// manifest.json is the source of truth. This test is the thing that keeps the
// other two honest.
const fs = require("fs");
const path = require("path");
const { section, check, report } = require("./lib/assert");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extension/manifest.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const utilSrc = fs.readFileSync(path.join(root, "extension/src/util.js"), "utf8");

const m = utilSrc.match(/PT\.VERSION\s*=\s*"([^"]+)"/);
const ptVersion = m ? m[1] : null;

section("the version number agrees everywhere:");

check("manifest.json declares a semver version", /^\d+\.\d+\.\d+$/.test(manifest.version || ""), manifest.version);
check("util.js declares PT.VERSION", ptVersion !== null, "no PT.VERSION assignment found");
check("PT.VERSION matches the manifest", ptVersion === manifest.version,
  "util.js " + ptVersion + " vs manifest " + manifest.version);
check("package.json matches the manifest", pkg.version === manifest.version,
  "package.json " + pkg.version + " vs manifest " + manifest.version);

// The store listing name is the one most likely to be edited casually, and
// getting it wrong is a rejection rather than a bug. Guard the two things that
// would actually break a submission.
section("the manifest is submittable:");
check("name is within Chrome's 75-character limit", (manifest.name || "").length <= 75, (manifest.name || "").length + " chars");
check("description is within Chrome's 132-character limit", (manifest.description || "").length <= 132, (manifest.description || "").length + " chars");
check("the name does not lead with the Roll20 trademark",
  !/^Roll20\b/i.test(manifest.name || "") && /unofficial/i.test(manifest.name || ""),
  manifest.name);

report("version");
