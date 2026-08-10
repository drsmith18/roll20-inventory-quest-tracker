// The smallest assertion helper that still gives a readable failure.
// No framework: this repo has no build step and these tests shouldn't be the
// thing that introduces one.
let failures = 0;
let checks = 0;

function section(label) {
  console.log("\n" + label);
}

// check("what should be true", cond, "what it actually was")
function check(label, cond, actual) {
  checks++;
  if (!cond) failures++;
  console.log((cond ? "  PASS  " : "  FAIL  ") + label +
    (cond || actual === undefined ? "" : "\n         got: " + actual));
}

// Call once at the end. Exits non-zero so `npm test` fails properly.
function report(name) {
  if (failures) {
    console.log("\n" + name + ": " + failures + " of " + checks + " check(s) FAILED");
    process.exit(1);
  }
  console.log("\n" + name + ": all " + checks + " checks passed");
  process.exit(0);
}

module.exports = { section, check, report };
