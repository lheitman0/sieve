// @ts-check
// Signs the extension as an unlisted add-on on addons.mozilla.org and opens the
// signed .xpi in Firefox so it installs permanently.
//
// Credentials: WEB_EXT_API_KEY / WEB_EXT_API_SECRET in the environment, or in
// ~/.config/sieve/amo.env (KEY=value lines). Get them at
// https://addons.mozilla.org/developers/addon/api/key/
//
// The signed package includes extension/assets/seeds/personal-*.txt if present.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = path.join(rootDir, ".web-ext-artifacts");
const credsFile = path.join(homedir(), ".config", "sieve", "amo.env");

function loadCredentials() {
  const env = { ...process.env };
  if (existsSync(credsFile)) {
    for (const line of readFileSync(credsFile, "utf8").split("\n")) {
      const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  if (!env.WEB_EXT_API_KEY || !env.WEB_EXT_API_SECRET) {
    console.error(`Missing WEB_EXT_API_KEY / WEB_EXT_API_SECRET (environment or ${credsFile}).`);
    process.exit(1);
  }
  return env;
}

// AMO rejects re-uploads of an existing version, so every signing gets a fresh,
// monotonically increasing version: <major>.<minor>.<YYYYMMDD>.<HHMMSS>.
function signingVersion(baseVersion) {
  const [major = "0", minor = "0"] = baseVersion.split(".");
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = Number(`${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`);
  return `${major}.${minor}.${date}.${time}`;
}

const env = loadCredentials();
execFileSync("node", [path.join(rootDir, "scripts", "build.mjs")], { stdio: "inherit" });

const stageDir = mkdtempSync(path.join(tmpdir(), "sieve-sign-"));
try {
  cpSync(path.join(rootDir, "extension"), stageDir, { recursive: true });
  const manifestPath = path.join(stageDir, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = signingVersion(manifest.version);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Signing ${manifest.browser_specific_settings.gecko.id} version ${manifest.version} (unlisted)...`);

  const before = new Set(existsSync(artifactsDir) ? readdirSync(artifactsDir) : []);
  execFileSync(
    "npx",
    ["web-ext", "sign", "--source-dir", stageDir, "--artifacts-dir", artifactsDir, "--channel", "unlisted"],
    { cwd: rootDir, env, stdio: "inherit" },
  );
  const signed = readdirSync(artifactsDir).filter((f) => f.endsWith(".xpi") && !before.has(f));
  if (signed.length !== 1) {
    console.error(`Expected one new signed .xpi in ${artifactsDir}, found: ${signed.join(", ") || "none"}`);
    process.exit(1);
  }
  const xpi = path.join(artifactsDir, signed[0]);
  console.log(`Signed: ${xpi}`);
  if (process.platform === "darwin") execFileSync("open", ["-a", "Firefox", xpi]);
} finally {
  rmSync(stageDir, { recursive: true, force: true });
}
