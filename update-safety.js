export function assertUpdateSnapshotUnchanged(snapshot, current, currentView) {
  if (current.id !== snapshot.id || current.revision !== snapshot.revision || current.updatedAt !== snapshot.updatedAt || JSON.stringify(currentView) !== JSON.stringify(snapshot.view)) {
    throw new Error("工作內容在儲存期間有變更，請再按一次更新");
  }
}

export async function savePrimaryBeforeUpdate({ dirty, target, localStatus, hasHandle, driveBusy, saveLocal, saveDrive }) {
  if (!dirty) return true;
  if (target === 'local') {
    if (['browser-only', 'unsupported'].includes(localStatus)) return true;
    if (localStatus !== 'linked' || !hasHandle) return false;
    return Boolean(await saveLocal());
  }
  if (target !== 'drive' || driveBusy) return false;
  return Boolean(await saveDrive());
}
