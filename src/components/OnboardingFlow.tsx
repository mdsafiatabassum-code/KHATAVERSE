import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, CheckCircle2, Mic, ShieldCheck, Store, Volume2 } from 'lucide-react';
import { useKhata } from '../context/KhataContext';
import { PreferredLanguage } from '../types/khata';

const LANGUAGES: { id: PreferredLanguage; native: string; sample: string }[] = [
  { id: 'Hinglish', native: 'Hinglish (Recommended)', sample: 'Ramesh ka 340 udhaar' },
  { id: 'Hindi', native: 'हिन्दी (Hindi)', sample: 'रमेश का 340 उधार लिखो' },
  { id: 'Kannada', native: 'ಕನ್ನಡ (Kannada + English)', sample: 'Manjunath avara 500 udhaar' },
  { id: 'English', native: 'Indian English', sample: 'Add 340 credit for Ramesh' },
];

const AI_INTROS: Record<PreferredLanguage, string> = {
  Hinglish:
    'Namaste! Main KHATAVERSE hoon, aapka AI-powered khata assistant. Aap bas bolte jaayein, main hisaab sambhalunga.',
  Hindi:
    'Namaste! Main KHATAVERSE hoon, aapka AI-powered khata sahayak. Aap bolkar udhaar aur payment darj kar sakte hain.',
  Kannada:
    'Namaskara! Naanu KHATAVERSE, nimma AI-powered khata assistant. Neevu maatanadidare saaku, lekkavannu naanu baredittukolluttene.',
  English:
    'Hello! I am KHATAVERSE, your AI-powered khata assistant. Speak naturally to record credit, payments, and check customer balances.',
};

export const OnboardingFlow: React.FC = () => {
  const { settings, updateSettings, replayAudio } = useKhata();
  const [step, setStep] = useState(1);
  const [language, setLanguage] = useState<PreferredLanguage>(settings.preferredLanguage);
  const [shopName, setShopName] = useState(settings.shopName);
  const [micStatus, setMicStatus] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [micError, setMicError] = useState<string | null>(null);

  const handleSkipDemo = async () => {
    await updateSettings({
      onboardingComplete: true,
      demoMode: true,
      preferredLanguage: language,
      shopName: shopName.trim() || settings.shopName,
    });
  };

  const handleRequestMic = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus('granted');
    } catch {
      setMicStatus('denied');
      setMicError(
        'Microphone permission was declined. You can still continue and enable it anytime in your browser bar.'
      );
    }
  };

  const handleFinish = async () => {
    await updateSettings({
      preferredLanguage: language,
      shopName: shopName.trim() || 'My Kirana Store',
      onboardingComplete: true,
    });
  };

  const handleNextFromStep4 = () => {
    setStep(5);
    void replayAudio(AI_INTROS[language], language);
  };

  return (
    <div className="min-h-screen bg-[#080D1B] text-[#F4F7FC] flex flex-col justify-between px-5 py-6 sm:px-8">
      {/* Minimal Header */}
      <header className="max-w-3xl w-full mx-auto flex items-center justify-between">
        <span className="font-display text-lg font-bold tracking-tight text-[#F4F7FC]">
          KHATAVERSE
        </span>
        <button
          type="button"
          onClick={handleSkipDemo}
          className="text-sm font-medium text-[#94A3B8] hover:text-[#35D6F2] transition-colors min-h-[40px] px-3 cursor-pointer"
        >
          Skip to Demo Mode
        </button>
      </header>

      {/* Main Step Card */}
      <main className="max-w-xl w-full mx-auto my-auto py-8">
        <div className="flex items-center gap-2 mb-6 text-xs text-[#94A3B8]">
          <span>Step {step} of 5</span>
          <span aria-hidden="true">·</span>
          <span>Speak Naturally. Account Intelligently.</span>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6 sm:p-8"
            >
              <p className="text-xs font-medium tracking-[0.14em] text-[#35D6F2] mb-3">
                WELCOME TO KHATAVERSE
              </p>
              <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-[#F4F7FC] mb-4 text-balance">
                Your shop has a new voice.
              </h1>
              <p className="text-[#94A3B8] text-base leading-relaxed mb-8">
                Keep serving customers at the counter without stopping to type. Speak
                credit, payments, and corrections naturally in Hindi, Kannada, English,
                or Hinglish — and let deterministic accounting keep every rupee exact.
              </p>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#35D6F2] text-[#080D1B] font-semibold text-sm hover:bg-[#5ce0f6] transition-colors min-h-[46px] cursor-pointer"
              >
                Get Started
                <ArrowRight size={18} />
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6 sm:p-8"
            >
              <h2 className="font-display text-2xl font-semibold text-[#F4F7FC] mb-2">
                Choose your preferred language
              </h2>
              <p className="text-sm text-[#94A3B8] mb-6">
                KHATAVERSE understands code-mixing automatically. Pick your primary
                response language.
              </p>
              <div className="space-y-3 mb-8">
                {LANGUAGES.map((item) => {
                  const selected = language === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLanguage(item.id)}
                      className={`w-full text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#152038] border-[#35D6F2] text-[#F4F7FC]'
                          : 'bg-[#0B1224] border-white/[0.07] text-[#94A3B8] hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#F4F7FC]">{item.native}</span>
                        {selected && <CheckCircle2 size={18} className="text-[#35D6F2]" />}
                      </div>
                      <p className="text-xs text-[#94A3B8] mt-1">
                        Example: &ldquo;{item.sample}&rdquo;
                      </p>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 text-sm text-[#94A3B8] hover:text-[#F4F7FC] min-h-[44px] cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#35D6F2] text-[#080D1B] font-semibold text-sm hover:bg-[#5ce0f6] min-h-[44px] cursor-pointer"
                >
                  Continue
                  <ArrowRight size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6 sm:p-8"
            >
              <div className="h-11 w-11 rounded-xl bg-[#8B72FF]/15 border border-[#8B72FF]/30 flex items-center justify-center mb-4">
                <Store size={22} className="text-[#8B72FF]" />
              </div>
              <h2 className="font-display text-2xl font-semibold text-[#F4F7FC] mb-2">
                Name your shop
              </h2>
              <p className="text-sm text-[#94A3B8] mb-6">
                This personalizes your daily command centre and closing reports.
              </p>
              <label className="block text-xs font-medium text-[#94A3B8] mb-2">
                Shop Name
              </label>
              <input
                type="text"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="e.g. Lakshmi Kirana & General Store"
                className="w-full px-4 py-3 rounded-xl bg-[#080D1B] border border-white/[0.12] text-[#F4F7FC] text-base focus:outline-none focus:border-[#35D6F2] mb-8"
              />
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2.5 text-sm text-[#94A3B8] hover:text-[#F4F7FC] min-h-[44px] cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#35D6F2] text-[#080D1B] font-semibold text-sm hover:bg-[#5ce0f6] min-h-[44px] cursor-pointer"
                >
                  Continue
                  <ArrowRight size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6 sm:p-8"
            >
              <div className="h-11 w-11 rounded-xl bg-[#35D6F2]/15 border border-[#35D6F2]/30 flex items-center justify-center mb-4">
                <Mic size={22} className="text-[#35D6F2]" />
              </div>
              <h2 className="font-display text-2xl font-semibold text-[#F4F7FC] mb-2">
                Voice & Privacy Setup
              </h2>
              <p className="text-sm text-[#94A3B8] leading-relaxed mb-5">
                KHATAVERSE uses your microphone only while you actively tap or hold to
                speak. Raw audio recordings are never stored permanently, and your ledger
                is encrypted locally in IndexedDB.
              </p>

              <div className="rounded-xl bg-[#080D1B] border border-white/[0.08] p-4 mb-6 flex items-start gap-3">
                <ShieldCheck size={20} className="text-[#35D39A] shrink-0 mt-0.5" />
                <div className="text-xs text-[#94A3B8] space-y-1">
                  <p className="text-[#F4F7FC] font-medium">Local-First Encryption</p>
                  <p>
                    Customer balances stay encrypted on your device using AES-GCM. Voice
                    clips are discarded right after transcription.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 mb-6">
                <button
                  type="button"
                  onClick={handleRequestMic}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border text-sm font-medium min-h-[44px] cursor-pointer ${
                    micStatus === 'granted'
                      ? 'bg-[#35D39A]/15 border-[#35D39A]/40 text-[#35D39A]'
                      : 'bg-[#152038] border-[#35D6F2]/40 text-[#35D6F2] hover:bg-[#1a2846]'
                  }`}
                >
                  <Mic size={16} />
                  {micStatus === 'granted' ? 'Microphone Enabled' : 'Enable Microphone'}
                </button>
              </div>

              {micError && (
                <p className="text-xs text-[#FFBD59] mb-4">{micError}</p>
              )}

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-2.5 text-sm text-[#94A3B8] hover:text-[#F4F7FC] min-h-[44px] cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleNextFromStep4}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#35D6F2] text-[#080D1B] font-semibold text-sm hover:bg-[#5ce0f6] min-h-[44px] cursor-pointer"
                >
                  Meet KHATAVERSE AI
                  <ArrowRight size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6 sm:p-8"
            >
              <p className="text-xs font-medium tracking-[0.14em] text-[#8B72FF] mb-3">
                AI ASSISTANT DISCLOSURE
              </p>
              <h2 className="font-display text-2xl font-semibold text-[#F4F7FC] mb-4">
                Meet your AI Khata Partner
              </h2>

              <div className="rounded-xl bg-[#080D1B] border border-[#35D6F2]/25 p-5 mb-6">
                <p className="text-base text-[#F4F7FC] leading-relaxed">
                  &ldquo;{AI_INTROS[language]}&rdquo;
                </p>
                <button
                  type="button"
                  onClick={() => replayAudio(AI_INTROS[language], language)}
                  className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-[#35D6F2] hover:underline cursor-pointer"
                >
                  <Volume2 size={15} />
                  Hear introduction again
                </button>
              </div>

              <p className="text-xs text-[#94A3B8] leading-relaxed mb-8">
                KHATAVERSE is an AI assistant that extracts transaction intent from your
                voice, while deterministic accounting logic maintains all customer balances.
                You can review, correct, or reverse any entry anytime.
              </p>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-4 py-2.5 text-sm text-[#94A3B8] hover:text-[#F4F7FC] min-h-[44px] cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#35D6F2] text-[#080D1B] font-semibold text-sm hover:bg-[#5ce0f6] min-h-[44px] cursor-pointer"
                >
                  Open Command Centre
                  <ArrowRight size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-3xl w-full mx-auto text-center text-xs text-[#94A3B8]">
        Local-first encrypted storage · AI-assisted bookkeeping
      </footer>
    </div>
  );
};
