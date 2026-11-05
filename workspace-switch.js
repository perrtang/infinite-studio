import { recoveryMatchesCurrent } from "./external-recovery.js";
// Save the outgoing board before switching. A different board has its own
// durable record, so duplicating its full snapshot in version history is not
// required to recover it; same-board replacement still needs a checkpoint.
export async function protectBeforeWorkspaceSwitch({ current, nextBoard, needsCheckpoint, persist, checkpoint, externalRecovery = null }) {
  if (externalRecovery) {
    if (!recoveryMatchesCurrent(externalRecovery, current)) throw new Error("畫面已變更，備份不再符合目前內容。");
    return;
  }
  await persist(current);
  if (needsCheckpoint && current.id === nextBoard.id) await checkpoint(current);
}
