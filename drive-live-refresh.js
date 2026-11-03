import { remoteContentChanged } from './workspace-read-guard.js';

export function shouldAutoLoadDriveChange({ link, remote, board, dirty = false }) {
  return Boolean(link && remote && board && !dirty
    && link.fileId === remote.id
    && remoteContentChanged(link, remote)
    && Number(link.syncedRevision) === Number(board.revision)
    && Boolean(link.syncedUpdatedAt) && link.syncedUpdatedAt === board.updatedAt);
}
