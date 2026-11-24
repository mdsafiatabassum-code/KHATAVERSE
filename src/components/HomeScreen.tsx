import React, { useMemo, useState } from 'react';
import { ArrowRight, Mic, Search, RotateCcw } from 'lucide-react';
import { useKhata } from '../context/KhataContext';
import {
  computeAllCustomerSummaries,
  computeDailyMetrics,
  computeGlobalOutstanding,
  formatINR,
  getEffectiveDirection,
  getLocalIsoDate,
} from '../engine/ledger';
import { VoiceCoreOrb } from './VoiceCoreOrb';

interface HomeScreenProps {
  onOpenCounter: () => void;
  onSelectCustomer: (customerId: string) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onOpenCounter,
  onSelectCustomer,
}) => {
  const {
    settings,
    aiConfigured,
    customers,
    transactions,
    voiceState,
    liveTranscript,
    volumeLevels,
    turns,
    errorMessage,
    startListening,
    stopListeningAndProcess,
    reverseTransaction,
    clearError,
  } = useKhata();

  const [lookupQuery, setLookupQuery] = useState('');

  const todayIso = getLocalIsoDate(0);
  const daily = useMemo(
    () => computeDailyMetrics(transactions, todayIso),
    [transactions, todayIso]
  );
  const global = useMemo(
    () => computeGlobalOutstanding(customers, transactions),
    [customers, transactions]
  );
  const customerSummaries = useMemo(
    () =>
      computeAllCustomerSummaries(customers, transactions).sort(
        (a, b) => b.outstanding - a.outstanding
      ),
    [customers, transactions]
  );

  const filteredCustomers = useMemo(() => {
    const q = lookupQuery.trim().toLowerCase();
    if (!q) return customerSummaries.slice(0, 6);
    return customerSummaries
      .filter(
        (s) =>
          s.customer.name.toLowerCase().includes(q) ||
          s.customer.aliases.some((a) => a.toLowerCase().includes(q)) ||
          (s.customer.phone ?? '').includes(q)
      )
      .slice(0, 6);
  }, [customerSummaries, lookupQuery]);

  const recentActivity = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 6),
    [transactions]
  );

  const handleHeroMicTap = () => {
    if (voiceState === 'LISTENING') {
      void stopListeningAndProcess();
    } else {
      void startListening();
    }
  };

  const latestTurn = turns[0];

  return (
    <div className="space-y-8 pb-8">
      {/* Command Centre Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
        <div>
          <p className="text-xs font-medium text-[#35D6F2] tracking-wide mb-1">
            KHATAVERSE · Your intelligent business companion
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-[#F4F7FC] text-balance">
            {getGreeting()}! {settings.shopName} is ready.
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#94A3B8]">
          <span>
            AI Co-Pilot: {aiConfigured ? 'Connected' : 'API Key Required'}
          </span>
          <span aria-hidden="true">·</span>
          <span>Language: {settings.preferredLanguage}</span>
          {settings.demoMode && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-[#FFBD59] font-medium">Demo Mode Active</span>
            </>
          )}
        </div>
      </section>

      {/* Main Hero Voice Assistant */}
      <section className="relative overflow-hidden rounded-2xl bg-[#10182A] border border-white/[0.08] p-6 sm:p-10">
        <div
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-64 w-[32rem] rounded-full bg-[#35D6F2]/8 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex flex-col items-center text-center max-w-2xl mx-auto">
          <VoiceCoreOrb
            state={voiceState}
            volumeLevels={volumeLevels}
            size="hero"
            onTap={handleHeroMicTap}
            label={
              voiceState === 'LISTENING'
                ? 'Listening... Tap microphone to finish'
                : 'Tap microphone to speak a transaction or query'
            }
          />

          {/* Live Transcript or Latest AI Confirmation */}
          {(liveTranscript || latestTurn || errorMessage) && (
            <div className="mt-6 w-full rounded-xl bg-[#080D1B]/90 border border-white/[0.08] p-4 text-left">
              {errorMessage ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-rose-300">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={clearError}
                    className="text-xs font-medium text-[#35D6F2] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              ) : voiceState === 'LISTENING' || voiceState === 'UNDERSTANDING' ? (
                <div>
                  <p className="text-xs text-[#94A3B8] mb-1">Recognized speech</p>
                  <p className="text-base text-[#F4F7FC]">
                    {liveTranscript || 'Listening to your voice...'}
                  </p>
                </div>
              ) : latestTurn ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#94A3B8]">
                    <span>&ldquo;{latestTurn.utterance}&rdquo;</span>
                    <span className="font-mono-num">
                      {Math.round(latestTurn.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="text-sm font-medium text-[#35D6F2]">
                    {latestTurn.interpretedMeaning}
                  </p>
                  <p className="text-sm text-[#F4F7FC]">{latestTurn.aiResponse}</p>
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleHeroMicTap}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#35D6F2] text-[#080D1B] font-semibold text-sm hover:bg-[#5ce0f6] transition-colors min-h-[44px] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Mic size={17} />
              {voiceState === 'LISTENING' ? 'STOP & PROCESS' : 'TALK TO KHATAVERSE'}
            </button>
            <button
              type="button"
              onClick={onOpenCounter}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#152038] border border-white/[0.12] text-[#F4F7FC] font-medium text-sm hover:border-[#35D6F2]/50 transition-colors min-h-[44px] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Counter Mode
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* Today's Business Snapshot */}
      <section aria-labelledby="snapshot-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <h2
            id="snapshot-heading"
            className="font-display text-lg font-semibold text-[#F4F7FC]"
          >
            Today&apos;s Business Snapshot
          </h2>
          <p className="text-xs text-[#94A3B8] font-mono-num">
            {daily.transactionCount} transactions today · {todayIso}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-5">
            <p className="text-xs text-[#94A3B8] mb-2">Credit Given Today</p>
            <p className="font-mono-num text-2xl font-semibold text-[#FFBD59]">
              {formatINR(daily.creditToday)}
            </p>
            <p className="text-xs text-[#94A3B8] mt-2">Increases shop udhaar</p>
          </div>

          <div className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-5">
            <p className="text-xs text-[#94A3B8] mb-2">Payments Received Today</p>
            <p className="font-mono-num text-2xl font-semibold text-[#35D39A]">
              {formatINR(daily.paymentsToday)}
            </p>
            <p className="text-xs text-[#94A3B8] mt-2">Cash & UPI collections</p>
          </div>

          <div className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-5">
            <p className="text-xs text-[#94A3B8] mb-2">Total Outstanding</p>
            <p className="font-mono-num text-2xl font-semibold text-[#F4F7FC]">
              {formatINR(global.totalOutstanding)}
            </p>
            <p className="text-xs text-[#94A3B8] mt-2">
              Net across {customers.length} customers
            </p>
          </div>

          <div className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-5">
            <p className="text-xs text-[#94A3B8] mb-2">Active Customers</p>
            <p className="font-mono-num text-2xl font-semibold text-[#35D6F2]">
              {global.activeCustomersWithBalance}
            </p>
            <p className="text-xs text-[#94A3B8] mt-2">
              With open udhaar balance
            </p>
          </div>
        </div>
      </section>

      {/* Two-Column Activity & Quick Customer Lookup */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Ledger Activity */}
        <div className="lg:col-span-7 rounded-2xl bg-[#10182A] border border-white/[0.08] p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-base font-semibold text-[#F4F7FC]">
              Recent Activity
            </h3>
            <span className="text-xs text-[#94A3B8] font-mono-num">
              {transactions.length} total entries
            </span>
          </div>

          {recentActivity.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#94A3B8]">
              No transactions recorded yet. Tap TALK TO KHATAVERSE to record your first
              entry.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {recentActivity.map((tx) => {
                const dir = getEffectiveDirection(tx);
                const isCredit = dir === 'CREDIT';
                const isMuted = tx.status !== 'CONFIRMED';
                return (
                  <div
                    key={tx.id}
                    className={`py-3.5 flex items-center justify-between gap-4 ${
                      isMuted ? 'opacity-55' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectCustomer(tx.customer_id)}
                          className="font-medium text-sm text-[#F4F7FC] hover:text-[#35D6F2] transition-colors truncate cursor-pointer"
                        >
                          {tx.customer_name}
                        </button>
                        <span className="text-xs text-[#94A3B8]">·</span>
                        <span
                          className={`text-xs font-medium ${
                            tx.type === 'REVERSAL'
                              ? 'text-rose-300'
                              : tx.type === 'CORRECTION'
                                ? 'text-[#8B72FF]'
                                : isCredit
                                  ? 'text-[#FFBD59]'
                                  : 'text-[#35D39A]'
                          }`}
                        >
                          {tx.type}
                        </span>
                        {tx.status !== 'CONFIRMED' && (
                          <>
                            <span className="text-xs text-[#94A3B8]">·</span>
                            <span className="text-xs text-[#94A3B8]">{tx.status}</span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-[#94A3B8] truncate mt-0.5">
                        &ldquo;{tx.original_utterance}&rdquo; · {tx.date}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`font-mono-num text-sm font-semibold ${
                          tx.type === 'REVERSAL'
                            ? 'text-[#94A3B8] line-through'
                            : isCredit
                              ? 'text-[#FFBD59]'
                              : 'text-[#35D39A]'
                        }`}
                      >
                        {isCredit ? '+' : '−'}
                        {formatINR(tx.amount)}
                      </span>
                      {tx.status === 'CONFIRMED' && tx.type !== 'REVERSAL' && (
                        <button
                          type="button"
                          onClick={() => void reverseTransaction(tx.id)}
                          title="Reverse this entry"
                          aria-label={`Reverse ${tx.customer_name} entry`}
                          className="p-2 rounded-lg text-[#94A3B8] hover:text-[#F4F7FC] hover:bg-white/[0.06] transition-colors cursor-pointer"
                        >
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Customer Lookup & Recent Balances */}
        <div className="lg:col-span-5 rounded-2xl bg-[#10182A] border border-white/[0.08] p-5 sm:p-6">
          <h3 className="font-display text-base font-semibold text-[#F4F7FC] mb-4">
            Quick Customer Lookup
          </h3>

          <div className="relative mb-4">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"
            />
            <input
              type="text"
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              placeholder="Search customer name or alias..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#080D1B] border border-white/[0.1] text-sm text-[#F4F7FC] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#35D6F2]"
            />
          </div>

          {filteredCustomers.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#94A3B8]">
              No matching customers found.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {filteredCustomers.map((summary) => (
                <button
                  key={summary.customer.id}
                  type="button"
                  onClick={() => onSelectCustomer(summary.customer.id)}
                  className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] px-1 rounded-lg transition-colors min-h-[52px] cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#F4F7FC] truncate">
                      {summary.customer.name}
                    </p>
                    <p className="text-xs text-[#94A3B8] truncate">
                      {summary.lastTransaction
                        ? `Last: ${summary.lastTransaction.date}`
                        : 'No transactions yet'}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`font-mono-num text-sm font-semibold ${
                        summary.outstanding > 0 ? 'text-[#FFBD59]' : 'text-[#35D39A]'
                      }`}
                    >
                      {formatINR(summary.outstanding)}
                    </p>
                    <p className="text-[11px] text-[#94A3B8]">
                      {summary.outstanding > 0 ? 'Outstanding' : 'Settled'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
