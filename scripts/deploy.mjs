// Builds and publishes dist/ to the gh-pages branch.
//
// This is the fallback path used while the local `gh` token lacks the
// `workflow` scope. Once that is granted and .github/workflows/deploy.yml is
// pushed, GitHub Actions takes over and this script is no longer needed.
import { execFileSync } from "node:child_process";
import { writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO = "https://github.com/jeltedeproft/ptadmin.git";
const BRANCH = "gh-pages";
const dist = join(process.cwd(), "dist");

const run = (cmd, args, cwd = process.cwd()) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });

console.log("→ build");
run("npm", ["run", "build"], process.cwd());

if (!existsSync(dist)) throw new Error("dist/ ontbreekt — de build is mislukt.");

// GitHub Pages otherwise runs the output through Jekyll.
writeFileSync(join(dist, ".nojekyll"), "");

// A throwaway repo inside dist/ keeps gh-pages history separate from main.
rmSync(join(dist, ".git"), { recursive: true, force: true });
console.log("→ publish");
run("git", ["init", "-q"], dist);
run("git", ["add", "-A"], dist);
run("git", ["commit", "-q", "-m", `Build van ${new Date().toISOString().slice(0, 10)}`], dist);
run("git", ["push", "-f", "-q", REPO, `HEAD:${BRANCH}`], dist);

console.log("\nLive op https://jeltedeproft.github.io/ptadmin/ (kan een minuut duren)");
