import React, { useState } from 'react';
import {
  Download,
  FlaskConical,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useKhata } from '../context/KhataContext';
import { PreferredLanguage } from '../types/khata';

const LANGUAGES: PreferredLanguage[] = ['Hinglish', 'Hindi', 'Kannada', 'English'];

export const SettingsScreen: React.FC = () => {
  const {
    settings,
    customers,
    transactions,
    transcripts,
    updateSettings,
    resetDemoData,
    purgeTranscripts,
    eraseAllData,
  } = useKhata();

  const [shopNameDraft, setShopNameDraft] = useState(settings.shopName);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);

  const showStatus = (msg: string) => {
    setStatusNote(msg);
    setTimeout(() => setStatusNote(null), 3000);
  };

  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shopNameDraft.trim()) return;
    await updateSettings({ shopName: shopNameDraft.trim() });
    showStatus('Shop profile saved and encrypted locally.');
  };

  const handleResetDemo = async () => {
    await resetDemoData();
    showStatus('Synthetic demo dataset restored (6 customers, 12 entries).');
  };

  const handlePurgeTranscripts = async () => {
    await purgeTranscripts();
    showStatus('Temporary encrypted transcripts cleared.');
  };

  const handleExportLedger = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      shopName: settings.shopName,
      customers,
      transactions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `khataverse-ledger-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus('Ledger exported as JSON.');
  };

  const handleEraseAll = async () => {
    await eraseAllData();
    setConfirmErase(false);
    showStatus('All local customer, ledger, and transcript records erased.');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[#F4F7FC]">
          Settings, Privacy &amp; Demo Controls
        </h1>
        <p className="text-sm text-[#94A3B8]">
          Manage shop preferences, local AES-GCM encryption, and synthetic demo data.
        </p>
      </div>

      {statusNote && (
        <div className="rounded-xl bg-[#35D39A]/15 border border-[#35D39A]/35 px-4 py-3 text-sm text-[#35D39A]">
          {statusNote}
        </div>
      )}

      {/* Shop & Voice Preferences */}
      <section className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6 space-y-5">
        <h2 className="font-display text-base font-semibold text-[#F4F7FC]">
          Shop &amp; Assistant Preferences
        </h2>

        <form onSubmit={handleSaveShop} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={shopNameDraft}
            onChange={(e) => setShopNameDraft(e.target.value)}
            placeholder="Shop Name"
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#080D1B] border border-white/[0.12] text-sm text-[#F4F7FC] focus:outline-none focus:border-[#35D6F2]"
          />
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[#35D6F2] text-[#080D1B] text-sm font-semibold hover:bg-[#5ce0f6] min-h-[44px] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Save Shop Name
          </button>
        </form>

        <div>
          <label className="block text-xs font-medium text-[#94A3B8] mb-2">
            Preferred Voice Response Language
          </label>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => void updateSettings({ preferredLanguage: lang })}
                className={`px-4 py-2 rounded-xl text-xs font-medium border min-h-[40px] cursor-pointer ${
                  settings.preferredLanguage === lang
                    ? 'bg-[#35D6F2] text-[#080D1B] border-[#35D6F2]'
                    : 'bg-[#080D1B] text-[#94A3B8] border-white/[0.1] hover:text-[#F4F7FC]'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/[0.08]">
          <div>
            <p className="text-sm font-medium text-[#F4F7FC]">Spoken Voice Replies</p>
            <p className="text-xs text-[#94A3B8]">
              Speak transaction confirmations and daily summaries aloud.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              void updateSettings({
                voiceOutputEnabled: !settings.voiceOutputEnabled,
              })
            }
            className={`px-4 py-2 rounded-xl text-xs font-semibold min-h-[40px] cursor-pointer ${
              settings.voiceOutputEnabled
                ? 'bg-[#35D39A]/15 text-[#35D39A] border border-[#35D39A]/35'
                : 'bg-[#080D1B] text-[#94A3B8] border border-white/[0.1]'
            }`}
          >
            {settings.voiceOutputEnabled ? 'Enabled' : 'Muted'}
          </button>
        </div>
      </section>

      {/* Hackathon Demo Mode */}
      <section className="rounded-2xl bg-[#10182A] border border-[#FFBD59]/30 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <FlaskConical size={20} className="text-[#FFBD59] shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-base font-semibold text-[#F4F7FC]">
                Hackathon Demo Mode
              </h2>
              <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                Uses synthetic demonstration data only (Ramesh Kumar, Ramesh Sharma,
                Suresh, Ayesha, Manjunath, Priya Sharma). All voice commands run
                through the live Gemini NLU and deterministic ledger engine.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              void updateSettings({ demoMode: !settings.demoMode })
            }
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer ${
              settings.demoMode
                ? 'bg-[#FFBD59] text-[#080D1B]'
                : 'bg-[#080D1B] text-[#94A3B8] border border-white/[0.1]'
            }`}
          >
            {settings.demoMode ? 'Demo On' : 'Demo Off'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => void handleResetDemo()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#080D1B] border border-[#FFBD59]/40 text-xs font-semibold text-[#FFBD59] hover:bg-[#152038] min-h-[40px] cursor-pointer"
          >
            <RefreshCw size={14} />
            Reset Demo Data
          </button>
          <button
            type="button"
            onClick={() => void updateSettings({ onboardingComplete: false })}
            className="px-4 py-2.5 rounded-xl bg-[#080D1B] border border-white/[0.1] text-xs font-medium text-[#94A3B8] hover:text-[#F4F7FC] min-h-[40px] cursor-pointer"
          >
            Replay Onboarding Tour
          </button>
        </div>
      </section>

      {/* Data Privacy & Security */}
      <section className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <Lock size={18} className="text-[#35D39A]" />
          <h2 className="font-display text-base font-semibold text-[#F4F7FC]">
            Data Privacy &amp; Local Encryption
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#94A3B8]">
          <div className="rounded-xl bg-[#080D1B] border border-white/[0.06] p-3.5">
            <p className="font-medium text-[#F4F7FC] mb-1">AES-GCM At-Rest Storage</p>
            <p>
              {customers.length} customers and {transactions.length} ledger entries are
              encrypted in your browser&apos;s IndexedDB using a non-extractable
              256-bit Web Crypto key.
            </p>
          </div>
          <div className="rounded-xl bg-[#080D1B] border border-white/[0.06] p-3.5">
            <p className="font-medium text-[#F4F7FC] mb-1">Zero Audio Retention</p>
            <p>
              Microphone recordings are discarded immediately after transcription.{' '}
              {transcripts.length} temporary encrypted transcript logs (24h auto-expiry).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleExportLedger}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#080D1B] border border-white/[0.12] text-xs font-medium text-[#F4F7FC] hover:border-[#35D6F2]/50 min-h-[40px] cursor-pointer"
          >
            <Download size={14} />
            Export Ledger Backup
          </button>
          <button
            type="button"
            onClick={() => void handlePurgeTranscripts()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#080D1B] border border-white/[0.12] text-xs font-medium text-[#94A3B8] hover:text-[#F4F7FC] min-h-[40px] cursor-pointer"
          >
            Purge Temp Transcripts ({transcripts.length})
          </button>

          {!confirmErase ? (
            <button
              type="button"
              onClick={() => setConfirmErase(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-400/30 text-xs font-medium text-rose-300 hover:bg-rose-500/20 min-h-[40px] cursor-pointer"
            >
              <Trash2 size={14} />
              Erase All Local Data
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleEraseAll()}
                className="px-4 py-2.5 rounded-xl bg-rose-500 text-white text-xs font-semibold min-h-[40px] cursor-pointer"
              >
                Confirm Erase Everything
              </button>
              <button
                type="button"
                onClick={() => setConfirmErase(false)}
                className="px-3 py-2 text-xs text-[#94A3B8] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Responsible AI Disclosure */}
      <section className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6">
        <div className="flex items-center gap-2.5 mb-2">
          <ShieldCheck size={18} className="text-[#35D6F2]" />
          <h2 className="font-display text-base font-semibold text-[#F4F7FC]">
            Responsible AI Commitment
          </h2>
        </div>
        <p className="text-xs text-[#94A3B8] leading-relaxed">
          KHATAVERSE clearly discloses that it is an AI-assisted bookkeeping co-pilot.
          Gemini handles multilingual speech understanding while deterministic code
          performs every rupee calculation. KHATAVERSE never guesses ambiguous amounts or
          customer identities, never silently alters records, never issues lending
          recommendations, and never sends automated or pressuring customer reminders.
        </p>
      </section>
    </div>
  );
};
