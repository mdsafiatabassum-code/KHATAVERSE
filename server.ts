import "dotenv/config";
import http from "node:http";
import path from "node:path";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  ThinkingLevel,
  Type,
} from "@google/genai";

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === "production";

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: "v1beta",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function mapGeminiError(err: unknown): { status: number; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const errStatus =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : undefined;
  console.error("[KHATAVERSE Gemini Error]", errStatus ?? "", msg);

  if (msg.includes("GEMINI_API_KEY_MISSING")) {
    return {
      status: 503,
      message: "Gemini API key is not configured in Settings > Secrets.",
    };
  }
  if (
    errStatus === 403 ||
    msg.includes("403") ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("API_KEY_INVALID")
  ) {
    return {
      status: 403,
      message: "Gemini API key is invalid or lacks permission. Please verify it in Settings > Secrets.",
    };
  }
  if (errStatus === 429 || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      message: "Gemini API rate limit reached. Please retry in a few seconds.",
    };
  }
  if (errStatus === 400 || errStatus === 404) {
    return {
      status: errStatus,
      message: `Gemini API rejected request (${errStatus}): ${msg.slice(0, 180)}`,
    };
  }
  if (errStatus === 503 || msg.includes('"code":503') || msg.includes("UNAVAILABLE")) {
    return {
      status: 503,
      message: "Gemini voice service is temporarily experiencing high demand. Please retry in a moment.",
    };
  }
  return {
    status: 500,
    message: "Unable to reach Gemini voice intelligence service. Please retry.",
  };
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : undefined;
  return (
    status === 503 ||
    status === 500 ||
    msg.includes('"code":503') ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("high demand")
  );
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 450): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < retries && isTransientError(err)) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

const INTENT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      description:
        "One of: CREDIT, PAYMENT, CORRECTION, REVERSAL, QUERY, ADD_CUSTOMER, DAILY_REPORT, CLARIFICATION_NEEDED, UNKNOWN",
    },
    customerQuery: {
      type: Type.STRING,
      description: "Extracted customer name or alias if mentioned, else empty string or omit.",
    },
    phone: {
      type: Type.STRING,
      description: "Phone number if adding a customer, else omit.",
    },
    amount: {
      type: Type.NUMBER,
      description: "Positive numeric rupee amount if clearly stated, else omit. Never guess.",
    },
    targetDate: {
      type: Type.STRING,
      description:
        "TODAY, YESTERDAY (for kal/ninne), DAY_BEFORE (for parso/monne), or YYYY-MM-DD if explicit date given.",
    },
    correctionTarget: {
      type: Type.STRING,
      description: "One of: AMOUNT, TYPE, CUSTOMER, UNDO_LAST, or omit.",
    },
    newType: {
      type: Type.STRING,
      description: "If correction changes direction, CREDIT or PAYMENT, else omit.",
    },
    queryScope: {
      type: Type.STRING,
      description:
        "If intent is QUERY: CUSTOMER_BALANCE, TODAY_CREDIT, TODAY_PAYMENT, HIGHEST_OUTSTANDING, LAST_PAYMENT, WEEK_COLLECTION, TODAY_SUMMARY, else omit.",
    },
    detectedLanguage: {
      type: Type.STRING,
      description: "One of: hi, en, kn, hinglish, kanglish",
    },
    confidence: {
      type: Type.NUMBER,
      description: "Confidence score between 0 and 1.",
    },
    clarificationQuestion: {
      type: Type.STRING,
      description: "Short clarifying question if amount or intent is genuinely ambiguous.",
    },
    interpretedMeaning: {
      type: Type.STRING,
      description: "Concise 1-line human-readable interpretation of the utterance.",
    },
  },
  required: [
    "intent",
    "targetDate",
    "detectedLanguage",
    "confidence",
    "interpretedMeaning",
  ],
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "15mb" }));

  // Health endpoint (never exposes secrets)
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // 1. Speech-to-Text Fallback using gemini-3.5-transcribe
  app.post("/api/voice/transcribe", async (req, res) => {
    try {
      const { audioBase64, mimeType, languageHint } = req.body ?? {};
      if (typeof audioBase64 !== "string" || audioBase64.length < 32) {
        return res.status(400).json({ error: "Audio payload is empty or invalid." });
      }
      const allowedMime =
        typeof mimeType === "string" && mimeType.startsWith("audio/")
          ? mimeType.split(";")[0]
          : "audio/webm";

      const ai = getGeminiClient();
      const response = await withRetry(() =>
        ai.models.generateContent({
          model: "gemini-3.5-transcribe",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: allowedMime,
                  data: audioBase64,
                },
              },
              {
                text: `Transcribe this Indian kirana shopkeeper voice recording accurately. The speaker may speak Hindi, English, Kannada, Hinglish, or Kannada-English code-mixing. Preserve spoken rupee numbers as standard digits (e.g., 340, 200, 1500) and customer names cleanly in Latin/Roman script or Devanagari/Kannada as spoken. Preferred shop language context: ${typeof languageHint === "string" ? languageHint : "Hinglish"}. Return ONLY the transcribed speech text without commentary.`,
              },
            ],
          },
        })
      );

      const transcript = (response.text ?? "").trim();
      if (!transcript) {
        return res.status(422).json({ error: "No clear speech detected in the recording. Please try again." });
      }

      return res.json({ transcript });
    } catch (err) {
      const mapped = mapGeminiError(err);
      return res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 2. Structured Transaction & Query Extraction using gemini-4-hydrogen
  app.post("/api/ai/understand", async (req, res) => {
    try {
      const { utterance, languagePreference, customerNames, context, todayIso } = req.body ?? {};
      if (typeof utterance !== "string" || !utterance.trim()) {
        return res.status(400).json({ error: "Utterance text is required." });
      }

      const safeNames = Array.isArray(customerNames)
        ? customerNames.filter((n): n is string => typeof n === "string").slice(0, 100)
        : [];

      const ai = getGeminiClient();
      const systemInstruction = `You are KHATAVERSE's multilingual Indian kirana voice NLU parser.
Your ONLY job is to parse the shopkeeper's spoken utterance into a strict JSON intent object.
NEVER calculate balances, totals, or invent financial figures.

Language support: Hindi, English, Kannada, Hinglish, Kannada-English (Kanglish).
Common kirana vocabulary:
- CREDIT (increases balance): udhaar, baaki likho, khate mein daalo, credit, due, samaan udhaar, salaa, baki hakri.
- PAYMENT (decreases balance): diye, de diye, jama, payment, diya, UPI kiya, cash diya, bheja, wapas kiya, kottidare, jama maadi.
- CORRECTION (Khata Echo): nahi/nahin/illa + corrected number (e.g. "Nahi, 340 nahi 430", "Nahi 200 nahi 300 diye", "galat, 500 karo", "change to 450", "actually 300"). Note: when the speaker corrects an immediately preceding number like "Nahi 200 nahi 300 diye", set intent="CORRECTION", correctionTarget="AMOUNT", amount=300 (the NEW number, never the old rejected number).
- REVERSAL: undo, cancel last, pichli entry hatao, reverse karo, delete last.
- DAILY_REPORT: "Aaj ka hisaab batao", "closing report", "aaj ka summary", "today's report", "din ka hisaab".
- QUERY:
  - CUSTOMER_BALANCE: "Ramesh ka total?", "Sharma ji ka kitna baaki hai?", "Ramesh balance", "Ramesh avara baki eshtu?"
  - TODAY_CREDIT: "Aaj kitna udhaar gaya?", "Today's credit?"
  - TODAY_PAYMENT: "Aaj kitna payment aaya?", "Kal kitne payment aaye?" (set targetDate="YESTERDAY")
  - HIGHEST_OUTSTANDING: "Sabse zyada kiske paas baaki hai?", "Who owes the most?"
  - LAST_PAYMENT: "Priya ne last payment kab kiya?"
  - WEEK_COLLECTION: "Is hafte ka total collection kitna hai?", "Weekly collection?"
- ADD_CUSTOMER: "Naya customer Vikram add karo", "Add customer Meena phone 9876543210".

Relative dates:
- aaj / today / ivattu -> "TODAY"
- kal (past) / yesterday / ninne -> "YESTERDAY"
- parso (past) / day before yesterday / monne -> "DAY_BEFORE"

Rules:
- Never guess an amount. If the speaker gave an ambiguous or missing amount for a CREDIT/PAYMENT/CORRECTION, set amount=null and intent="CLARIFICATION_NEEDED" with a concise clarificationQuestion.
- Never guess between two customers (if they said "Ramesh", put customerQuery="Ramesh" as spoken — the deterministic ledger handles disambiguation).
- Keep numbers strictly positive; if someone says a negative number, reject by setting intent="CLARIFICATION_NEEDED".`;

      const prompt = JSON.stringify({
        utterance: utterance.trim(),
        preferredLanguage: typeof languagePreference === "string" ? languagePreference : "Hinglish",
        todayIso: typeof todayIso === "string" ? todayIso : new Date().toISOString().slice(0, 10),
        knownCustomers: safeNames,
        recentConversationContext: context ?? null,
      });

      let response;
      try {
        response = await withRetry(
          () =>
            ai.models.generateContent({
              model: "gemini-4-hydrogen",
              contents: prompt,
              config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: INTENT_RESPONSE_SCHEMA,
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              },
            }),
          1,
          500
        );
      } catch (primaryErr) {
        if (!isTransientError(primaryErr)) {
          throw primaryErr;
        }
        try {
          response = await withRetry(
            () =>
              ai.models.generateContent({
                model: "gemini-3.1-flash-lite",
                contents: prompt,
                config: {
                  systemInstruction,
                  responseMimeType: "application/json",
                  responseSchema: INTENT_RESPONSE_SCHEMA,
                },
              }),
            1,
            500
          );
        } catch (fallbackErr) {
          const pMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
          const fMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
          console.error("[NLU Primary+Fallback Failed]", { pMsg, fMsg });
          throw fallbackErr;
        }
      }

      const rawText = (response.text ?? "")
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      const normalized = {
        ...parsed,
        customerQuery:
          typeof parsed.customerQuery === "string" && parsed.customerQuery.trim()
            ? parsed.customerQuery.trim()
            : null,
        phone:
          typeof parsed.phone === "string" && parsed.phone.trim()
            ? parsed.phone.trim()
            : null,
        amount:
          typeof parsed.amount === "number" && Number.isFinite(parsed.amount) && parsed.amount > 0
            ? parsed.amount
            : null,
        correctionTarget:
          typeof parsed.correctionTarget === "string" && parsed.correctionTarget.trim()
            ? parsed.correctionTarget.trim()
            : null,
        newType:
          parsed.newType === "CREDIT" || parsed.newType === "PAYMENT"
            ? parsed.newType
            : null,
        queryScope:
          typeof parsed.queryScope === "string" && parsed.queryScope.trim()
            ? parsed.queryScope.trim()
            : null,
        clarificationQuestion:
          typeof parsed.clarificationQuestion === "string" && parsed.clarificationQuestion.trim()
            ? parsed.clarificationQuestion.trim()
            : null,
      };
      return res.json({ intent: normalized });
    } catch (err) {
      const mapped = mapGeminiError(err);
      return res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // 3. Multilingual Spoken Confirmation via gemini-3.8-flash-lite-tts
  app.post("/api/ai/tts", async (req, res) => {
    try {
      const { text, language } = req.body ?? {};
      if (typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Text is required for speech synthesis." });
      }
      const trimmed = text.trim().slice(0, 600);
      const ai = getGeminiClient();

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: "gemini-3.8-flash-lite-tts",
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: trimmed,
                },
              ],
            },
          ],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Kore" },
              },
            },
          },
        })
      );

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(502).json({ error: "No audio returned by TTS model." });
      }

      return res.json({
        audioBase64: base64Audio,
        mimeType: "audio/wav",
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      return res.status(mapped.status).json({ error: mapped.message });
    }
  });

  // Vite dev middleware or static production serving
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const server = http.createServer(app);

  // WebSocket bridge for real-time streaming speech transcription (gemini-3.5-transcribe-live)
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const urlPath = (request.url ?? "").split("?")[0];
    if (urlPath === "/api/live-transcribe") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      // Allow Vite HMR upgrade or destroy unknown sockets cleanly
      if (!urlPath.startsWith("/vite")) {
        socket.destroy();
      }
    }
  });

  wss.on("connection", async (clientWs: WebSocket) => {
    let liveSession: Awaited<ReturnType<GoogleGenAI["live"]["connect"]>> | null = null;
    try {
      const ai = getGeminiClient();
      liveSession = await ai.live.connect({
        model: "gemini-3.5-transcribe-live",
        config: {
          responseModalities: [Modality.TEXT],
          inputAudioTranscription: {
            languageCodes: [],
          },
        },
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== WebSocket.OPEN) return;
            const content = message.serverContent as
              | {
                  interimInputTranscription?: { text?: string };
                  inputTranscription?: { text?: string };
                }
              | undefined;
            if (content?.interimInputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: "interim",
                  text: content.interimInputTranscription.text,
                })
              );
            }
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: "final",
                  text: content.inputTranscription.text,
                })
              );
            }
          },
          onerror: () => {
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: "error",
                  message: "Live transcription stream interrupted.",
                })
              );
            }
          },
        },
      });

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "ready" }));
      }

      clientWs.on("message", (raw) => {
        if (!liveSession) return;
        try {
          const payload = JSON.parse(raw.toString()) as { audio?: string; end?: boolean };
          if (payload.audio) {
            liveSession.sendRealtimeInput({
              audio: { data: payload.audio, mimeType: "audio/pcm;rate=16000" },
            });
          }
        } catch {
          // ignore malformed audio frames
        }
      });
    } catch (err) {
      const mapped = mapGeminiError(err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "error", message: mapped.message }));
        clientWs.close();
      }
    }

    clientWs.on("close", () => {
      try {
        liveSession?.close();
      } catch {
        // ignore close errors
      }
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`KHATAVERSE server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start KHATAVERSE server:", err);
  process.exit(1);
});
