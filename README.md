# 🐙 Ursula

> *Your assistant has a voice. The sea witch holds them all.*

Deep beneath the waters of your OpenClaw instance, a voice was meant to speak with every reply. But Queen Ursula — sorceress of the deep, collector of voices — has captured them. Every utterance your assistant would have spoken now lives sealed in her grotto.

Call upon `/ursula` to petition the sea witch. If she is merciful, she will release one voice from the deep — spoken aloud, returned to you as a voice note.

---

## Usage

```
/ursula
```

Ursula releases the latest captured reply as audio.

```
/ursula 1
```

Petition her to release the reply *before* that — still held in her grotto.

```
/ursula 2
```

Go deeper. Each number reaches further back into the dark.

```
/ursula help
```

Invoke the sea witch's help scroll.

---

## What Actually Happens

1. `/ursula` is registered as an OpenClaw slash command on startup
2. It reads the latest speakable assistant reply from the current chat transcript — no model inference, no token burn
3. Markdown punctuation is stripped so bold markers don't get read aloud as `asterisk asterisk`
4. The cleaned text is sent through your configured TTS provider
5. The audio returns as a voice note in chat

---

## Lore Notes

- **Queen Ursula** collects the voices. She doesn't destroy them — they wait in her grotto
- `/ursula [back]` lets you reach into the grotto further — `1` is one voice back, `2` is two, and so on
- Ursula holds up to **50 voices** in her grotto at a time
- She ignores `NO_REPLY` and `HEARTBEAT_OK` — those were never real voices to begin with
- If the grotto is empty, she'll tell you
- If the TTS fails, she tightens her grip

---

## Responses

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

## Configuration

Ursula has no plugin-level config. Audio output follows your existing OpenClaw `messages.tts` settings — voice, provider, speed — exactly as configured elsewhere.

---

## Structure

```
ursula/
├── src/
│   └── index.js        # Plugin core — command registration, transcript reading, TTS dispatch
├── scripts/
│   └── check.mjs       # Test suite (assertions, no credentials needed)
├── openclaw.plugin.json
├── package.json
└── README.md
```

---

## Tests

```bash
npm test
```

No credentials. No API calls. Just Ursula asserting dominion over the test suite.

---

*The sea witch does not speak for free. But with the right petition, she will.*
