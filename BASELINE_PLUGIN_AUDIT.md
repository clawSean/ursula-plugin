# Baseline Plugin Audit: Ursula

**Plugin ID:** `ursula`
**Date:** 2026-05-09

## What baseline exists now

### Manifest / Package
- `openclaw.plugin.json`: valid, id=`ursula`, activates on startup and on `/ursula` command.
- `package.json`: ESM (`"type": "module"`), lists `./src/index.js` as both extension and runtimeExtension entry. Scripts: `check` and `test` both run the assertion suite.
- No TypeScript; pure JS with no build step needed.
- No dependencies beyond Node built-ins and the OpenClaw SDK (resolved at runtime).

### Source (`src/index.js`)
- Default export: `register(api)` registers one command (`/ursula`).
- Named exports: `sanitizeMarkdownForSpeech`, `extractAssistantSpeakableText`, `readLatestAssistantTextFromSessionTranscript`, `resolveGroupSessionKeyFromContext`.
- No buttons, inline keyboards, callback queries, or menus — pure slash command plugin.
- No tools registered (`registerTool` absent, confirmed by assertion).

### Test coverage (`scripts/check.mjs`)

**Pre-existing coverage:**
- Source-level assertions (key function names, anti-patterns)
- Export type checks (default + named)
- `sanitizeMarkdownForSpeech`: bold/strong/code, bullets/links/quotes/headings, fenced code
- `extractAssistantSpeakableText`: toolCall fallback
- `resolveGroupSessionKeyFromContext`: group chat preference
- `readLatestAssistantTextFromSessionTranscript`: JSONL transcript with toolCall message
- Command registration: name, acceptsArgs, requireAuth, handler type
- Handler paths: help text, no-session error

**Added in this audit:**
- Manifest field validation (id, activation.onStartup, activation.onCommands)
- Package.json field validation (extensions, runtimeExtensions, type=module)
- `sanitizeMarkdownForSpeech` edge cases: empty, whitespace, null, undefined, numeric, strikethrough, image alt text, plain passthrough
- `extractAssistantSpeakableText` edge cases: null, empty object, empty content array, direct text priority, text+toolCall precedence, non-send action skip, caption fallback
- `resolveGroupSessionKeyFromContext` edge cases: empty context, private chat rejection, groupId field usage
- `readLatestAssistantTextFromSessionTranscript` edge cases: empty path, missing file, multi-message transcript (latest-wins)
- Handler: unknown args shows usage, `--help` flag

## Commands run

```
npm run check  # => node scripts/check.mjs
npm test       # => node scripts/check.mjs
```

## Pass/Fail

**PASS** — all assertions pass (pre-existing + new).

## Button/Menu changes

None — this plugin has no Telegram buttons, inline keyboards, or callback queries. It is a pure `/ursula` slash command.

## Remaining gaps

- **No live TTS integration test**: `buildAudioReply` cannot be tested offline (requires OpenClaw SDK `tts-runtime` + a real TTS provider). Would need mocking the SDK import to unit-test this path.
- **No `resolveCommandSessionFile` unit test**: depends on the `session-store-runtime` SDK module. Same mocking constraint.
- **No error-path handler test**: the `catch` branch in the handler (line 263) is not covered since triggering it requires a real session file + failing TTS call.
- **No CI integration**: `npm run check` exists but is not wired into any CI pipeline.
