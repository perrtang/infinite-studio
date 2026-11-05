// A successful download request is not proof of a saved backup. Only continue
// after a user-selected file has been closed and read back byte-for-byte.
export async function saveVerifiedRecovery(snapshot, picker, suggestedName) {
  if (typeof picker !== 'function') throw new Error('此瀏覽器無法指定備份位置，請使用支援檔案儲存的瀏覽器。');
  const text = `${JSON.stringify(snapshot, null, 2)}\n`;
  const handle = await picker({ suggestedName, types: [{ description: 'Infinite Studio 備份', accept: { 'application/json': ['.studio'] } }] });
  const writable = await handle.createWritable();
  try { await writable.write(text); await writable.close(); }
  catch (error) { try { await writable.abort?.(); } catch {} throw error; }
  const file = await handle.getFile();
  if (await file.text() !== text) throw new Error('無法確認備份內容，尚未開啟雲端檔案。');
  return { text, name: handle.name || suggestedName };
}

export function recoveryMatchesCurrent(recovery, snapshot) {
  return Boolean(recovery?.text) && recovery.text === `${JSON.stringify(snapshot, null, 2)}\n`;
}

// The backup and target selection must still describe the active workspace at
// the moment the open starts. A cancellation or failed verification stops it.
export async function openAfterVerifiedRecovery({ snapshot, picker, suggestedName, getCurrentSnapshot, isCurrent, open }) {
  const backup = await saveVerifiedRecovery(snapshot, picker, suggestedName);
  if (!isCurrent() || !recoveryMatchesCurrent(backup, getCurrentSnapshot())) {
    return { opened: false, changed: true, backup };
  }
  return { opened: Boolean(await open(backup)), changed: false, backup };
}
