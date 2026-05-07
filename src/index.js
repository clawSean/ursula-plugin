import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const OPENCLAW_GLOBAL_BASE = "file:///usr/lib/node_modules/openclaw/dist/plugin-sdk";

async function importOpenClawSdk(subpath) {
  try {
    return await import(`openclaw/plugin-sdk/${subpath}`);
  } catch (firstErr) {
    try {
      return await import(`${OPENCLAW_GLOBAL_BASE}/${subpath}.js`);
    } catch (secondErr) {
      throw new Error(
        [
          `Unable to import OpenClaw SDK subpath ${subpath}.`,
          `package import failed: ${firstErr?.message || String(firstErr)}`,
          `global fallback failed: ${secondErr?.message || String(secondErr)}`,
        ].join(" "),
      );
    }
  }
}

function asText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function usage() {
  return [
    "Ursula",
    "Usage: /ursula",
    "",
    "Reads the latest assistant reply from the current chat transcript and sends it through the configured TTS provider.",
  ].join("\n");
}

async function buildAudioReply({ cfg, channel, accountId, sessionFile }) {
  const tts = await importOpenClawSdk("tts-runtime");

  const latestText = await readLatestAssistantTextFromSessionTranscript(sessionFile);
  if (!latestText) {
    return { error: "No readable assistant reply was found in this chat yet." };
  }

  const resolvedConfig = tts.resolveTtsConfig(cfg, {
    channelId: channel,
    accountId,
  });
  const prefsPath = tts.resolveTtsPrefsPath(resolvedConfig);

  const result = await tts.textToSpeech({
    text: latestText,
    cfg,
    channel,
    accountId,
    prefsPath,
  });

  if (!result.success || !result.audioPath) {
    return { error: result.error || "TTS provider returned no audio." };
  }

  return {
    reply: {
      mediaUrl: result.audioPath,
      audioAsVoice: result.voiceCompatible === true,
      trustedLocalMedia: true,
      spokenText: latestText,
    },
  };
}

async function readLatestAssistantTextFromSessionTranscript(sessionFile) {
  if (!asText(sessionFile)) return "";

  let raw;
  try {
    raw = await readFile(sessionFile, "utf8");
  } catch {
    return "";
  }

  const lines = raw.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }

    const message = entry?.message;
    if (entry?.type !== "message" || message?.role !== "assistant") continue;

    const content = Array.isArray(message?.content) ? message.content : [];
    const text = content
      .filter((part) => part && part.type === "text" && asText(part.text))
      .map((part) => asText(part.text))
      .join("\n")
      .trim();
    if (text) return text;
  }

  return "";
}

async function resolveCommandSessionFile({ cfg, ctx, accountId }) {
  const existingSessionFile = asText(ctx?.sessionFile);
  if (existingSessionFile) return existingSessionFile;

  const hasIdentity = Boolean(
    asText(ctx?.sessionKey || ctx?.SessionKey || ctx?.channelId || ctx?.channel || ctx?.chatId || ctx?.threadId || ctx?.messageThreadId || ctx?.MessageThreadId),
  );
  if (!hasIdentity) return "";

  const sessions = await importOpenClawSdk("session-store-runtime");
  const agentId = asText(accountId || ctx?.agentId || ctx?.config?.agentId) || "mainelobster";
  const sessionScope = ctx?.config?.session?.scope ?? "per-sender";
  const mainKey = asText(ctx?.config?.session?.mainKey) || "main";
  const sessionCtx = {
    SessionKey: asText(ctx?.SessionKey || ctx?.sessionKey),
    From: asText(ctx?.From || ctx?.from || ctx?.accountId || accountId),
    Provider: asText(ctx?.Provider || ctx?.provider || ctx?.channelId || ctx?.channel),
    Surface: asText(ctx?.Surface || ctx?.surface || ctx?.channelId || ctx?.channel),
    MessageThreadId: asText(ctx?.MessageThreadId || ctx?.messageThreadId || ctx?.threadId),
  };

  const sessionKey = asText(ctx?.SessionKey || ctx?.sessionKey) || sessions.resolveSessionKey(sessionScope, sessionCtx, mainKey, agentId);
  const storePath = sessions.resolveStorePath(ctx?.config?.session?.store, { agentId });
  const sessionStore = sessions.loadSessionStore(storePath);
  const sessionEntry = sessions.resolveSessionStoreEntry({ store: sessionStore, sessionKey }).existing;
  const sessionId = asText(sessionEntry?.sessionId) || randomUUID();
  const sessionsDir = path.dirname(storePath);
  const threadId = asText(ctx?.MessageThreadId || ctx?.messageThreadId || ctx?.threadId);
  const fallbackSessionFile = threadId ? sessions.resolveSessionTranscriptPathInDir(sessionId, sessionsDir, threadId) : undefined;

  const resolved = await sessions.resolveAndPersistSessionFile({
    sessionId,
    sessionKey,
    sessionStore,
    storePath,
    sessionEntry,
    agentId,
    sessionsDir,
    fallbackSessionFile,
    activeSessionKey: sessionKey,
  });

  return resolved.sessionFile;
}

export default function register(api) {
  api.registerCommand({
    name: "ursula",
    description: "Speak the latest assistant reply with the configured TTS provider",
    acceptsArgs: true,
    requireAuth: true,
    nativeProgressMessages: {
      default: "🔊 speaking the latest reply…",
    },
    handler: async (ctx) => {
      const rawArgs = asText(ctx?.args);
      if (rawArgs === "help" || rawArgs === "--help") {
        return { text: usage() };
      }
      if (rawArgs) {
        return { text: usage() };
      }

      const sessionFile = await resolveCommandSessionFile({
        cfg: ctx?.config,
        ctx,
        accountId: ctx?.accountId,
      });

      if (!sessionFile) {
        return { text: "🎤 No active chat session is available for /ursula." };
      }

      try {
        const audio = await buildAudioReply({
          cfg: ctx.config,
          channel: ctx.channelId || ctx.channel,
          accountId: ctx.accountId,
          sessionFile,
        });

        if (audio.error) {
          return { text: `❌ ${audio.error}` };
        }

        return audio.reply;
      } catch (err) {
        api.logger?.error?.(`[ursula] /ursula failed: ${err?.stack || err?.message || String(err)}`);
        return { text: `❌ Ursula failed: ${err?.message || String(err)}` };
      }
    },
  });

  api.logger?.info?.("[ursula] Loaded: /ursula latest assistant reply -> TTS");
}
