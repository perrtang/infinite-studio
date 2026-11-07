export function isCloudBoardReadOnly(sharing, link) {
  if (!link?.fileId) return false;
  if (sharing?.fileId === link.fileId) {
    if (["ready", "linked"].includes(sharing.status)) return !sharing.canEdit;
    // A failed or in-flight refresh must not discard a known viewer state.
    if (sharing.role === "viewer") return true;
  }
  return !link.canEdit && !link.ownedByMe;
}

// Update access only: the synced revision and remote version identify the
// saved content and must not change when permissions are refreshed.
export function updateDriveLinkAccess(state, boardId, fileId, access) {
  const link = state?.links?.[boardId];
  if (!link || link.fileId !== fileId) return state;
  return { ...state, links: { ...state.links, [boardId]: { ...link, ...access } } };
}
