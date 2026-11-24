export interface LiveCaptureCallbacks {
  onVolumeLevels: (levels: number[]) => void;
  onInterimTranscript: (text: string) => void;
  onError: (message: string) => void;
}

export interface CaptureSession {
  stop: () => Promise<{ audioBlob: Blob | null; streamedTranscript: string }>;
  cancel: () => void;
}

function float32ToPcm16Base64(float32: Float32Array): string {
  const buffer = new ArrayBuffer(float32.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function checkMicrophonePermission(): Promise<
  'granted' | 'denied' | 'prompt' | 'unsupported'
> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return 'unsupported';
  }
  try {
    if ('permissions' in navigator && navigator.permissions.query) {
      const status = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      return status.state;
    }
  } catch {
    // Some browsers disallow querying microphone permission directly
  }
  return 'prompt';
}

export async function startVoiceCapture(
  useStreaming: boolean,
  callbacks: LiveCaptureCallbacks
): Promise<CaptureSession> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Microphone access is not supported in this browser.');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('notallowed')) {
      throw new Error(
        'Microphone permission was denied. Please allow microphone access in your browser settings.'
      );
    }
    throw new Error('Unable to access microphone. Please check your audio device.');
  }

  // Real-time audio analyser for waveform visualization
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const analyserCtx = new AudioCtx();
  const sourceNode = analyserCtx.createMediaStreamSource(stream);
  const analyser = analyserCtx.createAnalyser();
  analyser.fftSize = 64;
  sourceNode.connect(analyser);

  const freqData = new Uint8Array(analyser.frequencyBinCount);
  let rafId = 0;
  const updateWaveform = () => {
    analyser.getByteFrequencyData(freqData);
    const bars: number[] = [];
    const barCount = 16;
    const step = Math.max(1, Math.floor(freqData.length / barCount));
    for (let i = 0; i < barCount; i++) {
      const val = freqData[i * step] ?? 0;
      bars.push(Math.max(0.12, Math.min(1, val / 210)));
    }
    callbacks.onVolumeLevels(bars);
    rafId = requestAnimationFrame(updateWaveform);
  };
  rafId = requestAnimationFrame(updateWaveform);

  // MediaRecorder for reliable push-to-talk audio fallback (never stored permanently)
  const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';
  const recorder = preferredMime
    ? new MediaRecorder(stream, { mimeType: preferredMime })
    : new MediaRecorder(stream);

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(250);

  // Optional live WebSocket streaming to gemini-3.5-transcribe-live
  let ws: WebSocket | null = null;
  let streamCtx: AudioContext | null = null;
  let processorNode: ScriptProcessorNode | null = null;
  let streamSource: MediaStreamAudioSourceNode | null = null;
  let finalStreamedParts: string[] = [];
  let interimStreamed = '';

  if (useStreaming) {
    try {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/api/live-transcribe`);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type: string;
            text?: string;
            message?: string;
          };
          if (msg.type === 'ready') {
            streamCtx = new AudioCtx({ sampleRate: 16000 });
            streamSource = streamCtx.createMediaStreamSource(stream);
            processorNode = streamCtx.createScriptProcessor(4096, 1, 1);
            streamSource.connect(processorNode);
            processorNode.connect(streamCtx.destination);
            processorNode.onaudioprocess = (ev) => {
              if (ws && ws.readyState === WebSocket.OPEN) {
                const b64 = float32ToPcm16Base64(ev.inputBuffer.getChannelData(0));
                ws.send(JSON.stringify({ audio: b64 }));
              }
            };
          } else if (msg.type === 'interim' && msg.text) {
            interimStreamed = msg.text;
            const combined = [...finalStreamedParts, interimStreamed].join(' ').trim();
            callbacks.onInterimTranscript(combined);
          } else if (msg.type === 'final' && msg.text) {
            finalStreamedParts.push(msg.text.trim());
            interimStreamed = '';
            callbacks.onInterimTranscript(finalStreamedParts.join(' ').trim());
          }
        } catch {
          // ignore parse error
        }
      };

      ws.onerror = () => {
        // Fallback MediaRecorder remains active automatically
      };
    } catch {
      // Fallback MediaRecorder remains active automatically
    }
  }

  const cleanupResources = () => {
    cancelAnimationFrame(rafId);
    try {
      processorNode?.disconnect();
      streamSource?.disconnect();
      if (streamCtx && streamCtx.state !== 'closed') {
        void streamCtx.close();
      }
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    } catch {
      // ignore cleanup errors
    }
    try {
      sourceNode.disconnect();
      if (analyserCtx.state !== 'closed') {
        void analyserCtx.close();
      }
    } catch {
      // ignore cleanup errors
    }
    stream.getTracks().forEach((track) => track.stop());
  };

  return {
    stop: () =>
      new Promise((resolve) => {
        const finalize = () => {
          const blob =
            chunks.length > 0
              ? new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
              : null;
          const streamedTranscript = [...finalStreamedParts, interimStreamed]
            .join(' ')
            .trim();
          cleanupResources();
          resolve({ audioBlob: blob, streamedTranscript });
        };

        if (recorder.state !== 'inactive') {
          recorder.onstop = finalize;
          recorder.stop();
        } else {
          finalize();
        }
      }),
    cancel: () => {
      if (recorder.state !== 'inactive') {
        recorder.stop();
      }
      cleanupResources();
    },
  };
}
