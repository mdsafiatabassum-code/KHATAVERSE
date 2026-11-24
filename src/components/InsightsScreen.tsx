import React, { useMemo, useState } from 'react';
import { FileBarChart2, Volume2 } from 'lucide-react';
import { useKhata } from '../context/KhataContext';
import {
  computeDailyMetrics,
  computeGlobalOutstanding,
  computeUdhaarRadarInsights,
  formatINR,
  getLocalIsoDate,
} from '../engine/ledger';

interface InsightsScreenProps {
  onSelectCustomer: (customerId: string) => void;
}

export const InsightsScreen: React.FC<InsightsScreenProps> = ({
  onSelectCustomer,
}) => {
  const { customers, transactions, settings, replayAudio } = useKhata();
  const [reportGenerated, setReportGenerated] = useState(false);

  const todayIso = getLocalIsoDate(0);
  const daily = useMemo(
    () => computeDailyMetrics(transactions, todayIso),
    [transactions, todayIso]
  );
  const global = useMemo(
    () => computeGlobalOutstanding(customers, transactions),
    [customers, transactions]
  );
  const radar = useMemo(
    () => computeUdhaarRadarInsights(customers, transactions),
    [customers, transactions]
  );

  const dailyReportSpeech = useMemo(() => {
    const netChange =
      daily.netOutstandingChange >= 0
        ? `increased by ${formatINR(daily.netOutstandingChange)}`
        : `decreased by ${formatINR(Math.abs(daily.netOutstandingChange))}`;
    const topCust = global.highestOutstandingCustomer
      ? ` ${global.highestOutstandingCustomer.customer.name} has the highest outstanding balance at ${formatINR(global.highestOutstandingCustomer.outstanding)}.`
      : '';
    return `Today at ${settings.shopName}, you recorded ${formatINR(daily.creditToday)} in credit transactions and received ${formatINR(daily.paymentsToday)} in payments. Your outstanding balance ${netChange}. You completed ${daily.transactionCount} transactions today.${topCust}`;
  }, [daily, global, settings.shopName]);

  const handleGenerateDailyReport = () => {
    setReportGenerated(true);
    void replayAudio(dailyReportSpeech, settings.preferredLanguage);
  };

  const todayTotalFlow = daily.creditToday + daily.paymentsToday;
  const creditSharePct =
    todayTotalFlow > 0 ? Math.round((daily.creditToday / todayTotalFlow) * 100) : 50;

  const maxWeekVal = Math.max(
    100,
    ...radar.weekTrends.map((d) => Math.max(d.credit, d.payment))
  );

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[#F4F7FC]">
          Udhaar Radar &amp; Closing Time Intelligence
        </h1>
        <p className="text-sm text-[#94A3B8]">
          Deterministic insights calculated directly from your encrypted local ledger.
        </p>
      </div>

      {/* Closing Time Intelligence Section */}
      <section className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
          <div>
            <p className="text-xs font-medium text-[#8B72FF] tracking-wide mb-1">
              CLOSING TIME INTELLIGENCE
            </p>
            <h2 className="font-display text-xl font-semibold text-[#F4F7FC]">
              End-of-Day Business Summary
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Or say &ldquo;Aaj ka hisaab batao&rdquo; anytime in Counter Mode.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGenerateDailyReport}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#35D6F2] text-[#080D1B] font-semibold text-sm hover:bg-[#5ce0f6] min-h-[44px] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileBarChart2 size={17} />
              GENERATE MY DAILY REPORT
            </button>
            <button
              type="button"
              onClick={() =>
                void replayAudio(dailyReportSpeech, settings.preferredLanguage)
              }
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#080D1B] border border-white/[0.12] text-sm font-medium text-[#F4F7FC] hover:border-[#35D6F2]/50 min-h-[44px] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Volume2 size={16} />
              Listen
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mt-5">
          <div>
            <p className="text-xs text-[#94A3B8]">Total Credit</p>
            <p className="font-mono-num text-xl font-semibold text-[#FFBD59] mt-1">
              {formatINR(daily.creditToday)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">Total Payments</p>
            <p className="font-mono-num text-xl font-semibold text-[#35D39A] mt-1">
              {formatINR(daily.paymentsToday)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">Net Change</p>
            <p className="font-mono-num text-xl font-semibold text-[#F4F7FC] mt-1">
              {daily.netOutstandingChange >= 0 ? '+' : ''}
              {formatINR(daily.netOutstandingChange)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">Transactions</p>
            <p className="font-mono-num text-xl font-semibold text-[#F4F7FC] mt-1">
              {daily.transactionCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">Corrections Today</p>
            <p className="font-mono-num text-xl font-semibold text-[#8B72FF] mt-1">
              {daily.correctionsToday}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#94A3B8]">Highest Outstanding</p>
            <p className="text-sm font-semibold text-[#F4F7FC] mt-1 truncate">
              {global.highestOutstandingCustomer
                ? `${global.highestOutstandingCustomer.customer.name} (${formatINR(global.highestOutstandingCustomer.outstanding)})`
                : 'None'}
            </p>
          </div>
        </div>

        {reportGenerated && (
          <div className="mt-5 rounded-xl bg-[#080D1B] border border-[#35D6F2]/30 p-4">
            <p className="text-xs font-medium text-[#35D6F2] mb-1">
              Spoken Daily Report ({todayIso})
            </p>
            <p className="text-sm text-[#F4F7FC] leading-relaxed">
              {dailyReportSpeech}
            </p>
          </div>
        )}
      </section>

      {/* Today's Credit vs Payment Ratio & 7-Day Trend */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Today's Activity Split */}
        <div className="lg:col-span-5 rounded-2xl bg-[#10182A] border border-white/[0.08] p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-[#F4F7FC] mb-1">
              Today&apos;s Credit vs Payment Activity
            </h3>
            <p className="text-xs text-[#94A3B8] mb-5">
              Proportion of new udhaar issued versus collections received today.
            </p>

            <div className="h-3 w-full rounded-full bg-[#080D1B] overflow-hidden flex">
              <div
                style={{ width: `${creditSharePct}%` }}
                className="bg-[#FFBD59] transition-all duration-300"
              />
              <div
                style={{ width: `${100 - creditSharePct}%` }}
                className="bg-[#35D39A] transition-all duration-300"
              />
            </div>

            <div className="flex items-center justify-between text-xs mt-3">
              <span className="text-[#FFBD59] font-mono-num">
                Credit: {formatINR(daily.creditToday)} ({creditSharePct}%)
              </span>
              <span className="text-[#35D39A] font-mono-num">
                Payments: {formatINR(daily.paymentsToday)} ({100 - creditSharePct}%)
              </span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.08] flex items-center justify-between text-xs text-[#94A3B8]">
            <span>7-Day Total Credit: {formatINR(radar.weekCredit)}</span>
            <span>7-Day Collection: {formatINR(radar.weekCollection)}</span>
          </div>
        </div>

        {/* 7-Day Financial Trend */}
        <div className="lg:col-span-7 rounded-2xl bg-[#10182A] border border-white/[0.08] p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <div>
              <h3 className="font-display text-base font-semibold text-[#F4F7FC]">
                7-Day Financial Trend
              </h3>
              <p className="text-xs text-[#94A3B8]">
                Daily credit issued vs payments collected
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-[#94A3B8]">
              <span className="text-[#FFBD59]">Amber: Credit</span>
              <span className="text-[#35D39A]">Emerald: Payment</span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-40 pt-4">
            {radar.weekTrends.map((day) => {
              const creditH = Math.max(4, Math.round((day.credit / maxWeekVal) * 112));
              const payH = Math.max(4, Math.round((day.payment / maxWeekVal) * 112));
              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center justify-end gap-2 h-full"
                >
                  <div className="flex items-end gap-1.5 h-28">
                    <div
                      style={{ height: `${creditH}px` }}
                      title={`${day.date} Credit: ${formatINR(day.credit)}`}
                      className="w-3 rounded-t bg-[#FFBD59]/85"
                    />
                    <div
                      style={{ height: `${payH}px` }}
                      title={`${day.date} Payment: ${formatINR(day.payment)}`}
                      className="w-3 rounded-t bg-[#35D39A]/85"
                    />
                  </div>
                  <span className="text-[11px] text-[#94A3B8] font-mono-num">
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Udhaar Radar Operational Panels */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Highest Outstanding Customers */}
        <div className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6">
          <h3 className="font-display text-base font-semibold text-[#F4F7FC] mb-4">
            Highest Outstanding Balances
          </h3>
          {radar.highestOutstanding.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-6">
              All customer balances are currently settled.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {radar.highestOutstanding.map((item) => (
                <button
                  key={item.customer.id}
                  type="button"
                  onClick={() => onSelectCustomer(item.customer.id)}
                  className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] rounded-lg px-1 cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-medium text-[#F4F7FC]">
                      {item.customer.name}
                    </p>
                    <p className="text-xs text-[#94A3B8]">
                      Total credit {formatINR(item.totalCredit)} · Paid{' '}
                      {formatINR(item.totalPayments)}
                    </p>
                  </div>
                  <span className="font-mono-num text-base font-semibold text-[#FFBD59]">
                    {formatINR(item.outstanding)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent Payment Activity */}
        <div className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6">
          <h3 className="font-display text-base font-semibold text-[#F4F7FC] mb-4">
            Recent Payment Activity
          </h3>
          {radar.recentPayments.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-6">No payments recorded yet.</p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {radar.recentPayments.map((tx) => (
                <button
                  key={tx.id}
                  type="button"
                  onClick={() => onSelectCustomer(tx.customer_id)}
                  className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] rounded-lg px-1 cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#F4F7FC] truncate">
                      {tx.customer_name}
                    </p>
                    <p className="text-xs text-[#94A3B8] truncate">
                      {tx.date} · &ldquo;{tx.original_utterance}&rdquo;
                    </p>
                  </div>
                  <span className="font-mono-num text-base font-semibold text-[#35D39A] shrink-0">
                    +{formatINR(tx.amount)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Frequently Corrected Transactions */}
        <div className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6">
          <h3 className="font-display text-base font-semibold text-[#F4F7FC] mb-1">
            Frequently Corrected Accounts
          </h3>
          <p className="text-xs text-[#94A3B8] mb-4">
            Tracked by Khata Echo audit logs
          </p>
          {radar.frequentlyCorrected.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-4">
              No spoken corrections recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {radar.frequentlyCorrected.map((item) => (
                <button
                  key={item.customer.id}
                  type="button"
                  onClick={() => onSelectCustomer(item.customer.id)}
                  className="w-full py-3 flex items-center justify-between text-left hover:bg-white/[0.02] rounded-lg px-1 cursor-pointer"
                >
                  <span className="text-sm font-medium text-[#F4F7FC]">
                    {item.customer.name}
                  </span>
                  <span className="font-mono-num text-xs text-[#8B72FF]">
                    {item.correctionCount} correction events
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Unusual Transaction Patterns (Labeled Estimate) */}
        <div className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-display text-base font-semibold text-[#F4F7FC]">
              Unusual Transaction Patterns
            </h3>
            <span className="text-xs text-[#8B72FF] font-medium">
              Estimate (Heuristic)
            </span>
          </div>
          <p className="text-xs text-[#94A3B8] mb-4">
            Transactions &ge; 2.2x your shop average ({formatINR(radar.avgTxAmount)})
          </p>
          {radar.unusualPatterns.length === 0 ? (
            <p className="text-sm text-[#94A3B8] py-4">
              All recent entries fall within normal shop ticket size.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {radar.unusualPatterns.map((item) => (
                <button
                  key={item.transaction.id}
                  type="button"
                  onClick={() => onSelectCustomer(item.transaction.customer_id)}
                  className="w-full py-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] rounded-lg px-1 cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-medium text-[#F4F7FC]">
                      {item.transaction.customer_name}
                    </p>
                    <p className="text-xs text-[#94A3B8]">
                      {item.transaction.date} · {item.transaction.type}
                    </p>
                  </div>
                  <span className="font-mono-num text-xs font-medium text-[#FFBD59]">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
