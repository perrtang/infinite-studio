import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoLoadDriveChange } from './drive-live-refresh.js';

test('only a clean and previously synced workspace loads a changed matching cloud file', () => {
 const link={fileId:'one',version:'4',syncedRevision:7,syncedUpdatedAt:'t1'};
 const board={id:'board',revision:7,updatedAt:'t1'};
 const remote={id:'one',version:'5'};
 const args={link,remote,board};
 assert.equal(shouldAutoLoadDriveChange(args),true);
 assert.equal(shouldAutoLoadDriveChange({...args,dirty:true}),false);
 assert.equal(shouldAutoLoadDriveChange({...args,board:{...board,revision:8}}),false);
 assert.equal(shouldAutoLoadDriveChange({...args,board:{...board,updatedAt:'t2'}}),false);
 assert.equal(shouldAutoLoadDriveChange({...args,link:{...link,syncedUpdatedAt:''}}),false);
 assert.equal(shouldAutoLoadDriveChange({...args,remote:{id:'other',version:'5'}}),false);
 assert.equal(shouldAutoLoadDriveChange({...args,remote:{id:'one',version:'4'}}),false);
});
