import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./main.jsx', import.meta.url), 'utf8');

test('automatic edits require opt-in and end on disconnect or project switch', () => {
  assert.match(source, /\[agentAutoEdit, setAgentAutoEdit\] = useState\(false\)/);
  assert.match(source, /checked=\{agentAutoEdit\}[^>]*onChange=\{\(event\) => setAgentAutoEdit\(event\.target\.checked\)\}/);
  assert.match(source, /if \(agentAutoEdit\) return Promise\.resolve\(true\)/);
  assert.match(source, /const disconnectAgent = useCallback\([\s\S]*?setAgentAutoEdit\(false\)/);
  assert.match(source, /useEffect\(\(\) => \(\) => \{ disconnectAgent\(\); \}, \[board\.id, disconnectAgent\]\)/);
  assert.match(source, /status === "disconnected"[\s\S]*?setAgentAutoEdit\(false\)/);
});
