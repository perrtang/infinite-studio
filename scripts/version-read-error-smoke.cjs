const assert = require('node:assert/strict');
const { chromium } = require('playwright');
(async () => {
 const base = new URL(process.env.INFINITE_STUDIO_TEST_URL || 'http://127.0.0.1:5272/');
 if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) throw new Error('Only an isolated loopback preview is allowed.');
 const b = await chromium.launch({channel:'chrome',headless:true});
 for (const width of [320,1440]) {
  const c=await b.newContext({locale:'zh-TW',viewport:{width,height:900}});
  await c.route('**/*', r => new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await c.addInitScript(()=>{const orig=IDBDatabase.prototype.transaction; IDBDatabase.prototype.transaction=function(stores,mode,...args){if(window.__failVersions && stores==='versions' && mode==='readonly') throw new Error('test read failure'); return orig.call(this,stores,mode,...args)};});
  const p=await c.newPage(); await p.goto(new URL('?authPreview=signed-in', base).href); await p.waitForTimeout(1500);
  await p.evaluate(()=>window.__failVersions=true);
  await p.getByRole('button',{name:'主選單',exact:true}).click(); await p.getByText('版本紀錄',{exact:true}).first().click();
  const d=p.getByRole('dialog',{name:'版本紀錄'}); await d.getByText('無法讀取本機版本',{exact:true}).waitFor();
  assert.equal(await d.getByText('尚未建立版本',{exact:true}).count(),0);
  await p.evaluate(()=>window.__failVersions=false); await d.getByRole('button',{name:'重新讀取'}).click(); await d.getByText('尚未建立版本',{exact:true}).waitFor();
  console.log(`version error and retry ${width}px PASS`); await c.close();
 }
 await b.close();
})().catch(e=>{console.error(e);process.exitCode=1});
