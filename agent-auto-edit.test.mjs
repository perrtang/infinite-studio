import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./main.jsx', import.meta.url), 'utf8');

test('automatic edits default on but remain optional and end on disconnect or project switch', () => {
  assert.match(source, /\[agentAutoEdit, setAgentAutoEdit\] = useState\(true\)/);
  assert.match(source, /checked=\{agentAutoEdit\}[^>]*onChange=\{\(event\) => setAgentAutoEdit\(event\.target\.checked\)\}/);
  assert.match(source, /if \(agentAutoEdit\) return Promise\.resolve\(true\)/);
  assert.match(source, /const disconnectAgent = useCallback\([\s\S]*?agentSocketRef\.current\?\.close\(\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => \{ disconnectAgent\(\); \}, \[board\.id, disconnectAgent\]\)/);
  assert.match(source, /status === "disconnected"[\s\S]*?setAgentAutoEdit\(true\)/);
});

test('board writes keep the agent snapshot current without a stale passive-effect overwrite', () => {
  assert.doesNotMatch(source, /useEffect\(\(\) => \{\s*boardRef\.current\s*=\s*board;/);
  const writes = [...source.matchAll(/setBoard\((\w+)\);/g)];
  assert.ok(writes.length > 0);
  for (const write of writes) {
    const preceding = source.slice(Math.max(0, write.index - 700), write.index);
    assert.match(preceding, new RegExp(`boardRef\\.current\\s*=\\s*${write[1]}\\s*;`));
  }
});
