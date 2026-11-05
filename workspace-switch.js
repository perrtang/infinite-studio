// Save the outgoing board before switching. A different board has its own
// durable record, so duplicating its full snapshot in version history is not
// required to recover it; same-board replacement still needs a checkpoint.
export async function protectBeforeWorkspaceSwitch({ current, nextBoard, needsCheckpoint, persist, checkpoint }) {
  await persist(current);
  if (needsCheckpoint && current.id === nextBoard.id) await checkpoint(current);
}
