import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("./main.jsx", import.meta.url), "utf8");
const styles = await readFile(new URL("./styles.css", import.meta.url), "utf8");
const headerStart = main.indexOf('<header className="app-topbar"');
const appHeader = main.slice(headerStart, main.indexOf("</header>", headerStart));

test("the header keeps only the centered board name as visible text", () => {
  assert.match(appHeader, /className="topbar-primary"[\s\S]*className="brand-block" role="img" aria-label="Infinite Studio"/);
  assert.match(appHeader, /<small className="sr-only" aria-live="polite">/);
  assert.doesNotMatch(appHeader, /<strong>Infinite Studio<\/strong>/);
  assert.doesNotMatch(appHeader, /<span>檔案<\/span>/);
  assert.match(styles, /\.app-topbar \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(180px, min\(700px, calc\(100% - 800px\)\)\) minmax\(0, 1fr\);/);
  assert.match(styles, /\.account-menu-button \{[\s\S]*max-width: 36px;[\s\S]*width: 36px;/);
});

test("insert actions share an accessible compact menu while text stays direct", () => {
  assert.match(main, /aria-label="加入文字" title="加入文字"/);
  assert.match(main, /aria-label="加入素材與形狀"[\s\S]*?aria-haspopup="menu"/);
  for (const label of ["匯入文字文件", "加入圖片", "加入影片", "建立 Grid", "匯入 SVG", "基本形狀"]) {
    assert.ok(main.includes(label));
  }
  assert.match(main, /onMenuKeyDown[\s\S]*?event\.key === "Escape"/);
  assert.doesNotMatch(main, /className="insert-tool-label"/);
  assert.doesNotMatch(main, /className="insert-tool-chevron"/);
  assert.match(styles, /\.insert-tool \{[\s\S]*min-width: 34px;[\s\S]*padding: 0;/);
});
