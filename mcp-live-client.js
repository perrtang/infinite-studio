const FIELDS = new Set(['name', 'text', 'textAlign', 'textVerticalAlign', 'fontSize', 'color', 'fill', 'pivotX', 'pivotY', 'width', 'height', 'rotation', 'visible', 'locked']);
function validValue(key, value) {
  if (['name', 'text', 'color', 'fill'].includes(key)) return typeof value === 'string' && value.length <= 100_000;
  if (key === 'textAlign') return ['left', 'center', 'right', 'justify'].includes(value);
  if (key === 'textVerticalAlign') return ['top', 'middle', 'bottom'].includes(value);
  if (['visible', 'locked'].includes(key)) return typeof value === 'boolean';
  return typeof value === 'number' && Number.isFinite(value)
    && (!['width', 'height'].includes(key) || value >= 1)
    && (key !== 'fontSize' || (value >= 6 && value <= 10000));
}

export function validateCanvasPairingUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('連線資訊格式不正確。'); }
  if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port || !/^\/[a-f0-9]{64}$/.test(url.pathname) || url.search || url.hash || url.username || url.password) {
    throw new Error('只能使用本機 Agent 提供的連線資訊。');
  }
  return url.href;
}

export function connectCanvasAgent(address, { getBoard, isReadOnly, approveEdit, applyEdit, applyCreate, onStatus, timeoutMs = 30000 }, WebSocketType = WebSocket) {
  const socket = new WebSocketType(validateCanvasPairingUrl(address));
  const boardId = getBoard().id;
  const connectionTimer = setTimeout(() => { onStatus('error'); socket.close(); }, timeoutMs);
  socket.onopen = () => { clearTimeout(connectionTimer); onStatus('connected'); };
  socket.onerror = () => { clearTimeout(connectionTimer); onStatus('error'); };
  socket.onclose = () => { clearTimeout(connectionTimer); onStatus('disconnected'); };
  socket.onmessage = async (event) => {
    let request;
    try {
      if (typeof event.data !== 'string' || event.data.length > 200_000) throw new Error('請求資料過大。');
      request = JSON.parse(event.data);
      if (!request || typeof request.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(request.id)) throw new Error('請求格式不正確。');
      const board = getBoard();
      if (board.id !== boardId) throw new Error('工作檔已切換，請重新連線。');
      let result;
      if (request.method === 'inspect_project') {
        result = { id: board.id, name: board.name, revision: board.revision, objects: board.objects.map(({id, type, name, groupId, visible, locked}) => ({id, type, name, groupId, visible, locked})), groups: board.groups || [] };
      } else if (request.method === 'inspect_object') {
        const object = board.objects.find((item) => item.id === request.params?.id);
        if (!object) throw new Error('找不到物件。');
        const {src, ...metadata} = object;
        result = { ...metadata, ...(src ? { hasMedia: true } : {}) };
      } else if (request.method === 'create_object') {
        const {type, text, shapeKind, x, y} = request.params || {};
        if (isReadOnly()) throw new Error('目前沒有工作檔的編輯權限。');
        if (!['text', 'shape'].includes(type) || (type === 'text' && (typeof text !== 'string' || text.length > 100000)) || (type === 'shape' && !['rectangle','triangle','polygon','star'].includes(shapeKind)) || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('不支援此物件。');
        const patch = type === 'text' ? {type, text, x, y} : {type, shapeKind, x, y};
        const approved = await approveEdit({ action: 'create', name: type === 'text' ? '文字' : '形狀', patch, boardId, revision: board.revision });
        if (!approved) throw new Error('使用者沒有核准修改。');
        if (getBoard().id !== boardId || getBoard().revision !== board.revision || isReadOnly()) throw new Error('工作檔已有變更，請重新提出修改。');
        result = applyCreate(patch);
      } else if (request.method === 'edit_object') {
        const { id, patch } = request.params || {};
        const object = board.objects.find((item) => item.id === id);
        if (isReadOnly() || !object || object.locked) throw new Error('目前沒有這個物件的編輯權限。');
        if (object.textFlowId && Object.hasOwn(patch || {}, 'text')) throw new Error('目前尚不支援修改連結文字框的內容。');
        if (!patch || typeof patch !== 'object' || Array.isArray(patch) || !Object.keys(patch).length || Object.keys(patch).some((key) => !FIELDS.has(key) || !validValue(key, patch[key]))) throw new Error('不支援此修改。');
        const approved = await approveEdit({ id, name: object.name || object.type, patch, boardId, revision: board.revision });
        if (!approved) throw new Error('使用者沒有核准修改。');
        if (getBoard().id !== boardId || getBoard().revision !== board.revision || isReadOnly()) throw new Error('工作檔已有變更，請重新提出修改。');
        result = applyEdit(id, patch);
      } else throw new Error('不支援此操作。');
      socket.send(JSON.stringify({ id: request.id, result }));
    } catch (error) {
      if (request?.id && socket.readyState === 1) socket.send(JSON.stringify({ id: request.id, error: String(error.message || error) }));
    }
  };
  return socket;
}
