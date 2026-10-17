// Runs a data/pipeline script with whichever Python 3.10+ is installed: "python3" on Linux and
// macOS, "python" or "py" on Windows (where "python3" may be a Microsoft Store stub).
// Usage: node scripts/python.mjs data/pipeline/parse.py [args...]
import { execFileSync, spawnSync } from "node:child_process";

const candidates = ["python3", "python", "py"];
const python = candidates.find((cmd) => {
  try {
    execFileSync(cmd, ["-c", "import sys; assert sys.version_info >= (3, 10)"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
});
if (!python) {
  console.error("Python 3.10 or later is needed: install it from https://www.python.org/downloads/ and run this again.");
  process.exit(1);
}
const result = spawnSync(python, ["-I", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
