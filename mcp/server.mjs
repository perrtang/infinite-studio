import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { StudioFileStore } from './file-store.mjs';
import { startLiveBridge } from './live-bridge.mjs';

function option(name) { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; }
const live = process.argv.includes('--live');
const bridge = live ? await startLiveBridge({ origin: option('--origin') || 'https://infinite.petfashion.tw' }) : null;
if (bridge) process.stdin.once('end', () => bridge.close());
const store = live ? null : new StudioFileStore(option('--file'), option('--output'));
if (store) await store.open();
const result = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const safe = (fn) => async (args) => { try { return result(await fn(args)); } catch (error) { return { isError: true, content: [{ type: 'text', text: String(error.message || error) }] }; } };

serveStdio(() => {
  const server = new McpServer({ name: 'infinite-studio', version: '0.1.0' });
  if (bridge) server.registerTool('pair_canvas', { description: 'Get the private pairing address to enter in Infinite Studio. Do not share it with anyone else.', inputSchema: z.object({}), annotations: { readOnlyHint: true } }, safe(() => ({ pairingUrl: bridge.pairingUrl, connected: bridge.connected })));
  server.registerTool('inspect_project', { description: 'List the project objects and groups without including media data.', inputSchema: z.object({}), annotations: { readOnlyHint: true } }, safe(() => bridge ? bridge.request('inspect_project') : store.summary()));
  server.registerTool('inspect_object', { description: 'Read a project object without embedded media data.', inputSchema: z.object({ id: z.string().min(1) }), annotations: { readOnlyHint: true } }, safe(({id}) => bridge ? bridge.request('inspect_object', {id}) : store.getObject(id)));
  server.registerTool('create_object', { description: live ? 'Request a new text or shape object; the user must approve it in Infinite Studio.' : 'Add a text or shape object to the in-memory copy; call save_copy to write it.', inputSchema: z.discriminatedUnion('type', [z.object({type:z.literal('text'),text:z.string().max(100000),x:z.number().finite(),y:z.number().finite()}),z.object({type:z.literal('shape'),shapeKind:z.enum(['rectangle','triangle','polygon','star']),x:z.number().finite(),y:z.number().finite()})]), annotations: { destructiveHint: false } }, safe((args) => bridge ? bridge.request('create_object', args) : store.createObject(args)));
  server.registerTool('edit_object', { description: live ? 'Request an edit to an unlocked canvas object; the user must approve in Infinite Studio.' : 'Edit an unlocked object in memory. Requires --output; call save_copy to write a new file.', inputSchema: z.object({ id: z.string().min(1), patch: z.object({name: z.string().optional(), text: z.string().optional(), textAlign: z.enum(['left','center','right','justify']).optional(), textVerticalAlign: z.enum(['top','middle','bottom']).optional(), fontSize: z.number().min(6).max(10000).optional(), color: z.string().optional(), fill: z.string().optional(), pivotX: z.number().finite().optional(), pivotY: z.number().finite().optional(), width: z.number().finite().min(1).optional(), height: z.number().finite().min(1).optional(), rotation: z.number().finite().optional(), visible: z.boolean().optional(), locked: z.boolean().optional()}).strict() }), annotations: { destructiveHint: false } }, safe(({id, patch}) => bridge ? bridge.request('edit_object', {id, patch}) : store.patchObject(id, patch)));
  if (store) server.registerTool('save_copy', { description: 'Save a new project copy to the --output path. Later saves use numbered files; existing files and the original are never overwritten.', inputSchema: z.object({}), annotations: { destructiveHint: false } }, safe(() => store.saveCopy()));
  return server;
});
