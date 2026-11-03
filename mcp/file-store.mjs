import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { extname, resolve } from 'node:path';
import { BOARD_SCHEMA_VERSION, parseBoardFile } from '../model.js';

const digest = (data) => createHash('sha256').update(data).digest('hex');
const permitted = new Set(['name', 'text', 'textAlign', 'textVerticalAlign', 'fontSize', 'color', 'fill', 'pivotX', 'pivotY', 'width', 'height', 'rotation', 'visible', 'locked']);

export class StudioFileStore {
  constructor(input, output) {
    if (!input || !/\.(studio|moodboard)$/i.test(extname(input))) throw new Error('A .studio or legacy .moodboard input file is required.');
    if (output && extname(output).toLowerCase() !== '.studio') throw new Error('The output must be a .studio file.');
    this.input = resolve(input);
    this.output = output && resolve(output);
    if (this.input === this.output) throw new Error('Output must be a new file; the original cannot be overwritten.');
    this.board = null;
    this.originalHash = null;
    this.savedCount = 0;
  }

  async open() {
    const content = await readFile(this.input, 'utf8');
    const normalized = parseBoardFile(content, this.input); // Validate without dropping unknown data.
    this.board = JSON.parse(content);
    // Older .moodboard files may lack the marker required by .studio. Repair
    // only the in-memory copy; never rewrite the source file.
    if (extname(this.input).toLowerCase() === '.moodboard') {
      this.board.format = normalized.format;
      this.board.schemaVersion = normalized.schemaVersion;
      this.board.id ||= normalized.id;
    }
    this.originalHash = digest(content);
    return this.summary();
  }

  summary() {
    if (!this.board) throw new Error('Open the project first.');
    return { name: this.board.name, id: this.board.id, revision: this.board.revision, objects: this.board.objects.map(({id, type, name, groupId, visible, locked}) => ({id, type, name, groupId, visible, locked})), groups: this.board.groups || [], sourceHash: this.originalHash };
  }

  getObject(id) {
    const object = this.board?.objects.find((item) => item.id === id);
    if (!object) throw new Error('Object not found.');
    const {src, ...rest} = object;
    return { ...rest, ...(src ? { hasMedia: true } : {}) };
  }

  patchObject(id, patch) {
    if (!this.output) throw new Error('Write access is disabled. Start the server with --output set to a new .studio file.');
    const index = this.board?.objects.findIndex((item) => item.id === id) ?? -1;
    if (index < 0) throw new Error('Object not found.');
    const object = this.board.objects[index];
    if (object.locked) throw new Error('Object is locked.');
    if (object.textFlowId && Object.hasOwn(patch, 'text')) throw new Error('Linked text frames cannot be edited by this tool yet.');
    if (!Object.keys(patch).length || Object.keys(patch).some((key) => !permitted.has(key))) throw new Error('Unsupported or empty object update.');
    this.board.objects[index] = { ...object, ...patch, updatedAt: new Date().toISOString() };
    this.board.revision = Number(this.board.revision || 0) + 1;
    this.board.updatedAt = new Date().toISOString();
    return this.getObject(id);
  }

  createObject({ type, text, shapeKind, x, y }) {
    if (!this.output) throw new Error('Write access is disabled.');
    const id = `object-${randomUUID()}`;
    const draft = { id, type, text, shapeKind, pivotX: x, pivotY: y, name: type === 'text' ? '文字' : '形狀', layerName: type === 'text' ? '文字' : '形狀' };
    const object = parseBoardFile(JSON.stringify({ ...this.board, objects: [draft], groups: [] }), this.input).objects[0];
    if (!object) throw new Error('Could not create object.');
    // New normalized objects can contain fields from the current schema.
    // Prevent an older client from silently dropping those fields on save.
    this.board.schemaVersion = Math.max(Number(this.board.schemaVersion) || 1, BOARD_SCHEMA_VERSION);
    this.board.objects.push(object);
    this.board.revision = Number(this.board.revision || 0) + 1;
    this.board.updatedAt = new Date().toISOString();
    return { id, revision: this.board.revision };
  }

  async saveCopy() {
    if (!this.output) throw new Error('Write access is disabled.');
    if (digest(await readFile(this.input, 'utf8')) !== this.originalHash) throw new Error('The source changed since opening. Reopen it before saving.');
    parseBoardFile(JSON.stringify(this.board), this.output);
    // wx ensures an existing file, including a symlink, is never replaced.
    // After the first save, choose a new numbered copy for each subsequent save.
    let target = this.output;
    let next = this.savedCount ? this.savedCount + 1 : 0;
    while (true) {
      if (next) target = `${this.output.slice(0, -extname(this.output).length)}-${next}.studio`;
      try {
        await writeFile(target, `${JSON.stringify(this.board, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
        break;
      } catch (error) {
        if (!next || error.code !== 'EEXIST' || next >= 10000) throw error;
        next += 1;
      }
    }
    this.savedCount = next || 1;
    return { output: target, revision: this.board.revision, copyId: randomUUID() };
  }
}
