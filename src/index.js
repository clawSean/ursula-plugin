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

function parseBackArg(rawArgs) {
  const text = asText(rawArgs);
  if (!text) return { back: 0 };
  if (!/^\d+$/.test(text)) return { error: "🐙 Ursula does not recognise that offering.\nUsage: /ursula [back], e.g. /ursula or /ursula 1" };
  const back = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(back) || back < 0 || back > 50) return { error: "🐙 Even Ursula cannot reach that far back into the grotto. Choose a number from 0 to 50." };
  return { back };
}

function usage() {
  return [
    "🐙 Queen Ursula — Voice Keeper of the Deep",
    "",
    "Your assistant has a voice. The sea witch holds them all.",
    "Call upon her to release one utterance from the deep.",
    "",
    "Usage: /ursula [back]",
    "",
    "  /ursula      release the latest captured reply",
    "  /ursula 1    release the reply before that",
    "  /ursula 2    go further back into her grotto",
    "",
    "back must be a number from 0 to 50.",
  ].join("\n");
}

export function sanitizeMarkdownForSpeech(text) {
  return asText(text)
    // Prefer readable link labels over raw markdown punctuation/URLs.
    .replace(/!?\[([^\]\n]+)]\(([^)\n]+)\)/g, "$1")
    // Drop fenced-code language markers while preserving the code text.
    .replace(/```\s*([\w-]+)?/g, "")
    // Strip common inline markdown markers that TTS providers may speak aloud.
    .replace(/(\*\*|__|~~|`)/g, "")
    // Remove single emphasis markers only when they wrap non-whitespace text.
    .replace(/(^|[\s([{])([*_])([^\n*_][^\n]*?\S)\2(?=$|[\s.,;:!?)}\]])/g, "$1$3")
    // Convert markdown bullets/headings/blockquotes into natural spacing.
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function buildAudioReply({ cfg, channel, accountId, sessionFile, back = 0 }) {
  const tts = await importOpenClawSdk("tts-runtime");

  const latestText = await readLatestAssistantTextFromSessionTranscript(sessionFile, { back });
  if (!latestText) {
    return {
      error: back > 0
        ? `Ursula reaches into the grotto, but no voice lingers ${back} back in this chat.`
        : "Ursula reaches into the grotto — but no voice has been captured here yet.",
    };
  }

  const spokenText = sanitizeMarkdownForSpeech(latestText);
  if (!spokenText) {
    return { error: "The latest assistant reply had no speakable text after markdown cleanup." };
  }

  const resolvedConfig = tts.resolveTtsConfig(cfg, {
    channelId: channel,
    accountId,
  });
  const prefsPath = tts.resolveTtsPrefsPath(resolvedConfig);

  const result = await tts.textToSpeech({
    text: spokenText,
    cfg,
    channel,
    accountId,
    prefsPath,
  });

  if (!result.success || !result.audioPath) {
    return { error: result.error || "Ursula stirs — but releases nothing. The TTS provider returned no audio." };
  }

  return {
    reply: {
      mediaUrl: result.audioPath,
      audioAsVoice: result.voiceCompatible === true,
      trustedLocalMedia: true,
      spokenText,
    },
  };
}

function isSilentishText(text) {
  const value = asText(text);
  return !value || value === "NO_REPLY" || value === "HEARTBEAT_OK" || /^❌\s+(No readable assistant reply|Ursula\b)/i.test(value);
}

function extractMessageToolText(part) {
  if (!part || part.type !== "toolCall" || part.name !== "message") return "";
  const args = part.arguments || {};
  if (asText(args.action) && asText(args.action) !== "send") return "";
  if (args.silent === true || args.visible === false || args.speakable === false) return "";
  const delivery = args.delivery || {};
  if (delivery.silent === true || delivery.speakable === false) return "";
  const outgoing = asText(args.message || args.caption || args.text);
  return isSilentishText(outgoing) ? "" : outgoing;
}

export function extractAssistantSpeakableText(message) {
  const content = Array.isArray(message?.content) ? message.content : [];

  const directText = content
    .filter((part) => part && part.type === "text" && asText(part.text))
    .map((part) => asText(part.text))
    .filter((text) => !isSilentishText(text))
    .join("\n")
    .trim();
  if (directText) return directText;

  // In Telegram groups, visible replies are often sent via the message tool.
  // Those turns have no assistant text part, but the outgoing chat text is in
  // the tool call arguments. Use that as the speakable assistant reply, while
  // skipping explicit silent/no-reply sends.
  for (let i = content.length - 1; i >= 0; i -= 1) {
    const outgoing = extractMessageToolText(content[i]);
    if (outgoing) return outgoing;
  }

  return "";
}

export async function readLatestAssistantTextFromSessionTranscript(sessionFile, { back = 0 } = {}) {
  if (!asText(sessionFile)) return "";

  let raw;
  try {
    raw = await readFile(sessionFile, "utf8");
  } catch {
    return "";
  }

  const lines = raw.split(/\r?\n/).filter(Boolean);
  let remainingBack = Number.isSafeInteger(back) && back > 0 ? back : 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }

    const message = entry?.message;
    if (entry?.type !== "message" || message?.role !== "assistant") continue;

    const text = extractAssistantSpeakableText(message);
    if (!text) continue;
    if (remainingBack > 0) {
      remainingBack -= 1;
      continue;
    }
    return text;
  }

  return "";
}

function normalizeTelegramChatId(value) {
  const raw = asText(value).replace(/^telegram:/, "");
  return /^-?\d+$/.test(raw) ? raw : "";
}

export function resolveGroupSessionKeyFromContext(ctx, agentId) {
  const chatType = asText(ctx?.chatType || ctx?.ChatType || ctx?.origin?.chatType).toLowerCase();
  const groupId = normalizeTelegramChatId(
    ctx?.groupId ||
      ctx?.GroupId ||
      ctx?.chatId ||
      ctx?.ChatId ||
      ctx?.to ||
      ctx?.To ||
      ctx?.origin?.to ||
      ctx?.origin?.from,
  );
  if (!groupId || (chatType && chatType !== "group" && !groupId.startsWith("-"))) return "";
  return `agent:${agentId}:telegram:group:${groupId}`;
}

async function resolveCommandSessionFile({ cfg, ctx, accountId }) {
  const agentId = asText(accountId || ctx?.agentId || ctx?.config?.agentId) || "mainelobster";
  const slashSessionKey = asText(ctx?.SessionKey || ctx?.sessionKey);
  const groupSessionKey = resolveGroupSessionKeyFromContext(ctx, agentId);
  const existingSessionFile = asText(ctx?.sessionFile);
  if (existingSessionFile && !slashSessionKey.includes(":slash:")) return existingSessionFile;

  const hasIdentity = Boolean(
    asText(groupSessionKey || slashSessionKey || ctx?.channelId || ctx?.channel || ctx?.chatId || ctx?.threadId || ctx?.messageThreadId || ctx?.MessageThreadId),
  );
  if (!hasIdentity) return "";

  const sessions = await importOpenClawSdk("session-store-runtime");
  const sessionScope = ctx?.config?.session?.scope ?? "per-sender";
  const mainKey = asText(ctx?.config?.session?.mainKey) || "main";
  const sessionCtx = {
    SessionKey: groupSessionKey || slashSessionKey,
    From: asText(ctx?.From || ctx?.from || ctx?.accountId || accountId),
    Provider: asText(ctx?.Provider || ctx?.provider || ctx?.channelId || ctx?.channel),
    Surface: asText(ctx?.Surface || ctx?.surface || ctx?.channelId || ctx?.channel),
    MessageThreadId: asText(ctx?.MessageThreadId || ctx?.messageThreadId || ctx?.threadId),
  };

  const sessionKey = groupSessionKey || slashSessionKey || sessions.resolveSessionKey(sessionScope, sessionCtx, mainKey, agentId);
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
    description: "Petition Queen Ursula to release the latest captured voice from the deep",
    acceptsArgs: true,
    requireAuth: true,
    nativeProgressMessages: {
      default: "🐙 Petitioning Queen Ursula to release the voice…",
    },
    handler: async (ctx) => {
      const rawArgs = asText(ctx?.args);
      if (rawArgs === "help" || rawArgs === "--help") {
        return { text: usage() };
      }
      const parsedArgs = parseBackArg(rawArgs);
      if (parsedArgs.error) {
        return { text: parsedArgs.error };
      }

      const sessionFile = await resolveCommandSessionFile({
        cfg: ctx?.config,
        ctx,
        accountId: ctx?.accountId,
      });

      if (!sessionFile) {
        return { text: "🐙 Ursula's grotto echoes with silence — No active chat session is open to draw from." };
      }

      try {
        const audio = await buildAudioReply({
          cfg: ctx.config,
          channel: ctx.channelId || ctx.channel,
          accountId: ctx.accountId,
          sessionFile,
          back: parsedArgs.back,
        });

        if (audio.error) {
          return { text: `❌ ${audio.error}` };
        }

        return audio.reply;
      } catch (err) {
        api.logger?.error?.(`[ursula] /ursula failed: ${err?.stack || err?.message || String(err)}`);
        return { text: `❌ Ursula tightens her grip: ${err?.message || String(err)}` };
      }
    },
  });

  api.logger?.info?.("[ursula] Loaded — Queen Ursula stands ready. /ursula will petition her to release the voice.");
}
