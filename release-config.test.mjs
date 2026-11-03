import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("release version stays aligned across runtime and update metadata", async () => {
  const [packageJson, lockJson, versionSource, manifestJson] = await Promise.all([
    read("./package.json").then(JSON.parse),
    read("./package-lock.json").then(JSON.parse),
    read("./version.js"),
    read("./public/infinite-moodboard-update.json").then(JSON.parse),
  ]);

  assert.equal(lockJson.version, packageJson.version);
  assert.equal(lockJson.packages[""].version, packageJson.version);
  assert.equal(manifestJson.version, packageJson.version);
  assert.equal(manifestJson.notesUrl, `release-notes/v${packageJson.version}.html`);
  const releaseNotes = await read(`./public/${manifestJson.notesUrl}`);
  assert.match(releaseNotes, new RegExp(`<title>[^<]*v${packageJson.version.replaceAll(".", "\\.")}[^<]*<\\/title>`));
  assert.match(releaseNotes, /更新內容/);
  assert.match(releaseNotes, /修正/);
  assert.match(releaseNotes, /注意事項/);
  assert.match(releaseNotes, new RegExp(`發布日期：${manifestJson.releasedAt}`));
  assert.match(versionSource, new RegExp(`APP_VERSION = ["']${packageJson.version.replaceAll(".", "\\.")}["']`));
  assert.match(versionSource, /APP_RELEASE_NOTES_URL/);
});

test("production authentication uses the PETFASHION branded handler domain", async () => {
  const [authSource, envExample] = await Promise.all([
    read("./auth.js"),
    read("./.env.example"),
  ]);

  assert.match(authSource, /authDomain:\s*["']auth\.petfashion\.tw["']/);
  assert.doesNotMatch(authSource, /authDomain:\s*["'][^"']+\.firebaseapp\.com["']/);
  assert.match(envExample, /VITE_FIREBASE_AUTH_DOMAIN=auth\.petfashion\.tw/);
});

test("GitHub release assets are built from a verified tag without cloud rule deployment", async () => {
  const [releaseWorkflow, pagesWorkflow, packageScript, checkpointScript, notesVerifier] = await Promise.all([
    read("./.github/workflows/release.yml"),
    read("./.github/workflows/deploy-pages.yml"),
    read("./scripts/package-release.sh"),
    read("./scripts/checkpoint-version.sh"),
    read("./scripts/verify-release-notes.mjs"),
  ]);

  assert.match(releaseWorkflow, /npm test/);
  assert.match(releaseWorkflow, /package-release\.sh/);
  assert.match(releaseWorkflow, /gh release create/);
  assert.match(releaseWorkflow, /SHA256SUMS\.txt/);
  assert.match(releaseWorkflow, /release-notes\.html/);
  assert.doesNotMatch(`${releaseWorkflow}\n${pagesWorkflow}`, /firebase(?:-tools)?\s+deploy|firestore:rules/);
  assert.match(pagesWorkflow, /VITE_BASE_PATH:\s*\//);
  assert.doesNotMatch(pagesWorkflow, /VITE_BASE_PATH:\s*\/infinite-moodboard\//);
  assert.match(pagesWorkflow, /outputs:[\s\S]*version:\s*\$\{\{ steps\.release-version\.outputs\.version \}\}/);
  assert.match(pagesWorkflow, /Verify public update channel/);
  assert.match(pagesWorkflow, /EXPECTED_VERSION:\s*\$\{\{ needs\.build\.outputs\.version \}\}/);
  assert.match(pagesWorkflow, /\$\{UPDATE_MANIFEST_URL\}\?deployment=\$\{GITHUB_SHA\}-\$\{attempt\}/);
  assert.match(releaseWorkflow, /https:\/\/infinite\.petfashion\.tw\//);
  assert.match(releaseWorkflow, /Infinite-Studio-/);
  assert.match(packageScript, /Infinite-Studio-v\$version/);
  assert.match(packageScript, /VITE_BASE_PATH=\.\/ npm run build/);
  assert.match(packageScript, /verify-release-notes\.mjs/);
  assert.match(checkpointScript, /verify-release-notes\.mjs/);
  assert.match(notesVerifier, /release-notes\/v\$\{version\}\.html/);
});

test("standalone rules file carries an explicit central-rules safety warning", async () => {
  const [rules, readme, releaseGuide] = await Promise.all([
    read("./firestore.rules"),
    read("./README.md"),
    read("./RELEASING.md"),
  ]);

  assert.match(rules, /DO NOT DEPLOY THIS FILE BY ITSELF/);
  assert.match(readme, /retained only for migration review and must never be deployed/);
  assert.match(releaseGuide, /Never deploy that rule fragment/);
});
