import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("src/index.js", root), "utf8");

assert(source.includes("readLatestAssistantTextFromSessionTranscript"), "must read latest assistant transcript text");
assert(source.includes("textToSpeech"), "must call the configured TTS provider");
assert(source.includes("resolveAndPersistSessionFile"), "must resolve a session file when ctx.sessionFile is missing");
assert(source.includes("resolveSessionKey"), "must derive a transcript session key for group chats");
assert(source.includes("node:fs/promises"), "must read transcript JSONL directly");
assert(!source.includes("continueAgent: true"), "must not route through the agent loop");
assert(!source.includes("registerTool("), "must not register tools");

const mod = await import(pathToFileURL(new URL("src/index.js", root).pathname));
assert.equal(typeof mod.default, "function", "plugin must default-export a register function");

let command;
const fakeApi = {
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  registerCommand(def) {
    command = def;
  },
};

mod.default(fakeApi);
assert(command, "plugin must register a command");
assert.equal(command.name, "ursula");
assert.equal(command.acceptsArgs, true);
assert.equal(command.requireAuth, true);
assert.equal(typeof command.handler, "function");

const help = await command.handler({ args: "help", config: {}, channel: "telegram", commandBody: "/ursula help" });
assert.match(help.text, /Usage: \/ursula/);

const noSession = await command.handler({ args: "", config: {}, commandBody: "/ursula" });
assert.match(noSession.text, /No active chat session/);

console.log("ursula check passed");
