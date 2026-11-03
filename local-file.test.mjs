import assert from "node:assert/strict";
import test from "node:test";
import {
  localFileWritePermission,
  localMoodboardFilename,
  pickMoodboardLocalFile,
  serializeLocalMoodboard,
  shouldWriteLocalAutosaveFile,
  writeMoodboardToLocalFile,
} from "./local-file.js";

test("local Moodboard filenames are safe and retain the expected extension", () => {
  assert.equal(localMoodboardFilename("Campaign / Spring:01"), "Campaign - Spring-01.studio");
  assert.equal(localMoodboardFilename("   "), "studio.studio");
  assert.equal(localMoodboardFilename(""), "studio.studio");
  assert.equal(localMoodboardFilename("Board... "), "Board.studio");
});

test("local Moodboard serialization is stable and ends with a newline", () => {
  const content = serializeLocalMoodboard({ id: "board-1", objects: [] });
  assert.equal(content.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(content), { id: "board-1", objects: [] });
});

test("local autosave writes only to a confirmed linked file", () => {
  const base = { autoSave: true, target: "local", hasHandle: true };
  assert.equal(shouldWriteLocalAutosaveFile({ ...base, status: "linked" }), true);
  assert.equal(shouldWriteLocalAutosaveFile({ ...base, status: "browser-only" }), false);
  assert.equal(shouldWriteLocalAutosaveFile({ ...base, status: "permission-required" }), false);
  assert.equal(shouldWriteLocalAutosaveFile({ ...base, status: "error" }), false);
  assert.equal(shouldWriteLocalAutosaveFile({ ...base, status: "linked", hasHandle: false }), false);
  assert.equal(shouldWriteLocalAutosaveFile({ ...base, status: "linked", target: "drive" }), false);
});

test("local file write requests permission only from a user-initiated path", async () => {
  let requested = 0;
  const handle = {
    async queryPermission() { return "prompt"; },
    async requestPermission() { requested += 1; return "granted"; },
  };
  assert.equal(await localFileWritePermission(handle), "prompt");
  assert.equal(requested, 0);
  assert.equal(await localFileWritePermission(handle, { request: true }), "granted");
  assert.equal(requested, 1);
});

test("writing a local Moodboard closes the writable stream", async () => {
  const writes = [];
  let closed = false;
  const handle = {
    name: "Board.moodboard",
    async queryPermission() { return "granted"; },
    async createWritable() {
      return {
        async write(value) { writes.push(value); },
        async close() { closed = true; },
      };
    },
  };
  const result = await writeMoodboardToLocalFile(handle, { id: "board-1" });
  assert.equal(JSON.parse(writes[0]).id, "board-1");
  assert.equal(closed, true);
  assert.equal(result.filename, "Board.moodboard");
  assert.ok(result.bytes > 0);
});

test("the save picker receives a safe filename and writes the selected file", async () => {
  let pickerOptions;
  let written = "";
  const handle = {
    name: "Campaign.moodboard",
    async queryPermission() { return "granted"; },
    async createWritable() {
      return {
        async write(value) { written = value; },
        async close() {},
      };
    },
  };
  const selected = await pickMoodboardLocalFile({ id: "board-1", name: "Campaign / 01" }, async (options) => {
    pickerOptions = options;
    return handle;
  });
  assert.equal(selected, handle);
  assert.equal(pickerOptions.suggestedName, "Campaign - 01.studio");
  assert.equal(JSON.parse(written).id, "board-1");
});

test("permission denial never reports a successful local file write", async () => {
  const handle = {
    async queryPermission() { return "denied"; },
    async requestPermission() { return "denied"; },
    async createWritable() { throw new Error("must not create writable"); },
  };
  await assert.rejects(
    writeMoodboardToLocalFile(handle, { id: "board-1" }, { requestPermission: true }),
    (error) => error.code === "local-file/permission-required",
  );
});
