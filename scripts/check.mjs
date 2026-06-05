import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("src/index.js", root), "utf8");

assert(source.includes("readLatestAssistantTextFromSessionTranscript"), "must read latest assistant transcript text");
assert(source.includes("extractAssistantSpeakableText"), "must read assistant tool-delivered message text");
assert(source.includes("resolveGroupSessionKeyFromContext"), "must prefer group session over slash session context");
assert(source.includes("parseBackArg"), "must support /ursula numeric back argument");
assert(source.includes("isSilentishText"), "must skip silent/no-reply text");
assert(source.includes("sanitizeMarkdownForSpeech"), "must clean markdown punctuation before TTS");
assert(source.includes("text: spokenText"), "must send cleaned speech text to the TTS provider");
assert(source.includes(".replace(/(\\*\\*|__|~~|`)/g"), "must strip bold/code markdown punctuation");
assert(source.includes("textToSpeech"), "must call the configured TTS provider");
assert(source.includes("resolveAndPersistSessionFile"), "must resolve a session file when ctx.sessionFile is missing");
assert(source.includes("resolveSessionKey"), "must derive a transcript session key for group chats");
assert(source.includes("node:fs/promises"), "must read transcript JSONL directly");
assert(!source.includes("text: latestText"), "must not send raw markdown text to TTS");
assert(!source.includes("continueAgent: true"), "must not route through the agent loop");
assert(!source.includes("registerTool("), "must not register tools");

const mod = await import(pathToFileURL(new URL("src/index.js", root).pathname));
assert.equal(typeof mod.default, "function", "plugin must default-export a register function");
assert.equal(typeof mod.sanitizeMarkdownForSpeech, "function", "plugin must export markdown speech sanitizer for direct checks");
assert.equal(typeof mod.extractAssistantSpeakableText, "function", "plugin must export assistant text extractor for direct checks");
assert.equal(typeof mod.readLatestAssistantTextFromSessionTranscript, "function", "plugin must export transcript reader for direct checks");
assert.equal(typeof mod.resolveGroupSessionKeyFromContext, "function", "plugin must export group session resolver for direct checks");

assert.equal(
  mod.sanitizeMarkdownForSpeech("**Bold** and __strong__ with `code`"),
  "Bold and strong with code",
  "must strip bold/strong/code punctuation before speech",
);
assert.equal(
  mod.sanitizeMarkdownForSpeech("- **One**\n1. [Two](https://example.com)\n> ### Three"),
  "One\nTwo\nThree",
  "must turn bullets, links, quotes, and headings into speakable text",
);
assert.equal(
  mod.sanitizeMarkdownForSpeech("```js\nconst x = `ok`;\n```"),
  "const x = ok;",
  "must strip fenced and inline code markers",
);
assert.equal(
  mod.extractAssistantSpeakableText({
    content: [{ type: "toolCall", name: "message", arguments: { action: "send", message: "Visible **Telegram** reply" } }],
  }),
  "Visible **Telegram** reply",
  "must fall back to text sent through the message tool in group chats",
);
assert.equal(
  mod.resolveGroupSessionKeyFromContext({ chatType: "group", chatId: "telegram:-5032687552", sessionKey: "agent:mainelobster:telegram:slash:6566057320" }, "mainelobster"),
  "agent:mainelobster:telegram:group:-5032687552",
  "must prefer the group transcript over the per-user slash transcript",
);

const tmp = await mkdtemp(path.join(tmpdir(), "ursula-check-"));
try {
  const transcript = path.join(tmp, "session.jsonl");
  await writeFile(
    transcript,
    [
      JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "/ursula" }] } }),
      JSON.stringify({
        type: "message",
        message: {
          role: "assistant",
          content: [{ type: "toolCall", name: "message", arguments: { action: "send", message: "Latest **visible** reply" } }],
        },
      }),
    ].join("\n") + "\n",
  );
  assert.equal(
    await mod.readLatestAssistantTextFromSessionTranscript(transcript),
    "Latest **visible** reply",
    "must read latest visible group reply from message tool calls",
  );
  assert.equal(
    await mod.readLatestAssistantTextFromSessionTranscript(transcript, { back: 1 }),
    "",
    "back one returns empty when there is only one speakable reply",
  );
} finally {
  await rm(tmp, { recursive: true, force: true });
}

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

// --- Manifest / package sanity ---
const manifest = JSON.parse(await readFile(new URL("openclaw.plugin.json", root), "utf8"));
assert.equal(manifest.id, "ursula", "manifest id must be 'ursula'");
assert.equal(manifest.activation?.onStartup, true, "manifest must activate on startup");
assert(manifest.activation?.onCommands?.includes("ursula"), "manifest must list ursula command");
assert.equal(manifest.commandAliases?.[0]?.name, "ursula", "manifest must declare the ursula runtime slash alias");
assert.equal(manifest.commandAliases?.[0]?.kind, "runtime-slash", "manifest must mark ursula as a runtime slash command");

const pkg = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
assert.notEqual(pkg.private, true, "package must not be marked private when the repo is intended to be shared");
assert.equal(pkg.license, "MIT", "package must declare the MIT license");
assert.equal(pkg.repository?.url, "git+https://github.com/clawSean/ursula-plugin.git", "package must point at the public repo");
assert(pkg.keywords?.includes("openclaw-plugin"), "package must be discoverable as an OpenClaw plugin");
assert(pkg.files?.includes("openclaw.plugin.json"), "package files must include the plugin manifest");
assert(pkg.openclaw?.extensions?.length > 0, "package.json must list extensions entry");
assert(pkg.openclaw?.runtimeExtensions?.length > 0, "package.json must list runtimeExtensions entry");
assert.equal(pkg.type, "module", "package.json must use ESM");

const license = await readFile(new URL("LICENSE", root), "utf8");
assert.match(license, /^MIT License/, "LICENSE must use the MIT license text");
assert.match(license, /clawSean/, "LICENSE must name clawSean as copyright holder");

// --- sanitizeMarkdownForSpeech edge cases ---
assert.equal(mod.sanitizeMarkdownForSpeech(""), "", "empty string stays empty");
assert.equal(mod.sanitizeMarkdownForSpeech("   "), "", "whitespace-only becomes empty");
assert.equal(mod.sanitizeMarkdownForSpeech(null), "", "null input returns empty");
assert.equal(mod.sanitizeMarkdownForSpeech(undefined), "", "undefined input returns empty");
assert.equal(mod.sanitizeMarkdownForSpeech(42), "", "non-string input returns empty");
assert.equal(
  mod.sanitizeMarkdownForSpeech("~~strikethrough~~ text"),
  "strikethrough text",
  "must strip strikethrough markers",
);
assert.equal(
  mod.sanitizeMarkdownForSpeech("![alt text](image.png)"),
  "alt text",
  "must extract alt text from images",
);
assert.equal(
  mod.sanitizeMarkdownForSpeech("No markdown here."),
  "No markdown here.",
  "plain text passes through unchanged",
);

// --- extractAssistantSpeakableText edge cases ---
assert.equal(
  mod.extractAssistantSpeakableText(null),
  "",
  "null message returns empty",
);
assert.equal(
  mod.extractAssistantSpeakableText({}),
  "",
  "message with no content returns empty",
);
assert.equal(
  mod.extractAssistantSpeakableText({ content: [] }),
  "",
  "message with empty content returns empty",
);
assert.equal(
  mod.extractAssistantSpeakableText({
    content: [{ type: "text", text: "Direct reply" }],
  }),
  "Direct reply",
  "prefers direct text parts over tool calls",
);
assert.equal(
  mod.extractAssistantSpeakableText({
    content: [
      { type: "text", text: "Direct text" },
      { type: "toolCall", name: "message", arguments: { action: "send", message: "Tool text" } },
    ],
  }),
  "Direct text",
  "direct text takes priority when both text and toolCall present",
);
assert.equal(
  mod.extractAssistantSpeakableText({
    content: [{ type: "toolCall", name: "message", arguments: { action: "edit", message: "Edited" } }],
  }),
  "",
  "non-send action in message tool is skipped",
);
assert.equal(
  mod.extractAssistantSpeakableText({
    content: [{ type: "toolCall", name: "message", arguments: { action: "send", caption: "Photo caption" } }],
  }),
  "Photo caption",
  "falls back to caption field in message tool arguments",
);
assert.equal(
  mod.extractAssistantSpeakableText({
    content: [{ type: "toolCall", name: "message", arguments: { action: "send", silent: true, message: "Quiet status" } }],
  }),
  "",
  "silent message tool sends are skipped",
);
assert.equal(
  mod.extractAssistantSpeakableText({
    content: [{ type: "toolCall", name: "message", arguments: { action: "send", message: "NO_REPLY" } }],
  }),
  "",
  "NO_REPLY sends are skipped",
);
assert.equal(
  mod.extractAssistantSpeakableText({
    content: [{ type: "text", text: "❌ No readable assistant reply was found in this chat yet." }],
  }),
  "",
  "Ursula error replies are skipped",
);

// --- resolveGroupSessionKeyFromContext edge cases ---
assert.equal(
  mod.resolveGroupSessionKeyFromContext({}, "mainelobster"),
  "",
  "empty context returns empty session key",
);
assert.equal(
  mod.resolveGroupSessionKeyFromContext({ chatType: "private", chatId: "telegram:12345" }, "mainelobster"),
  "",
  "private chat with non-group ID returns empty",
);
assert.equal(
  mod.resolveGroupSessionKeyFromContext({ chatType: "group", groupId: "telegram:-999" }, "bot1"),
  "agent:bot1:telegram:group:-999",
  "uses groupId when present",
);

// --- readLatestAssistantTextFromSessionTranscript edge cases ---
assert.equal(
  await mod.readLatestAssistantTextFromSessionTranscript(""),
  "",
  "empty session path returns empty",
);
assert.equal(
  await mod.readLatestAssistantTextFromSessionTranscript("/nonexistent/path.jsonl"),
  "",
  "missing file returns empty gracefully",
);

// Multi-message transcript: should return the LATEST assistant reply
const tmp2 = await mkdtemp(path.join(tmpdir(), "ursula-check2-"));
try {
  const transcript2 = path.join(tmp2, "session.jsonl");
  await writeFile(
    transcript2,
    [
      JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "First reply" }] } }),
      JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "follow up" }] } }),
      JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name: "message", arguments: { action: "send", silent: true, message: "Silent latest" } }] } }),
      JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "Second reply" }] } }),
    ].join("\n") + "\n",
  );
  assert.equal(
    await mod.readLatestAssistantTextFromSessionTranscript(transcript2),
    "Second reply",
    "must return the latest speakable assistant reply and skip silent sends",
  );
  assert.equal(
    await mod.readLatestAssistantTextFromSessionTranscript(transcript2, { back: 1 }),
    "First reply",
    "back=1 returns the previous speakable assistant reply",
  );
} finally {
  await rm(tmp2, { recursive: true, force: true });
}

// --- handler: unknown args shows usage ---
const unknownArgs = await command.handler({ args: "foo", config: {}, commandBody: "/ursula foo" });
assert.match(unknownArgs.text, /Usage: \/ursula/, "unrecognized args should show usage");

// --- handler: --help flag ---
const dashHelp = await command.handler({ args: "--help", config: {}, commandBody: "/ursula --help" });
assert.match(dashHelp.text, /Usage: \/ursula/, "--help flag should show usage");

console.log("ursula check passed");
