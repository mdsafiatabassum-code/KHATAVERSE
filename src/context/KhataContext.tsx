import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createDemoDataset } from '../data/demoData';
import {
  executeLedgerIntent,
  formatINR,
  getEffectiveDirection,
  getLocalIsoDate,
  matchCustomers,
} from '../engine/ledger';
import {
  checkApiHealth,
  speakResponse,
  stopSpokenResponse,
  transcribeAudioBlob,
  understandUtterance,
} from '../services/aiClient';
import { CaptureSession, startVoiceCapture } from '../services/voiceCapture';
import {
  clearTemporaryTranscripts,
  DEFAULT_SETTINGS,
  eraseAllEncryptedData,
  loadKhataState,
  saveCustomersEncrypted,
  saveSettingsEncrypted,
  saveTransactionsEncrypted,
  saveTranscriptsEncrypted,
} from '../storage/encryptedDb';
import {
  ConversationContext,
  ConversationTurn,
  KhataCustomer,
  KhataTransaction,
  PreferredLanguage,
  ShopSettings,
  TranscriptLogEntry,
  VoicePipelineState,
} from '../types/khata';

const INITIAL_CONTEXT: ConversationContext = {
  lastTransactionId: null,
  lastCustomerId: null,
  lastCustomerName: null,
  lastAmount: null,
  lastType: null,
  lastIntent: null,
  pendingClarification: null,
  updatedAt: 0,
};

interface KhataContextValue {
  loaded: boolean;
  aiConfigured: boolean;
  settings: ShopSettings;
  customers: KhataCustomer[];
  transactions: KhataTransaction[];
  transcripts: TranscriptLogEntry[];
  conversationContext: ConversationContext;
  turns: ConversationTurn[];
  voiceState: VoicePipelineState;
  liveTranscript: string;
  volumeLevels: number[];
  errorMessage: string | null;
  lastSavedMessage: string | null;

  updateSettings: (patch: Partial<ShopSettings>) => Promise<void>;
  startListening: () => Promise<void>;
  stopListeningAndProcess: () => Promise<void>;
  cancelListening: () => void;
  processUtterance: (utterance: string) => Promise<void>;
  resolveDisambiguation: (customerId: string) => Promise<void>;
  confirmCreateNewCustomerFromPending: () => Promise<void>;
  dismissClarification: () => void;
  reverseTransaction: (txId: string) => Promise<void>;
  addCustomerManual: (data: {
    name: string;
    phone?: string;
    aliases?: string[];
    reminder_opt_in?: boolean;
  }) => Promise<KhataCustomer>;
  updateCustomer: (customer: KhataCustomer) => Promise<void>;
  resetDemoData: () => Promise<void>;
  resetConversationContext: () => void;
  purgeTranscripts: () => Promise<void>;
  eraseAllData: () => Promise<void>;
  replayAudio: (text: string, lang?: string) => Promise<void>;
  clearError: () => void;
}

const KhataContext = createContext<KhataContextValue | null>(null);

export const KhataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loaded, setLoaded] = useState(false);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [customers, setCustomers] = useState<KhataCustomer[]>([]);
  const [transactions, setTransactions] = useState<KhataTransaction[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptLogEntry[]>([]);
  const [conversationContext, setConversationContext] =
    useState<ConversationContext>(INITIAL_CONTEXT);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [voiceState, setVoiceState] = useState<VoicePipelineState>('READY');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [volumeLevels, setVolumeLevels] = useState<number[]>(Array(16).fill(0.14));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastSavedMessage, setLastSavedMessage] = useState<string | null>(null);

  const captureRef = useRef<CaptureSession | null>(null);
  const customersRef = useRef(customers);
  const transactionsRef = useRef(transactions);
  const settingsRef = useRef(settings);
  const contextRef = useRef(conversationContext);

  customersRef.current = customers;
  transactionsRef.current = transactions;
  settingsRef.current = settings;
  contextRef.current = conversationContext;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [stored, health] = await Promise.all([loadKhataState(), checkApiHealth()]);
        if (!mounted) return;
        setAiConfigured(health.aiConfigured);

        const nextSettings = stored.settings ?? DEFAULT_SETTINGS;
        setSettings(nextSettings);

        if (stored.customers && stored.transactions) {
          setCustomers(stored.customers);
          setTransactions(stored.transactions);
        } else if (nextSettings.demoMode) {
          const demo = createDemoDataset();
          setCustomers(demo.customers);
          setTransactions(demo.transactions);
          await Promise.all([
            saveCustomersEncrypted(demo.customers),
            saveTransactionsEncrypted(demo.transactions),
            saveSettingsEncrypted(nextSettings),
          ]);
        } else {
          setCustomers([]);
          setTransactions([]);
        }
        setTranscripts(stored.transcripts);
      } catch {
        const demo = createDemoDataset();
        setCustomers(demo.customers);
        setTransactions(demo.transactions);
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const persistLedger = useCallback(
    async (nextCustomers: KhataCustomer[], nextTransactions: KhataTransaction[]) => {
      setCustomers(nextCustomers);
      setTransactions(nextTransactions);
      await Promise.all([
        saveCustomersEncrypted(nextCustomers),
        saveTransactionsEncrypted(nextTransactions),
      ]);
    },
    []
  );

  const appendTranscriptLog = useCallback(
    async (entry: Omit<TranscriptLogEntry, 'id' | 'createdAt' | 'expiresAt'>) => {
      const now = Date.now();
      const logItem: TranscriptLogEntry = {
        ...entry,
        id: `tr_${crypto.randomUUID().slice(0, 8)}`,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 24 * 60 * 60 * 1000).toISOString(),
      };
      setTranscripts((prev) => {
        const next = [logItem, ...prev].slice(0, 40);
        void saveTranscriptsEncrypted(next);
        return next;
      });
    },
    []
  );

  const updateSettings = useCallback(async (patch: Partial<ShopSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveSettingsEncrypted(next);
      return next;
    });
  }, []);

  const finalizeResult = useCallback(
    async (
      utterance: string,
      result: ReturnType<typeof executeLedgerIntent>,
      detectedLanguage: ConversationTurn['detectedLanguage'],
      confidence: number
    ) => {
      if (
        result.customers !== customersRef.current ||
        result.transactions !== transactionsRef.current
      ) {
        await persistLedger(result.customers, result.transactions);
      }
      setConversationContext(result.context);

      const turn: ConversationTurn = {
        id: `turn_${crypto.randomUUID().slice(0, 8)}`,
        utterance,
        interpretedMeaning: result.interpretedMeaning,
        aiResponse: result.aiResponse,
        detectedLanguage,
        confidence,
        transaction: result.transaction,
        correctedFromAmount: result.correctedFromAmount ?? null,
        pendingClarification: result.pendingClarification ?? null,
        queryResult: result.queryResult,
        timestamp: new Date().toISOString(),
      };

      setTurns((prev) => [turn, ...prev].slice(0, 30));

      void appendTranscriptLog({
        utterance,
        interpretedMeaning: result.interpretedMeaning,
        response: result.aiResponse,
        language: detectedLanguage,
      });

      if (result.pendingClarification) {
        setVoiceState('CONFIRMING');
      } else if (result.transaction) {
        setVoiceState('TRANSACTION_SAVED');
        setLastSavedMessage(result.interpretedMeaning);
        setTimeout(() => {
          setVoiceState((curr) => (curr === 'TRANSACTION_SAVED' ? 'READY' : curr));
        }, 2600);
      } else {
        setVoiceState('READY');
      }

      if (settingsRef.current.voiceOutputEnabled) {
        void speakResponse(result.aiResponse, detectedLanguage, true);
      }
    },
    [appendTranscriptLog, persistLedger]
  );

  const processUtterance = useCallback(
    async (rawUtterance: string) => {
      const utterance = rawUtterance.trim();
      if (!utterance) return;

      setErrorMessage(null);
      setLiveTranscript(utterance);
      setVoiceState('UNDERSTANDING');

      try {
        const pending = contextRef.current.pendingClarification;
        const currCustomers = customersRef.current;
        const currTransactions = transactionsRef.current;

        // Check if user is directly answering a pending disambiguation via voice/text
        if (pending?.type === 'DISAMBIGUATE_CUSTOMER' && pending.candidates) {
          const matchedCandidates = matchCustomers(utterance, pending.candidates);
          if (matchedCandidates.length === 1) {
            const result = executeLedgerIntent({
              utterance: pending.originalUtterance,
              intent: pending.intent,
              customers: currCustomers,
              transactions: currTransactions,
              context: contextRef.current,
              resolvedCustomerId: matchedCandidates[0].id,
            });
            await finalizeResult(
              `${pending.originalUtterance} -> ${matchedCandidates[0].name}`,
              result,
              pending.intent.detectedLanguage,
              0.99
            );
            return;
          }
        }

        // Check if user is confirming creation of a new customer
        if (pending?.type === 'CONFIRM_NEW_CUSTOMER' && pending.suggestedName) {
          const lower = utterance.toLowerCase();
          if (/^(yes|haan|ha|ji|ok|okay|add|hona|houdu|karo|theek)/i.test(lower)) {
            const newCustomer: KhataCustomer = {
              id: `cust_${crypto.randomUUID().slice(0, 8)}`,
              name: pending.suggestedName,
              aliases: [pending.suggestedName.split(' ')[0]],
              created_at: new Date().toISOString(),
              reminder_opt_in: false,
            };
            const nextCustomers = [newCustomer, ...currCustomers];
            const result = executeLedgerIntent({
              utterance: pending.originalUtterance,
              intent: pending.intent,
              customers: nextCustomers,
              transactions: currTransactions,
              context: contextRef.current,
              resolvedCustomerId: newCustomer.id,
            });
            await finalizeResult(
              pending.originalUtterance,
              result,
              pending.intent.detectedLanguage,
              0.98
            );
            return;
          }
        }

        const intent = await understandUtterance({
          utterance,
          languagePreference: settingsRef.current.preferredLanguage,
          customerNames: currCustomers.map((c) => c.name),
          context: contextRef.current,
        });

        const result = executeLedgerIntent({
          utterance,
          intent,
          customers: currCustomers,
          transactions: currTransactions,
          context: contextRef.current,
        });

        await finalizeResult(
          utterance,
          result,
          intent.detectedLanguage,
          intent.confidence
        );
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Unable to process voice request. Please check your connection and try again.';
        setErrorMessage(msg);
        setVoiceState('ERROR');
        setTurns((prev) => [
          {
            id: `turn_${crypto.randomUUID().slice(0, 8)}`,
            utterance,
            interpretedMeaning: 'Processing failed',
            aiResponse: msg,
            detectedLanguage: 'en',
            confidence: 0,
            error: msg,
            timestamp: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    },
    [finalizeResult]
  );

  const startListening = useCallback(async () => {
    stopSpokenResponse();
    setErrorMessage(null);
    setLiveTranscript('');

    if (captureRef.current) {
      captureRef.current.cancel();
      captureRef.current = null;
    }

    try {
      setVoiceState('LISTENING');
      const session = await startVoiceCapture(
        settingsRef.current.streamingTranscriptionPreferred,
        {
          onVolumeLevels: (levels) => setVolumeLevels(levels),
          onInterimTranscript: (text) => setLiveTranscript(text),
          onError: (msg) => {
            setErrorMessage(msg);
            setVoiceState('ERROR');
          },
        }
      );
      captureRef.current = session;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Microphone permission or audio capture failed.';
      setErrorMessage(msg);
      setVoiceState('ERROR');
    }
  }, []);

  const stopListeningAndProcess = useCallback(async () => {
    const session = captureRef.current;
    if (!session) {
      setVoiceState('READY');
      return;
    }
    captureRef.current = null;
    setVolumeLevels(Array(16).fill(0.14));
    setVoiceState('UNDERSTANDING');

    try {
      const { audioBlob, streamedTranscript } = await session.stop();
      let transcript = streamedTranscript.trim();

      if (!transcript) {
        if (!audioBlob || audioBlob.size < 200) {
          throw new Error('No audio recorded. Hold or tap the mic and speak clearly.');
        }
        transcript = await transcribeAudioBlob(
          audioBlob,
          settingsRef.current.preferredLanguage
        );
      }

      if (!transcript.trim()) {
        throw new Error('Could not recognize speech. Please try speaking again.');
      }

      setLiveTranscript(transcript);
      await processUtterance(transcript);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Speech transcription failed. Please retry.';
      setErrorMessage(msg);
      setVoiceState('ERROR');
    }
  }, [processUtterance]);

  const cancelListening = useCallback(() => {
    if (captureRef.current) {
      captureRef.current.cancel();
      captureRef.current = null;
    }
    setVolumeLevels(Array(16).fill(0.14));
    setLiveTranscript('');
    setVoiceState('READY');
  }, []);

  const resolveDisambiguation = useCallback(
    async (customerId: string) => {
      const pending = contextRef.current.pendingClarification;
      if (!pending) return;

      const selected = customersRef.current.find((c) => c.id === customerId);
      if (!selected) return;

      const result = executeLedgerIntent({
        utterance: pending.originalUtterance,
        intent: pending.intent,
        customers: customersRef.current,
        transactions: transactionsRef.current,
        context: contextRef.current,
        resolvedCustomerId: selected.id,
      });

      await finalizeResult(
        `${pending.originalUtterance} (${selected.name})`,
        result,
        pending.intent.detectedLanguage,
        1
      );
    },
    [finalizeResult]
  );

  const confirmCreateNewCustomerFromPending = useCallback(async () => {
    const pending = contextRef.current.pendingClarification;
    if (!pending?.suggestedName) return;

    const newCustomer: KhataCustomer = {
      id: `cust_${crypto.randomUUID().slice(0, 8)}`,
      name: pending.suggestedName,
      aliases: [pending.suggestedName.split(' ')[0]],
      created_at: new Date().toISOString(),
      reminder_opt_in: false,
    };

    const nextCustomers = [newCustomer, ...customersRef.current];
    const result = executeLedgerIntent({
      utterance: pending.originalUtterance,
      intent: pending.intent,
      customers: nextCustomers,
      transactions: transactionsRef.current,
      context: contextRef.current,
      resolvedCustomerId: newCustomer.id,
    });

    await finalizeResult(
      pending.originalUtterance,
      result,
      pending.intent.detectedLanguage,
      1
    );
  }, [finalizeResult]);

  const dismissClarification = useCallback(() => {
    setConversationContext((prev) => ({ ...prev, pendingClarification: null }));
    setVoiceState('READY');
  }, []);

  const reverseTransaction = useCallback(
    async (txId: string) => {
      const target = transactionsRef.current.find(
        (t) => t.id === txId && t.status === 'CONFIRMED'
      );
      if (!target) return;

      const updated = transactionsRef.current.map((t) =>
        t.id === txId ? { ...t, status: 'REVERSED' as const } : t
      );
      const reversalEntry: KhataTransaction = {
        id: `tx_${crypto.randomUUID().slice(0, 8)}`,
        customer_id: target.customer_id,
        customer_name: target.customer_name,
        type: 'REVERSAL',
        direction: getEffectiveDirection(target),
        amount: target.amount,
        date: getLocalIsoDate(0),
        created_at: new Date().toISOString(),
        original_utterance: `Manual reversal of ${formatINR(target.amount)}`,
        status: 'CONFIRMED',
        corrected_from: target.id,
        note: `Reversed ${getEffectiveDirection(target)} entry`,
      };
      await persistLedger(customersRef.current, [reversalEntry, ...updated]);
      setLastSavedMessage(`Reversed ${target.customer_name} · ${formatINR(target.amount)}`);
    },
    [persistLedger]
  );

  const addCustomerManual = useCallback(
    async (data: {
      name: string;
      phone?: string;
      aliases?: string[];
      reminder_opt_in?: boolean;
    }) => {
      const cleanName = data.name.trim();
      const firstWord = cleanName.split(' ')[0];
      const aliases = Array.from(
        new Set([firstWord, ...(data.aliases ?? [])].map((s) => s.trim()).filter(Boolean))
      );
      const newCust: KhataCustomer = {
        id: `cust_${crypto.randomUUID().slice(0, 8)}`,
        name: cleanName,
        phone: data.phone?.trim() || undefined,
        aliases,
        created_at: new Date().toISOString(),
        reminder_opt_in: Boolean(data.reminder_opt_in),
      };
      await persistLedger([newCust, ...customersRef.current], transactionsRef.current);
      return newCust;
    },
    [persistLedger]
  );

  const updateCustomer = useCallback(
    async (customer: KhataCustomer) => {
      const next = customersRef.current.map((c) => (c.id === customer.id ? customer : c));
      await persistLedger(next, transactionsRef.current);
    },
    [persistLedger]
  );

  const resetDemoData = useCallback(async () => {
    const demo = createDemoDataset();
    await persistLedger(demo.customers, demo.transactions);
    await updateSettings({ demoMode: true });
    setConversationContext(INITIAL_CONTEXT);
    setTurns([]);
    setLiveTranscript('');
    setErrorMessage(null);
    setVoiceState('READY');
  }, [persistLedger, updateSettings]);

  const resetConversationContext = useCallback(() => {
    setConversationContext(INITIAL_CONTEXT);
    setVoiceState('READY');
  }, []);

  const purgeTranscripts = useCallback(async () => {
    await clearTemporaryTranscripts();
    setTranscripts([]);
  }, []);

  const eraseAllData = useCallback(async () => {
    await eraseAllEncryptedData();
    const freshSettings: ShopSettings = {
      ...DEFAULT_SETTINGS,
      demoMode: false,
      onboardingComplete: true,
    };
    await saveSettingsEncrypted(freshSettings);
    setSettings(freshSettings);
    setCustomers([]);
    setTransactions([]);
    setTranscripts([]);
    setTurns([]);
    setConversationContext(INITIAL_CONTEXT);
    setVoiceState('READY');
  }, []);

  const replayAudio = useCallback(async (text: string, lang?: string) => {
    await speakResponse(text, lang ?? settingsRef.current.preferredLanguage, true);
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
    setVoiceState('READY');
  }, []);

  return (
    <KhataContext.Provider
      value={{
        loaded,
        aiConfigured,
        settings,
        customers,
        transactions,
        transcripts,
        conversationContext,
        turns,
        voiceState,
        liveTranscript,
        volumeLevels,
        errorMessage,
        lastSavedMessage,
        updateSettings,
        startListening,
        stopListeningAndProcess,
        cancelListening,
        processUtterance,
        resolveDisambiguation,
        confirmCreateNewCustomerFromPending,
        dismissClarification,
        reverseTransaction,
        addCustomerManual,
        updateCustomer,
        resetDemoData,
        resetConversationContext,
        purgeTranscripts,
        eraseAllData,
        replayAudio,
        clearError,
      }}
    >
      {children}
    </KhataContext.Provider>
  );
};

export function useKhata(): KhataContextValue {
  const ctx = useContext(KhataContext);
  if (!ctx) throw new Error('useKhata must be used inside KhataProvider');
  return ctx;
}
