import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const code = await readFile(new URL("./public/drive-auth-complete.js", import.meta.url), "utf8");
function run(search, hasOpener = true, locale = "zh-Hant") {
  const elements = Object.fromEntries(["title", "message", "help"].map((id) => [id, { textContent: "" }]));
  const sent = [];
  let closed = false;
  const window = {
    location: { origin: "https://infinite.petfashion.tw", search },
    localStorage: { getItem: () => locale },
    opener: hasOpener ? { closed: false, postMessage: (...args) => sent.push(args) } : null,
    setTimeout: (fn) => fn(),
    close: () => { closed = true; },
  };
  const document = { documentElement: { lang: "" }, getElementById: (id) => elements[id] };
  vm.runInNewContext(code, { window, document, URLSearchParams, Intl });
  return { elements, sent, closed, document };
}

test("callback notifies only its same-origin opener without exposing query data", () => {
  const result = run("?result=success&state=secret&code=secret");
  assert.equal(result.sent.length, 1);
  assert.equal(JSON.stringify(result.sent[0][0]), JSON.stringify({ type: "infinite-studio-drive-oauth", result: "success" }));
  assert.equal(result.sent[0][1], "https://infinite.petfashion.tw");
  assert.equal(result.closed, true);
});

test("missing opener or malformed result offers a recovery route", () => {
  for (const result of [run("?result=success", false), run("?result=unknown")]) {
    assert.equal(result.sent.length, 0);
    assert.equal(result.closed, false);
    assert.match(result.elements.help.textContent, /重新連結/);
  }
});

test("failed authorization reports failure to the opener", () => {
  const result = run("?result=error");
  assert.equal(result.sent[0][0].result, "error");
  assert.match(result.elements.title.textContent, /尚未連結/);
});

test("completion screen follows the saved English or Simplified Chinese preference", () => {
  const english = run("?result=success", false, "en");
  const simplified = run("?result=error", true, "zh-Hans");
  assert.equal(english.document.documentElement.lang, "en");
  assert.equal(english.elements.title.textContent, "Return to your project");
  assert.equal(simplified.document.documentElement.lang, "zh-Hans");
  assert.equal(simplified.elements.title.textContent, "Google Drive 尚未连接");
});
