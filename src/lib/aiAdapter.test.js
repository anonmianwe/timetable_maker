import test from "node:test";
import assert from "node:assert/strict";
import { requestStructureProposal } from "./aiAdapter.js";

test("AI proposal requires an explicit endpoint", async () => {
  await assert.rejects(
    requestStructureProposal({ endpoint: "", model: "", content: {}, sourceName: "sample.xlsx" }),
    /Add the local AI chat-completions URL/,
  );
});
