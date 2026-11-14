// npm install / npm ci: turn on the repository's git hooks (.githooks/pre-push runs npm run check).
// Works on Windows, macOS and Linux; does nothing where git is absent (a build server).
import { execFileSync } from "node:child_process";

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
} catch {
  // no git here, or not a repository: nothing to set up
}
