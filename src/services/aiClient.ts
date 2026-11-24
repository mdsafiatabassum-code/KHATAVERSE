import { getLocalIsoDate } from '../engine/ledger';
import {
  ConversationContext,
  ExtractedIntent,
  PreferredLanguage,
} from '../types/khata';

export async function checkApiHealth(): Promise<{ ok: boolean; aiConfigured: boolean }> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    return { ok: false, aiConfigured: false };
  }
  return res.json();
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to encode audio recording.'));
        return;
      }
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Audio read error.'));
    reader.readAsDataURL(blob);
  });
}

export async function transcribeAudioBlob(
  blob: Blob,
  languageHint: PreferredLanguage
): Promise<string> {
  const audioBase64 = await blobToBase64(blob);
  const res = await fetch('/api/voice/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audioBase64,
      mimeType: blob.type || 'audio/webm',
      languageHint,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Transcription failed (${res.status}).`);
  }
  return (data.transcript as string) || '';
}

export async function understandUtterance(params: {
  utterance: string;
  languagePreference: PreferredLanguage;
  customerNames: string[];
  context: ConversationContext;
}): Promise<ExtractedIntent> {
  const payload = JSON.stringify({
    utterance: params.utterance,
    languagePreference: params.languagePreference,
    customerNames: params.customerNames,
    context: {
      lastCustomerName: params.context.lastCustomerName,
      lastAmount: params.context.lastAmount,
      lastType: params.context.lastType,
      lastIntent: params.context.lastIntent,
    },
    todayIso: getLocalIsoDate(0),
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch('/api/ai/understand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.intent) {
      return data.intent as ExtractedIntent;
    }
    if (res.status === 503 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1200));
      continue;
    }
    throw new Error(data.error || `Voice understanding failed (${res.status}).`);
  }

  throw new Error('Voice understanding failed. Please retry.');
}

let activeAudioElement: HTMLAudioElement | null = null;

export function stopSpokenResponse(): void {
  if (activeAudioElement) {
    activeAudioElement.pause();
    activeAudioElement = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export async function speakResponse(
  text: string,
  language: string,
  enabled: boolean
): Promise<void> {
  if (!enabled || !text.trim()) return;
  stopSpokenResponse();

  try {
    const res = await fetch('/api/ai/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.audioBase64) {
        const audio = new Audio(`data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`);
        activeAudioElement = audio;
        await audio.play();
        return;
      }
    }
  } catch {
    // Fall back to browser speech synthesis below if Gemini TTS request fails
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang =
      language === 'kn' || language === 'kanglish' || language === 'Kannada'
        ? 'kn-IN'
        : language === 'en' || language === 'English'
          ? 'en-IN'
          : 'hi-IN';
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  }
}
