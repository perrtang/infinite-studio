import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBoard } from './model.js';

test('stdio MCP clients can inspect, create and save a local project copy', async (t) => {
  const directory = await mkdtemp(join(tmpdir(),'studio-mcp-protocol-'));
  const input = join(directory,'input.studio'), output = join(directory,'output.studio');
  await writeFile(input, JSON.stringify(createBoard()));
  const child = spawn(process.execPath, ['mcp/server.mjs','--file',input,'--output',output], {stdio:['pipe','pipe','pipe']});
  t.after(() => child.kill());
  const lines = createInterface({input:child.stdout});
  const pending = new Map();
  lines.on('line', (line) => { const value = JSON.parse(line); if (pending.has(value.id)) {pending.get(value.id)(value); pending.delete(value.id);} });
  let id=0;
  const call = (method, params) => new Promise((resolve,reject) => {
    const next=++id; const timeout=setTimeout(()=>reject(new Error('MCP response timed out')),5000);
    pending.set(next,(value)=>{clearTimeout(timeout); resolve(value)});
    child.stdin.write(`${JSON.stringify({jsonrpc:'2.0',id:next,method,params})}\n`);
  });
  const init = await call('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}});
  assert.equal(init.result.serverInfo.name,'infinite-studio');
  const created=await call('tools/call',{name:'create_object',arguments:{type:'text',text:'Hello',x:12,y:34}});
  assert.ok(!created.result.isError);
  const saved=await call('tools/call',{name:'save_copy',arguments:{}});
  assert.ok(!saved.result.isError);
  assert.equal(JSON.parse(await readFile(output,'utf8')).objects[0].text,'Hello');
  assert.equal(JSON.parse(await readFile(input,'utf8')).objects.length,0);
});
