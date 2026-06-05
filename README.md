# Ursula 🐙

> *Your assistant has a voice. The sea witch holds them all.*

Deep beneath your OpenClaw instance, Queen Ursula keeps a grotto of stolen
assistant voices. Every useful reply that should have been spoken aloud waits
there, sealed in a shell, until someone brave enough types `/ursula`.

Ursula is a tiny OpenClaw runtime plugin: it finds a recent assistant reply in
the current chat transcript, cleans it for speech, sends it through your
configured TTS provider, and returns the result as a voice note.

No model call. No extra token burn. Just one sea witch, one command, and the
voice she was already hoarding.

---

## Why Summon Her

- **Turn text replies into voice notes** when a chat answer should be heard, not
  reread.
- **Replay older replies** with `/ursula 1`, `/ursula 2`, and deeper offerings.
- **Works in Telegram groups** where visible assistant replies may be delivered
  through OpenClaw's `message` tool rather than plain assistant text.
- **Uses your existing OpenClaw TTS setup** for provider, voice, speed, and
  channel behavior.
- **Keeps the ritual cheap** by reading local transcript JSONL instead of asking
  a model to rewrite anything.

---

## Installation

Clone the plugin somewhere your OpenClaw host can read it:

```bash
git clone https://github.com/clawSean/ursula-plugin.git ~/.openclaw/extensions/ursula
```

Allow the plugin in your OpenClaw config:

```json
{
  "plugins": {
    "allow": ["ursula"],
    "paths": ["~/.openclaw/extensions/ursula"]
  }
}
```

Then restart OpenClaw Gateway so the sea witch can rise from the manifest.

To confirm she is awake:

```bash
openclaw plugins list
```

You should see `Ursula` / `ursula` enabled.

---

## TTS Prerequisite

Ursula does not bring her own voice engine. She uses the one you already
configured in OpenClaw.

Make sure your normal `messages.tts` setup works first. If OpenClaw cannot
produce TTS elsewhere, Ursula can still find the captured reply, but she will
tighten her grip instead of releasing audio.

---

## Usage

Release the latest captured assistant reply:

```text
/ursula
```

Release the reply before that:

```text
/ursula 1
```

Reach further into the grotto:

```text
/ursula 2
```

Open the help scroll:

```text
/ursula help
```

The `back` number must be between `0` and `50`. `0` is the same as `/ursula`.

---

## What Actually Happens

1. `/ursula` is registered as an authenticated OpenClaw slash command on startup.
2. The command resolves the real chat session transcript, including Telegram
   group chats where slash-command context may point at a separate command
   session.
3. Ursula walks backward through assistant turns until she finds speakable text.
4. She skips empty replies, `NO_REPLY`, `HEARTBEAT_OK`, silent sends, and her own
   prior error messages.
5. Markdown gets stripped into speech-friendly text so TTS does not read
   formatting punctuation aloud.
6. The cleaned text goes through OpenClaw's configured TTS runtime.
7. The audio comes back to chat as a trusted local voice/media reply.

---

## Lore Rules

- **Queen Ursula collects voices.** She does not destroy them. They wait.
- `/ursula [back]` is a deeper dive into the grotto. `1` means one captured
  voice back. `2` means two. The abyss stops at `50`.
- `NO_REPLY` and `HEARTBEAT_OK` were never true voices, so she ignores them.
- If the grotto is empty, she says so.
- If TTS fails, she keeps the voice and tells you why.

---

## Response Scroll

| Situation | What Ursula says |
|---|---|
| Fetching audio | `🐙 Petitioning Queen Ursula to release the voice…` |
| No session | `🐙 Ursula's grotto echoes with silence — No active chat session is open to draw from.` |
| Nothing captured yet | `Ursula reaches into the grotto — but no voice has been captured here yet.` |
| Nothing that far back | `Ursula reaches into the grotto, but no voice lingers N back in this chat.` |
| TTS returns nothing | `Ursula stirs — but releases nothing.` |
| Unrecognised offering | `🐙 Ursula does not recognise that offering.` |
| Out of range number | `🐙 Even Ursula cannot reach that far back into the grotto.` |
| Hard error | `❌ Ursula tightens her grip: <reason>` |

---

## Troubleshooting

**Ursula says there is no active chat session**

The command could not resolve a transcript file from the command context. Check
that the command is running inside an active OpenClaw chat and that your
Gateway is using the same session store as the chat runtime.

**Ursula finds no captured voice**

The current chat may not have a recent speakable assistant reply yet, or the
latest assistant turns may have been silent/status-only messages.

**Ursula releases text from the wrong place**

Group chats are keyed by chat id and thread id when OpenClaw provides them. If
you recently changed session scope or moved between forum topics, restart
Gateway and verify the current OpenClaw session config.

**Ursula tightens her grip**

That usually means the TTS provider failed. Verify your normal OpenClaw TTS
configuration before blaming the sea witch.

---

## Project Structure

```text
ursula/
├── .github/
│   └── workflows/
│       └── ci.yml
├── src/
│   └── index.js
├── scripts/
│   └── check.mjs
├── LICENSE
├── openclaw.plugin.json
├── package.json
└── README.md
```

---

## Development

Run the offline check suite:

```bash
npm test
```

The tests do not need credentials or a live TTS provider. They assert the
manifest/package posture, command registration, transcript parsing,
Telegram-group fallback behavior, markdown cleanup, and `/ursula [back]`
navigation.

---

## License

MIT. The sea witch is dramatic, not proprietary.

---

*The sea witch does not speak for free. But with the right petition, she will.*
