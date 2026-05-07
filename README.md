# Ursula 🦞

Tiny OpenClaw spell for `/ursula` — pull the latest assistant reply, run it through TTS, and drop it back in chat as a voice note.

## What it does

- Reads the latest assistant reply from the current chat transcript.
- Sends that exact text through the configured TTS provider.
- Returns the audio in chat as a voice note / audio attachment.
- Does not call the agent loop or request a fresh model response.

## Vibe

- 🦞 crustacean-approved
- 🔊 talky, not chatty
- 🎭 a little theatrical
- ⚙️ one command, one job

## Usage

```text
/ursula
```
Optional help:

```text
/ursula help
```
## Notes

- If there is no active chat session or no readable assistant reply, it returns a short error.
- TTS behavior comes from your existing OpenClaw `messages.tts` config.
- The command is intentionally narrow: one job, one output.

## Check

```bash
npm run check
```
