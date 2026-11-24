import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Keyboard,
  Play,
  RotateCcw,
  Send,
  UserPlus,
  Volume2,
  X,
} from 'lucide-react';
import { useKhata } from '../context/KhataContext';
import { HACKATHON_DEMO_STEPS } from '../data/demoData';
import { formatINR } from '../engine/ledger';
import { PreferredLanguage } from '../types/khata';
import { VoiceCoreOrb } from './VoiceCoreOrb';

const LANG_OPTIONS: PreferredLanguage[] = ['Hinglish', 'Hindi', 'Kannada', 'English'];

export const CounterScreen: React.FC = () => {
  const {
    settings,
    updateSettings,
    voiceState,
    liveTranscript,
    volumeLevels,
    turns,
    conversationContext,
    errorMessage,
    lastSavedMessage,
    startListening,
    stopListeningAndProcess,
    cancelListening,
    processUtterance,
    resolveDisambiguation,
    confirmCreateNewCustomerFromPending,
    dismissClarification,
    reverseTransaction,
    replayAudio,
    resetConversationContext,
    clearError,
  } = useKhata();

  const [showKeyboard, setShowKeyboard] = useState(false);
  const [typedUtterance, setTypedUtterance] = useState('');
  const [showDemoGuide, setShowDemoGuide] = useState(settings.demoMode);

  const pending = conversationContext.pendingClarification;
  const isBusy = voiceState === 'UNDERSTANDING';

  const handleMicTap = () => {
    if (voiceState === 'LISTENING') {
      void stopListeningAndProcess();
    } else {
      void startListening();
    }
  };

  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = typedUtterance.trim();
    if (!val || isBusy) return;
    setTypedUtterance('');
    await processUtterance(val);
  };

  const handleRunDemoStep = async (utterance: string, stepNumber: number) => {
    if (isBusy) return;
    if (stepNumber === 5) {
      // Ensure step 5 demonstrates fresh disambiguation between Ramesh Kumar & Ramesh Sharma
      resetConversationContext();
    }
    await processUtterance(utterance);
  };

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-5 pb-6">
      {/* Compact Counter Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#10182A] border border-white/[0.08] px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-[#94A3B8]">Counter Language:</span>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#080D1B] border border-white/[0.06]">
            {LANG_OPTIONS.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => void updateSettings({ preferredLanguage: lang })}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  settings.preferredLanguage === lang
                    ? 'bg-[#35D6F2] text-[#080D1B]'
                    : 'text-[#94A3B8] hover:text-[#F4F7FC]'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              void updateSettings({
                streamingTranscriptionPreferred:
                  !settings.streamingTranscriptionPreferred,
              })
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              settings.streamingTranscriptionPreferred
                ? 'bg-[#8B72FF]/15 border-[#8B72FF]/40 text-[#c4b5fd]'
                : 'bg-[#080D1B] border-white/[0.08] text-[#94A3B8]'
            }`}
          >
            {settings.streamingTranscriptionPreferred
              ? 'Live Stream + Fallback'
              : 'Push-to-Talk Mode'}
          </button>

          <button
            type="button"
            onClick={() => setShowDemoGuide((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showDemoGuide
                ? 'bg-[#FFBD59]/15 border-[#FFBD59]/40 text-[#FFBD59]'
                : 'bg-[#080D1B] border-white/[0.08] text-[#94A3B8] hover:text-[#F4F7FC]'
            }`}
          >
            <FlaskConical size={14} />
            Demo Scenario
          </button>
        </div>
      </div>

      {/* Guided Hackathon Demo Scenario Panel */}
      <AnimatePresence>
        {showDemoGuide && (
          <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="rounded-2xl bg-[#10182A] border border-[#FFBD59]/30 p-4 sm:p-5"
          >
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-[#FFBD59]">
                  Hackathon Live Scenario — Real Ledger & Khata Echo Test
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  Speak any phrase into the mic below, or tap Run to send it through the
                  live Gemini + Deterministic Ledger pipeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDemoGuide(false)}
                aria-label="Close demo scenario guide"
                className="p-2 text-[#94A3B8] hover:text-[#F4F7FC] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {HACKATHON_DEMO_STEPS.map((item) => (
                <div
                  key={item.step}
                  className="rounded-xl bg-[#080D1B] border border-white/[0.08] p-3 flex flex-col justify-between gap-2.5"
                >
                  <div>
                    <p className="text-[11px] font-mono-num text-[#94A3B8]">
                      Step {item.step}
                    </p>
                    <p className="text-xs font-medium text-[#F4F7FC] mt-1">
                      &ldquo;{item.utterance}&rdquo;
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mt-1 leading-snug">
                      {item.expected}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleRunDemoStep(item.utterance, item.step)}
                    className="inline-flex items-center justify-center gap-1.5 w-full py-1.5 px-2.5 rounded-lg bg-[#152038] hover:bg-[#1e2d4d] border border-[#35D6F2]/30 text-xs font-medium text-[#35D6F2] disabled:opacity-50 cursor-pointer"
                  >
                    <Play size={12} />
                    Run Step {item.step}
                  </button>
                </div>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Main One-Handed Voice Interaction Stage */}
      <div className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-5 sm:p-8 flex flex-col justify-between min-h-[460px]">
        {/* Top Feedback Stage: Error / Clarification / Live Speech / Conversation History */}
        <div className="space-y-4 mb-6">
          {/* Error Banner with Explicit Retry */}
          {errorMessage && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-400/35 p-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-rose-200">{errorMessage}</p>
                  <p className="text-xs text-rose-300/80 mt-0.5">
                    No ledger changes were committed. Tap the microphone to retry.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (liveTranscript.trim()) {
                    void processUtterance(liveTranscript);
                  } else {
                    clearError();
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-rose-500/20 text-xs font-semibold text-rose-100 hover:bg-rose-500/30 shrink-0 cursor-pointer"
              >
                {liveTranscript.trim() ? 'Retry Now' : 'Dismiss'}
              </button>
            </div>
          )}

          {/* Success Toast Banner */}
          {lastSavedMessage && voiceState === 'TRANSACTION_SAVED' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-[#35D39A]/12 border border-[#35D39A]/35 p-3.5 flex items-center gap-2.5"
            >
              <CheckCircle2 size={18} className="text-[#35D39A] shrink-0" />
              <p className="text-sm font-medium text-[#35D39A]">{lastSavedMessage}</p>
            </motion.div>
          )}

          {/* Live Speech Recognition Stream */}
          {(voiceState === 'LISTENING' || voiceState === 'UNDERSTANDING') && (
            <div className="rounded-xl bg-[#080D1B] border border-[#35D6F2]/35 p-4">
              <div className="flex items-center justify-between text-xs text-[#35D6F2] mb-1.5">
                <span>
                  {voiceState === 'LISTENING'
                    ? 'Listening to your counter...'
                    : 'Understanding transaction intent...'}
                </span>
                {voiceState === 'LISTENING' && (
                  <button
                    type="button"
                    onClick={cancelListening}
                    className="text-[#94A3B8] hover:text-[#F4F7FC] cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
              <p className="text-base sm:text-lg font-medium text-[#F4F7FC]">
                {liveTranscript || 'Speak naturally in Hindi, Kannada, English, or Hinglish...'}
              </p>
            </div>
          )}

          {/* One-Handed Disambiguation / Clarification Prompt */}
          {pending && (
            <div className="rounded-xl bg-[#080D1B] border border-[#FFBD59]/45 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-xs font-medium text-[#FFBD59] mb-1">
                    Clarification Required · Never Guessing
                  </p>
                  <p className="text-base font-medium text-[#F4F7FC]">
                    {turns[0]?.aiResponse || 'Please confirm the customer:'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={dismissClarification}
                  aria-label="Cancel clarification"
                  className="p-2 text-[#94A3B8] hover:text-[#F4F7FC] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {pending.type === 'DISAMBIGUATE_CUSTOMER' && pending.candidates && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {pending.candidates.map((cand) => (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => void resolveDisambiguation(cand.id)}
                      className="min-h-[48px] px-4 py-3 rounded-xl bg-[#152038] hover:bg-[#1e2d4d] border border-[#35D6F2]/40 text-left flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#F4F7FC]">{cand.name}</p>
                        {cand.phone && (
                          <p className="text-xs text-[#94A3B8] font-mono-num">
                            {cand.phone}
                          </p>
                        )}
                      </div>
                      <span className="text-xs font-medium text-[#35D6F2]">Select</span>
                    </button>
                  ))}
                </div>
              )}

              {pending.type === 'CONFIRM_NEW_CUSTOMER' && pending.suggestedName && (
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => void confirmCreateNewCustomerFromPending()}
                    className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-[#35D6F2] text-[#080D1B] text-sm font-semibold hover:bg-[#5ce0f6] cursor-pointer"
                  >
                    <UserPlus size={16} />
                    Add &ldquo;{pending.suggestedName}&rdquo; &amp; Save Entry
                  </button>
                  {pending.candidates?.map((cand) => (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => void resolveDisambiguation(cand.id)}
                      className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#152038] border border-white/10 text-sm text-[#F4F7FC] hover:border-[#35D6F2]/40 cursor-pointer"
                    >
                      Use {cand.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Latest Recognized & Interpreted Turns */}
          {turns.length === 0 ? (
            <div className="rounded-xl bg-[#080D1B]/70 border border-white/[0.06] p-5 text-center">
              <p className="text-sm font-medium text-[#F4F7FC] mb-1">
                Counter Mode is Ready
              </p>
              <p className="text-xs text-[#94A3B8] max-w-md mx-auto leading-relaxed">
                Try saying: &ldquo;Ramesh ka 340 udhaar&rdquo;, &ldquo;Nahi, 340 nahi
                430&rdquo;, &ldquo;Kal ka 200 payment add karo&rdquo;, or &ldquo;Aaj ka
                hisaab batao&rdquo;.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {turns.slice(0, 5).map((turn, idx) => (
                <div
                  key={turn.id}
                  className={`rounded-xl bg-[#080D1B] border p-4 ${
                    idx === 0 ? 'border-white/[0.14]' : 'border-white/[0.06] opacity-80'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#94A3B8] mb-1.5">
                    <span>
                      Spoken ({turn.detectedLanguage}): &ldquo;{turn.utterance}&rdquo;
                    </span>
                    <span className="font-mono-num">
                      {new Date(turn.timestamp).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <p className="text-sm font-medium text-[#35D6F2] mb-1">
                    {turn.interpretedMeaning}
                  </p>

                  {turn.queryResult && (
                    <div className="my-2 rounded-lg bg-[#10182A] border border-white/[0.08] px-3.5 py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs text-[#94A3B8]">{turn.queryResult.title}</p>
                        <p className="text-xs text-[#94A3B8] mt-0.5">
                          {turn.queryResult.detail}
                        </p>
                      </div>
                      <p className="font-mono-num text-lg font-semibold text-[#F4F7FC]">
                        {turn.queryResult.primaryValue}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 mt-2">
                    <p className="text-sm text-[#F4F7FC]">{turn.aiResponse}</p>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void replayAudio(turn.aiResponse, turn.detectedLanguage)}
                        title="Hear AI response"
                        aria-label="Replay spoken response"
                        className="p-2 rounded-lg text-[#94A3B8] hover:text-[#35D6F2] hover:bg-white/[0.06] cursor-pointer"
                      >
                        <Volume2 size={15} />
                      </button>
                      {turn.transaction &&
                        turn.transaction.status === 'CONFIRMED' &&
                        turn.transaction.type !== 'REVERSAL' && (
                          <button
                            type="button"
                            onClick={() => void reverseTransaction(turn.transaction!.id)}
                            title="Reverse this transaction"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs text-[#94A3B8] hover:text-rose-300 hover:bg-white/[0.06] cursor-pointer"
                          >
                            <RotateCcw size={13} />
                            Undo
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom One-Handed Thumb Zone: Massive Mic Orb + Text Fallback */}
        <div className="pt-4 border-t border-white/[0.08] flex flex-col items-center">
          <VoiceCoreOrb
            state={voiceState}
            volumeLevels={volumeLevels}
            size="counter"
            onTap={handleMicTap}
            label={
              voiceState === 'LISTENING'
                ? 'Tap to stop & record entry'
                : voiceState === 'UNDERSTANDING'
                  ? 'Processing with Gemini AI...'
                  : 'Tap once to speak · Tap again when done'
            }
          />

          {/* Context Indicator & Keyboard Toggle */}
          <div className="mt-5 w-full flex flex-wrap items-center justify-between gap-3 text-xs text-[#94A3B8]">
            <div>
              {conversationContext.lastCustomerName ? (
                <span>
                  Khata Echo Context: {conversationContext.lastCustomerName}
                  {conversationContext.lastAmount
                    ? ` · ${formatINR(conversationContext.lastAmount)} (${conversationContext.lastType})`
                    : ''}
                </span>
              ) : (
                <span>Khata Echo ready · AI-assisted ledger</span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowKeyboard((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#94A3B8] hover:text-[#35D6F2] py-1.5 px-2.5 rounded-lg bg-[#080D1B] border border-white/[0.08] cursor-pointer"
            >
              <Keyboard size={14} />
              {showKeyboard ? 'Hide Text Input' : 'Type Command'}
            </button>
          </div>

          {showKeyboard && (
            <form
              onSubmit={handleTextSubmit}
              className="mt-3 w-full flex items-center gap-2"
            >
              <input
                type="text"
                value={typedUtterance}
                onChange={(e) => setTypedUtterance(e.target.value)}
                placeholder='Type e.g. "Ramesh ka 340 udhaar" or "Nahi 340 nahi 430"'
                className="flex-1 px-4 py-3 rounded-xl bg-[#080D1B] border border-white/[0.12] text-sm text-[#F4F7FC] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#35D6F2]"
              />
              <button
                type="submit"
                disabled={isBusy || !typedUtterance.trim()}
                className="min-h-[46px] px-4 rounded-xl bg-[#35D6F2] text-[#080D1B] font-semibold text-sm inline-flex items-center gap-1.5 hover:bg-[#5ce0f6] disabled:opacity-50 cursor-pointer"
              >
                <Send size={15} />
                Send
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
