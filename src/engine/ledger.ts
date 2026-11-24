import {
  ConversationContext,
  CustomerSummary,
  ExtractedIntent,
  KhataCustomer,
  KhataTransaction,
  LanguageCode,
  PendingClarification,
  TransactionDirection,
} from '../types/khata';

export function getLocalIsoDate(offsetDays = 0): string {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolveRelativeDate(token: string | null | undefined): string {
  if (!token) return getLocalIsoDate(0);
  const normalized = token.trim().toUpperCase();
  if (normalized === 'TODAY' || normalized === 'AAJ') return getLocalIsoDate(0);
  if (normalized === 'YESTERDAY' || normalized === 'KAL') return getLocalIsoDate(-1);
  if (normalized === 'DAY_BEFORE' || normalized === 'PARSO') return getLocalIsoDate(-2);
  if (/^\d{4}-\d{2}-\d{2}$/.test(token.trim())) {
    return token.trim();
  }
  return getLocalIsoDate(0);
}

export function formatINR(amount: number): string {
  const abs = Math.abs(Math.round(amount * 100) / 100);
  const formatted = abs.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-₹${formatted}` : `₹${formatted}`;
}

/**
 * Deterministic ledger calculation:
 * Only transactions with status === 'CONFIRMED' affect live financial balances.
 * When a transaction is corrected, the old one transitions to status === 'CORRECTED'
 * and the new CORRECTION transaction (status === 'CONFIRMED') carries the active amount & direction.
 * When a transaction is reversed, the target transitions to status === 'REVERSED'
 * and a REVERSAL audit log entry is added (REVERSAL does not add/subtract balance again).
 */
export function getActiveBalanceTransactions(transactions: KhataTransaction[]): KhataTransaction[] {
  return transactions.filter(
    (tx) =>
      tx.status === 'CONFIRMED' &&
      (tx.type === 'CREDIT' || tx.type === 'PAYMENT' || tx.type === 'CORRECTION')
  );
}

export function getEffectiveDirection(tx: KhataTransaction): TransactionDirection {
  if (tx.type === 'CREDIT') return 'CREDIT';
  if (tx.type === 'PAYMENT') return 'PAYMENT';
  return tx.direction;
}

export function computeCustomerSummary(
  customer: KhataCustomer,
  transactions: KhataTransaction[]
): CustomerSummary {
  const customerTxs = transactions
    .filter((tx) => tx.customer_id === customer.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const activeTxs = getActiveBalanceTransactions(customerTxs);

  let totalCredit = 0;
  let totalPayments = 0;
  for (const tx of activeTxs) {
    const dir = getEffectiveDirection(tx);
    if (dir === 'CREDIT') {
      totalCredit += tx.amount;
    } else {
      totalPayments += tx.amount;
    }
  }

  const correctionCount = customerTxs.filter(
    (tx) => tx.type === 'CORRECTION' || tx.status === 'CORRECTED'
  ).length;

  return {
    customer,
    totalCredit,
    totalPayments,
    outstanding: totalCredit - totalPayments,
    lastTransaction: customerTxs[0] ?? null,
    transactionCount: customerTxs.length,
    correctionCount,
  };
}

export function computeAllCustomerSummaries(
  customers: KhataCustomer[],
  transactions: KhataTransaction[]
): CustomerSummary[] {
  return customers.map((c) => computeCustomerSummary(c, transactions));
}

export function computeDailyMetrics(transactions: KhataTransaction[], dateIso = getLocalIsoDate(0)) {
  const dayTxs = transactions.filter((tx) => tx.date === dateIso);
  const activeDayTxs = getActiveBalanceTransactions(dayTxs);

  let creditToday = 0;
  let paymentsToday = 0;
  for (const tx of activeDayTxs) {
    const dir = getEffectiveDirection(tx);
    if (dir === 'CREDIT') creditToday += tx.amount;
    else paymentsToday += tx.amount;
  }

  const correctionsToday = dayTxs.filter(
    (tx) => tx.type === 'CORRECTION' || tx.type === 'REVERSAL'
  ).length;

  return {
    date: dateIso,
    creditToday,
    paymentsToday,
    netOutstandingChange: creditToday - paymentsToday,
    transactionCount: dayTxs.filter((tx) => tx.status === 'CONFIRMED').length,
    correctionsToday,
  };
}

export function computeGlobalOutstanding(
  customers: KhataCustomer[],
  transactions: KhataTransaction[]
): {
  totalOutstanding: number;
  activeCustomersWithBalance: number;
  highestOutstandingCustomer: CustomerSummary | null;
} {
  const summaries = computeAllCustomerSummaries(customers, transactions);
  const totalOutstanding = summaries.reduce((sum, s) => sum + s.outstanding, 0);
  const activeCustomersWithBalance = summaries.filter((s) => s.outstanding > 0).length;
  const sorted = [...summaries].sort((a, b) => b.outstanding - a.outstanding);
  const highestOutstandingCustomer = sorted[0] && sorted[0].outstanding > 0 ? sorted[0] : null;
  return {
    totalOutstanding,
    activeCustomersWithBalance,
    highestOutstandingCustomer,
  };
}

export function computeWeeklyTrends(transactions: KhataTransaction[]) {
  const days: { date: string; label: string; credit: number; payment: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const iso = getLocalIsoDate(-i);
    const d = new Date(`${iso}T00:00:00`);
    const label = d.toLocaleDateString('en-IN', { weekday: 'short' });
    const m = computeDailyMetrics(transactions, iso);
    days.push({
      date: iso,
      label,
      credit: m.creditToday,
      payment: m.paymentsToday,
    });
  }
  return days;
}

export function computeUdhaarRadarInsights(
  customers: KhataCustomer[],
  transactions: KhataTransaction[]
) {
  const summaries = computeAllCustomerSummaries(customers, transactions);
  const highestOutstanding = [...summaries]
    .filter((s) => s.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 5);

  const recentPayments = transactions
    .filter(
      (tx) =>
        tx.status === 'CONFIRMED' &&
        (tx.type === 'PAYMENT' || (tx.type === 'CORRECTION' && tx.direction === 'PAYMENT'))
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const frequentlyCorrected = [...summaries]
    .filter((s) => s.correctionCount > 0)
    .sort((a, b) => b.correctionCount - a.correctionCount)
    .slice(0, 4);

  const activeTxs = getActiveBalanceTransactions(transactions);
  const avgTxAmount =
    activeTxs.length > 0
      ? activeTxs.reduce((sum, t) => sum + t.amount, 0) / activeTxs.length
      : 0;

  const unusualPatterns = activeTxs
    .filter((tx) => avgTxAmount > 0 && tx.amount >= avgTxAmount * 2.2)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4)
    .map((tx) => ({
      transaction: tx,
      ratio: Math.round((tx.amount / avgTxAmount) * 10) / 10,
      label: `${formatINR(tx.amount)} (${Math.round((tx.amount / avgTxAmount) * 10) / 10}x shop average)`,
    }));

  const weekTrends = computeWeeklyTrends(transactions);
  const weekCollection = weekTrends.reduce((sum, d) => sum + d.payment, 0);
  const weekCredit = weekTrends.reduce((sum, d) => sum + d.credit, 0);

  return {
    highestOutstanding,
    recentPayments,
    frequentlyCorrected,
    unusualPatterns,
    weekTrends,
    weekCollection,
    weekCredit,
    avgTxAmount: Math.round(avgTxAmount),
  };
}

/**
 * Deterministic fuzzy/prefix customer matcher.
 * Strips honorifics like "ji", "bhai", "sir", "amma", "anna" for matching while keeping exact matches prioritized.
 */
function normalizeNameToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b(ji|bhai|sir|madam|anna|akka|uncle|aunty|sahab)\b/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchCustomers(query: string, customers: KhataCustomer[]): KhataCustomer[] {
  const clean = normalizeNameToken(query);
  if (!clean) return [];

  // 1. Exact full name or alias match
  const exact = customers.filter((c) => {
    const nameNorm = normalizeNameToken(c.name);
    if (nameNorm === clean) return true;
    return c.aliases.some((a) => normalizeNameToken(a) === clean);
  });
  if (exact.length > 0) return exact;

  // 2. First-name or word-prefix match (e.g. "Ramesh" matches "Ramesh Kumar" & "Ramesh Sharma")
  const wordMatches = customers.filter((c) => {
    const words = normalizeNameToken(c.name).split(' ');
    const aliasWords = c.aliases.flatMap((a) => normalizeNameToken(a).split(' '));
    const allWords = [...words, ...aliasWords];
    if (allWords.some((w) => w === clean || w.startsWith(clean))) return true;
    if (normalizeNameToken(c.name).includes(clean)) return true;
    return false;
  });

  return wordMatches;
}

export interface LedgerExecutionResult {
  success: boolean;
  customers: KhataCustomer[];
  transactions: KhataTransaction[];
  context: ConversationContext;
  aiResponse: string;
  interpretedMeaning: string;
  transaction?: KhataTransaction;
  correctedFromAmount?: number | null;
  pendingClarification?: PendingClarification | null;
  queryResult?: {
    title: string;
    primaryValue: string;
    detail: string;
  };
}

function buildLocalizedAck(
  lang: LanguageCode,
  en: string,
  hi: string,
  kn?: string
): string {
  if (lang === 'hi' || lang === 'hinglish') return hi;
  if (lang === 'kn' || lang === 'kanglish') return kn ?? en;
  return en;
}

export function executeLedgerIntent(params: {
  utterance: string;
  intent: ExtractedIntent;
  customers: KhataCustomer[];
  transactions: KhataTransaction[];
  context: ConversationContext;
  resolvedCustomerId?: string;
}): LedgerExecutionResult {
  const { utterance, intent, customers, transactions, context, resolvedCustomerId } = params;
  const lang = intent.detectedLanguage || 'hinglish';
  const nowIso = new Date().toISOString();
  const contextFresh = Date.now() - context.updatedAt < 120_000;

  // Handle explicit customer creation
  if (intent.intent === 'ADD_CUSTOMER') {
    const name = intent.customerQuery?.trim();
    if (!name) {
      return {
        success: false,
        customers,
        transactions,
        context,
        aiResponse: buildLocalizedAck(
          lang,
          'Please tell me the customer name you would like to add.',
          'Kripya naye customer ka naam batayein.'
        ),
        interpretedMeaning: 'Add new customer (name missing)',
      };
    }

    const existing = matchCustomers(name, customers).filter(
      (c) => normalizeNameToken(c.name) === normalizeNameToken(name)
    );
    if (existing.length > 0) {
      return {
        success: false,
        customers,
        transactions,
        context,
        aiResponse: buildLocalizedAck(
          lang,
          `${existing[0].name} is already in your khata.`,
          `${existing[0].name} pehle se aapke khata mein hain.`
        ),
        interpretedMeaning: `Customer "${existing[0].name}" already exists`,
      };
    }

    const newCustomer: KhataCustomer = {
      id: `cust_${crypto.randomUUID().slice(0, 8)}`,
      name,
      phone: intent.phone ?? undefined,
      aliases: [name.split(' ')[0]],
      created_at: nowIso,
      reminder_opt_in: false,
    };

    const nextCustomers = [newCustomer, ...customers];
    return {
      success: true,
      customers: nextCustomers,
      transactions,
      context: {
        ...context,
        lastCustomerId: newCustomer.id,
        lastCustomerName: newCustomer.name,
        lastIntent: 'ADD_CUSTOMER',
        pendingClarification: null,
        updatedAt: Date.now(),
      },
      aiResponse: buildLocalizedAck(
        lang,
        `Added ${newCustomer.name} to your customer ledger.`,
        `${newCustomer.name} ko aapke khata mein jod diya gaya hai.`,
        `${newCustomer.name} avarannu nimma khatege serisalagide.`
      ),
      interpretedMeaning: `New customer added: ${newCustomer.name}${newCustomer.phone ? ` (${newCustomer.phone})` : ''}`,
    };
  }

  // Handle Closing Time / Daily Report
  if (intent.intent === 'DAILY_REPORT' || intent.queryScope === 'TODAY_SUMMARY') {
    const today = computeDailyMetrics(transactions, getLocalIsoDate(0));
    const global = computeGlobalOutstanding(customers, transactions);
    const netLabel =
      today.netOutstandingChange >= 0
        ? `increased by ${formatINR(today.netOutstandingChange)}`
        : `decreased by ${formatINR(Math.abs(today.netOutstandingChange))}`;

    const summaryText =
      lang === 'hi' || lang === 'hinglish'
        ? `Aaj aapne ${formatINR(today.creditToday)} ka udhaar likha aur ${formatINR(today.paymentsToday)} payment aaya. Net udhaar ${today.netOutstandingChange >= 0 ? `${formatINR(today.netOutstandingChange)} badha` : `${formatINR(Math.abs(today.netOutstandingChange))} ghata`}. Kul ${today.transactionCount} transactions hue.${global.highestOutstandingCustomer ? ` Sabse zyada baaki ${global.highestOutstandingCustomer.customer.name} ka ${formatINR(global.highestOutstandingCustomer.outstanding)} hai.` : ''}`
        : `Today you recorded ${formatINR(today.creditToday)} in credit transactions and received ${formatINR(today.paymentsToday)} in payments. Your outstanding balance ${netLabel}. You completed ${today.transactionCount} transactions today.`;

    return {
      success: true,
      customers,
      transactions,
      context: {
        ...context,
        lastIntent: 'DAILY_REPORT',
        pendingClarification: null,
        updatedAt: Date.now(),
      },
      aiResponse: summaryText,
      interpretedMeaning: 'Daily Closing Report · Today',
      queryResult: {
        title: "Today's Closing Summary",
        primaryValue: `${formatINR(today.creditToday)} Credit · ${formatINR(today.paymentsToday)} Paid`,
        detail: `${today.transactionCount} transactions · Net ${today.netOutstandingChange >= 0 ? '+' : ''}${formatINR(today.netOutstandingChange)}`,
      },
    };
  }

  // Handle Reversal / Undo
  if (intent.intent === 'REVERSAL' || intent.correctionTarget === 'UNDO_LAST') {
    const targetTx = context.lastTransactionId
      ? transactions.find((t) => t.id === context.lastTransactionId && t.status === 'CONFIRMED')
      : transactions.find((t) => t.status === 'CONFIRMED');

    if (!targetTx) {
      return {
        success: false,
        customers,
        transactions,
        context,
        aiResponse: buildLocalizedAck(
          lang,
          'There is no recent confirmed transaction to reverse.',
          'Reverse karne ke liye koi haal ka transaction nahi mila.'
        ),
        interpretedMeaning: 'Reversal requested (no active transaction found)',
      };
    }

    const updatedTxs = transactions.map((t) =>
      t.id === targetTx.id ? { ...t, status: 'REVERSED' as const } : t
    );

    const reversalEntry: KhataTransaction = {
      id: `tx_${crypto.randomUUID().slice(0, 8)}`,
      customer_id: targetTx.customer_id,
      customer_name: targetTx.customer_name,
      type: 'REVERSAL',
      direction: getEffectiveDirection(targetTx),
      amount: targetTx.amount,
      date: getLocalIsoDate(0),
      created_at: nowIso,
      original_utterance: utterance,
      status: 'CONFIRMED',
      corrected_from: targetTx.id,
      note: `Reversed ${getEffectiveDirection(targetTx)} of ${formatINR(targetTx.amount)}`,
    };

    return {
      success: true,
      customers,
      transactions: [reversalEntry, ...updatedTxs],
      context: {
        ...context,
        lastTransactionId: null,
        lastIntent: 'REVERSAL',
        pendingClarification: null,
        updatedAt: Date.now(),
      },
      transaction: reversalEntry,
      aiResponse: buildLocalizedAck(
        lang,
        `Reversed the ${formatINR(targetTx.amount)} ${getEffectiveDirection(targetTx).toLowerCase()} entry for ${targetTx.customer_name}.`,
        `${targetTx.customer_name} ki ${formatINR(targetTx.amount)} ki entry reverse kar di gayi hai.`
      ),
      interpretedMeaning: `Reversed ${targetTx.customer_name} · ${formatINR(targetTx.amount)}`,
    };
  }

  // Handle KHATA ECHO Correction
  if (intent.intent === 'CORRECTION') {
    const targetTx = context.lastTransactionId
      ? transactions.find((t) => t.id === context.lastTransactionId && t.status === 'CONFIRMED')
      : undefined;

    if (!targetTx) {
      return {
        success: false,
        customers,
        transactions,
        context,
        aiResponse: buildLocalizedAck(
          lang,
          'Which transaction would you like to correct? Please mention the customer and amount.',
          'Kaunsa hisaab sudharna hai? Kripya customer ka naam aur sahi rakam batayein.'
        ),
        interpretedMeaning: 'Correction requested without active transaction context',
      };
    }

    const newAmount = intent.amount;
    const newDirection: TransactionDirection =
      intent.newType === 'CREDIT' || intent.newType === 'PAYMENT'
        ? intent.newType
        : getEffectiveDirection(targetTx);

    if (newAmount === null || newAmount === undefined || !Number.isFinite(newAmount) || newAmount <= 0) {
      return {
        success: false,
        customers,
        transactions,
        context: {
          ...context,
          pendingClarification: {
            type: 'MISSING_AMOUNT',
            originalUtterance: utterance,
            intent,
          },
          updatedAt: Date.now(),
        },
        aiResponse: buildLocalizedAck(
          lang,
          `What is the corrected amount for ${targetTx.customer_name}?`,
          `${targetTx.customer_name} ke liye sahi rakam kitni likhni hai?`
        ),
        interpretedMeaning: `Correction for ${targetTx.customer_name} (awaiting amount)`,
      };
    }

    const updatedTxs = transactions.map((t) =>
      t.id === targetTx.id ? { ...t, status: 'CORRECTED' as const } : t
    );

    const correctionTx: KhataTransaction = {
      id: `tx_${crypto.randomUUID().slice(0, 8)}`,
      customer_id: targetTx.customer_id,
      customer_name: targetTx.customer_name,
      type: 'CORRECTION',
      direction: newDirection,
      amount: newAmount,
      date: targetTx.date,
      created_at: nowIso,
      original_utterance: utterance,
      status: 'CONFIRMED',
      corrected_from: targetTx.id,
      corrected_amount_from: targetTx.amount,
      note: `Khata Echo correction from ${formatINR(targetTx.amount)} to ${formatINR(newAmount)}`,
    };

    const nextTransactions = [correctionTx, ...updatedTxs];
    const nextContext: ConversationContext = {
      lastTransactionId: correctionTx.id,
      lastCustomerId: targetTx.customer_id,
      lastCustomerName: targetTx.customer_name,
      lastAmount: newAmount,
      lastType: newDirection,
      lastIntent: 'CORRECTION',
      pendingClarification: null,
      updatedAt: Date.now(),
    };

    return {
      success: true,
      customers,
      transactions: nextTransactions,
      context: nextContext,
      transaction: correctionTx,
      correctedFromAmount: targetTx.amount,
      aiResponse: buildLocalizedAck(
        lang,
        `Understood. Correcting the previous transaction for ${targetTx.customer_name} from ${formatINR(targetTx.amount)} to ${formatINR(newAmount)}.`,
        `Samajh gaya. ${targetTx.customer_name} ki pichli entry ${formatINR(targetTx.amount)} se badalkar ${formatINR(newAmount)} kar di gayi hai.`,
        `Arthavayitu. ${targetTx.customer_name} avara hindina lekka ${formatINR(targetTx.amount)} ninda ${formatINR(newAmount)} ge badalayisalagide.`
      ),
      interpretedMeaning: `Khata Echo · ${targetTx.customer_name} corrected ${formatINR(targetTx.amount)} → ${formatINR(newAmount)} (${newDirection})`,
    };
  }

  // Handle Conversational Queries
  if (intent.intent === 'QUERY') {
    const scope = intent.queryScope;

    if (scope === 'TODAY_CREDIT') {
      const m = computeDailyMetrics(transactions, resolveRelativeDate(intent.targetDate));
      return {
        success: true,
        customers,
        transactions,
        context: { ...context, lastIntent: 'QUERY', pendingClarification: null, updatedAt: Date.now() },
        aiResponse: buildLocalizedAck(
          lang,
          `Credit recorded for ${m.date === getLocalIsoDate(0) ? 'today' : m.date} is ${formatINR(m.creditToday)}.`,
          `${m.date === getLocalIsoDate(0) ? 'Aaj' : m.date} kul ${formatINR(m.creditToday)} ka udhaar gaya hai.`
        ),
        interpretedMeaning: `Query · Credit for ${m.date}`,
        queryResult: {
          title: 'Credit Given',
          primaryValue: formatINR(m.creditToday),
          detail: `Date: ${m.date}`,
        },
      };
    }

    if (scope === 'TODAY_PAYMENT') {
      const targetDate = resolveRelativeDate(intent.targetDate);
      const m = computeDailyMetrics(transactions, targetDate);
      const label = targetDate === getLocalIsoDate(-1) ? 'kal' : targetDate === getLocalIsoDate(0) ? 'aaj' : targetDate;
      return {
        success: true,
        customers,
        transactions,
        context: { ...context, lastIntent: 'QUERY', pendingClarification: null, updatedAt: Date.now() },
        aiResponse: buildLocalizedAck(
          lang,
          `Payments received on ${targetDate === getLocalIsoDate(-1) ? 'yesterday' : targetDate === getLocalIsoDate(0) ? 'today' : targetDate} total ${formatINR(m.paymentsToday)}.`,
          `${label === 'aaj' ? 'Aaj' : label === 'kal' ? 'Kal' : targetDate} kul ${formatINR(m.paymentsToday)} payment aaya hai.`
        ),
        interpretedMeaning: `Query · Payments for ${targetDate}`,
        queryResult: {
          title: 'Payments Received',
          primaryValue: formatINR(m.paymentsToday),
          detail: `Date: ${targetDate}`,
        },
      };
    }

    if (scope === 'HIGHEST_OUTSTANDING') {
      const global = computeGlobalOutstanding(customers, transactions);
      if (!global.highestOutstandingCustomer) {
        return {
          success: true,
          customers,
          transactions,
          context: { ...context, lastIntent: 'QUERY', pendingClarification: null, updatedAt: Date.now() },
          aiResponse: buildLocalizedAck(
            lang,
            'No customers currently have an outstanding balance.',
            'Abhi kisi bhi customer par koi baaki nahi hai.'
          ),
          interpretedMeaning: 'Query · Highest outstanding customer',
        };
      }
      const top = global.highestOutstandingCustomer;
      return {
        success: true,
        customers,
        transactions,
        context: {
          ...context,
          lastCustomerId: top.customer.id,
          lastCustomerName: top.customer.name,
          lastIntent: 'QUERY',
          pendingClarification: null,
          updatedAt: Date.now(),
        },
        aiResponse: buildLocalizedAck(
          lang,
          `${top.customer.name} has the highest outstanding balance at ${formatINR(top.outstanding)}.`,
          `Sabse zyada ${top.customer.name} ke paas ${formatINR(top.outstanding)} baaki hai.`
        ),
        interpretedMeaning: `Query · Highest outstanding (${top.customer.name})`,
        queryResult: {
          title: 'Highest Outstanding',
          primaryValue: formatINR(top.outstanding),
          detail: top.customer.name,
        },
      };
    }

    if (scope === 'WEEK_COLLECTION') {
      const radar = computeUdhaarRadarInsights(customers, transactions);
      return {
        success: true,
        customers,
        transactions,
        context: { ...context, lastIntent: 'QUERY', pendingClarification: null, updatedAt: Date.now() },
        aiResponse: buildLocalizedAck(
          lang,
          `Total collection over the last 7 days is ${formatINR(radar.weekCollection)}.`,
          `Is hafte kul ${formatINR(radar.weekCollection)} ka collection aaya hai.`
        ),
        interpretedMeaning: 'Query · Weekly payment collection',
        queryResult: {
          title: '7-Day Collection',
          primaryValue: formatINR(radar.weekCollection),
          detail: `Credit given this week: ${formatINR(radar.weekCredit)}`,
        },
      };
    }

    // Customer-specific query (CUSTOMER_BALANCE or LAST_PAYMENT)
    const customerResolution = resolveCustomerTarget({
      customerQuery: intent.customerQuery,
      resolvedCustomerId,
      customers,
      context,
      allowContextMatch: contextFresh && context.lastIntent !== 'QUERY',
      utterance,
      intent,
      lang,
    });

    if (customerResolution.clarification) {
      return {
        success: false,
        customers,
        transactions,
        context: {
          ...context,
          pendingClarification: customerResolution.clarification,
          updatedAt: Date.now(),
        },
        pendingClarification: customerResolution.clarification,
        aiResponse: customerResolution.question!,
        interpretedMeaning: `Clarification needed: ${customerResolution.question}`,
      };
    }

    const cust = customerResolution.customer;
    if (!cust) {
      const global = computeGlobalOutstanding(customers, transactions);
      return {
        success: true,
        customers,
        transactions,
        context: { ...context, lastIntent: 'QUERY', pendingClarification: null, updatedAt: Date.now() },
        aiResponse: buildLocalizedAck(
          lang,
          `Total outstanding across all customers is ${formatINR(global.totalOutstanding)}.`,
          `Sabhi customers ka kul baaki ${formatINR(global.totalOutstanding)} hai.`
        ),
        interpretedMeaning: 'Query · Total shop outstanding',
        queryResult: {
          title: 'Total Shop Outstanding',
          primaryValue: formatINR(global.totalOutstanding),
          detail: `${global.activeCustomersWithBalance} customers with active balance`,
        },
      };
    }

    const summary = computeCustomerSummary(cust, transactions);
    if (scope === 'LAST_PAYMENT') {
      const lastPay = transactions
        .filter(
          (tx) =>
            tx.customer_id === cust.id &&
            tx.status === 'CONFIRMED' &&
            getEffectiveDirection(tx) === 'PAYMENT'
        )
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

      if (!lastPay) {
        return {
          success: true,
          customers,
          transactions,
          context: { ...context, lastCustomerId: cust.id, lastCustomerName: cust.name, lastIntent: 'QUERY', updatedAt: Date.now() },
          aiResponse: buildLocalizedAck(
            lang,
            `${cust.name} has no recorded payments yet. Outstanding balance is ${formatINR(summary.outstanding)}.`,
            `${cust.name} ne abhi tak koi payment nahi kiya hai. Baaki ${formatINR(summary.outstanding)} hai.`
          ),
          interpretedMeaning: `Query · Last payment for ${cust.name}`,
          queryResult: {
            title: `${cust.name} · Last Payment`,
            primaryValue: 'No payments',
            detail: `Current balance: ${formatINR(summary.outstanding)}`,
          },
        };
      }

      return {
        success: true,
        customers,
        transactions,
        context: { ...context, lastCustomerId: cust.id, lastCustomerName: cust.name, lastIntent: 'QUERY', updatedAt: Date.now() },
        aiResponse: buildLocalizedAck(
          lang,
          `${cust.name}'s last payment was ${formatINR(lastPay.amount)} on ${lastPay.date}.`,
          `${cust.name} ne aakhri payment ${lastPay.date} ko ${formatINR(lastPay.amount)} diya tha.`
        ),
        interpretedMeaning: `Query · Last payment for ${cust.name}`,
        queryResult: {
          title: `${cust.name} · Last Payment`,
          primaryValue: formatINR(lastPay.amount),
          detail: `Date: ${lastPay.date} · Balance: ${formatINR(summary.outstanding)}`,
        },
      };
    }

    return {
      success: true,
      customers,
      transactions,
      context: {
        ...context,
        lastCustomerId: cust.id,
        lastCustomerName: cust.name,
        lastIntent: 'QUERY',
        pendingClarification: null,
        updatedAt: Date.now(),
      },
      aiResponse: buildLocalizedAck(
        lang,
        `${cust.name}'s total outstanding balance is ${formatINR(summary.outstanding)}.`,
        `${cust.name} ka kul ${formatINR(summary.outstanding)} baaki hai.`,
        `${cust.name} avara ottu baki ${formatINR(summary.outstanding)} ide.`
      ),
      interpretedMeaning: `Query · ${cust.name} outstanding balance`,
      queryResult: {
        title: `${cust.name} · Outstanding`,
        primaryValue: formatINR(summary.outstanding),
        detail: `Credit ${formatINR(summary.totalCredit)} · Paid ${formatINR(summary.totalPayments)}`,
      },
    };
  }

  // Handle CREDIT or PAYMENT
  if (intent.intent === 'CREDIT' || intent.intent === 'PAYMENT') {
    const direction: TransactionDirection = intent.intent;

    // Validate amount strictly — never silently guess!
    if (
      intent.amount === null ||
      intent.amount === undefined ||
      !Number.isFinite(intent.amount) ||
      intent.amount <= 0
    ) {
      const clarification: PendingClarification = {
        type: 'MISSING_AMOUNT',
        originalUtterance: utterance,
        intent,
      };
      return {
        success: false,
        customers,
        transactions,
        context: {
          ...context,
          pendingClarification: clarification,
          updatedAt: Date.now(),
        },
        pendingClarification: clarification,
        aiResponse: buildLocalizedAck(
          lang,
          'Could you repeat the exact rupee amount? I want to make sure the entry is accurate.',
          'Kripya sahi rakam dobara batayein taaki khata bilkul sahi rahe.'
        ),
        interpretedMeaning: `${direction} intent · amount unclear`,
      };
    }

    // Resolve customer — allow short-term thread binding for immediate follow-up PAYMENT after CREDIT,
    // but force explicit disambiguation if starting a fresh CREDIT after a QUERY or stale context.
    const allowContextForNewTx =
      contextFresh &&
      direction === 'PAYMENT' &&
      (context.lastIntent === 'CREDIT' || context.lastIntent === 'CORRECTION');

    const resolution = resolveCustomerTarget({
      customerQuery: intent.customerQuery,
      resolvedCustomerId,
      customers,
      context,
      allowContextMatch: allowContextForNewTx,
      utterance,
      intent,
      lang,
    });

    if (resolution.clarification) {
      return {
        success: false,
        customers,
        transactions,
        context: {
          ...context,
          pendingClarification: resolution.clarification,
          updatedAt: Date.now(),
        },
        pendingClarification: resolution.clarification,
        aiResponse: resolution.question!,
        interpretedMeaning: `Clarification needed: ${resolution.question}`,
      };
    }

    const customer = resolution.customer!;
    const txDate = resolveRelativeDate(intent.targetDate);
    const tx: KhataTransaction = {
      id: `tx_${crypto.randomUUID().slice(0, 8)}`,
      customer_id: customer.id,
      customer_name: customer.name,
      type: direction,
      direction,
      amount: Math.round(intent.amount * 100) / 100,
      date: txDate,
      created_at: nowIso,
      original_utterance: utterance,
      status: 'CONFIRMED',
      corrected_from: null,
    };

    const nextTransactions = [tx, ...transactions];
    const updatedSummary = computeCustomerSummary(customer, nextTransactions);

    const responseMsg =
      direction === 'CREDIT'
        ? buildLocalizedAck(
            lang,
            `${formatINR(tx.amount)} credit for ${customer.name} added. Total outstanding is ${formatINR(updatedSummary.outstanding)}.`,
            `${customer.name} ke khata mein ${formatINR(tx.amount)} udhaar joda gaya. Kul baaki ${formatINR(updatedSummary.outstanding)}.`,
            `${customer.name} khatege ${formatINR(tx.amount)} udhaar serisalagide.`
          )
        : buildLocalizedAck(
            lang,
            `${formatINR(tx.amount)} payment recorded for ${customer.name}. Remaining balance is ${formatINR(updatedSummary.outstanding)}.`,
            `${customer.name} ka ${formatINR(tx.amount)} payment darj ho gaya. Ab ${formatINR(updatedSummary.outstanding)} baaki hai.`,
            `${customer.name} avara ${formatINR(tx.amount)} pavati dakhalaagide.`
          );

    return {
      success: true,
      customers,
      transactions: nextTransactions,
      context: {
        lastTransactionId: tx.id,
        lastCustomerId: customer.id,
        lastCustomerName: customer.name,
        lastAmount: tx.amount,
        lastType: direction,
        lastIntent: direction,
        pendingClarification: null,
        updatedAt: Date.now(),
      },
      transaction: tx,
      aiResponse: responseMsg,
      interpretedMeaning: `${direction} · ${customer.name} · ${formatINR(tx.amount)} (${txDate === getLocalIsoDate(0) ? 'Today' : txDate})`,
    };
  }

  // Fallback for CLARIFICATION_NEEDED or UNKNOWN
  return {
    success: false,
    customers,
    transactions,
    context,
    aiResponse:
      intent.clarificationQuestion ||
      buildLocalizedAck(
        lang,
        'I did not catch the transaction clearly. Please say the customer name and amount, like "Ramesh ka 340 udhaar".',
        'Mujhe poora hisaab samajh nahi aaya. Kripya customer ka naam aur rakam batayein, jaise "Ramesh ka 340 udhaar".'
      ),
    interpretedMeaning: intent.interpretedMeaning || 'Needs clearer instruction',
  };
}

function resolveCustomerTarget(params: {
  customerQuery: string | null;
  resolvedCustomerId?: string;
  customers: KhataCustomer[];
  context: ConversationContext;
  allowContextMatch: boolean;
  utterance: string;
  intent: ExtractedIntent;
  lang: LanguageCode;
}): {
  customer?: KhataCustomer;
  clarification?: PendingClarification;
  question?: string;
} {
  const {
    customerQuery,
    resolvedCustomerId,
    customers,
    context,
    allowContextMatch,
    utterance,
    intent,
    lang,
  } = params;

  if (resolvedCustomerId) {
    const picked = customers.find((c) => c.id === resolvedCustomerId);
    if (picked) return { customer: picked };
  }

  if (!customerQuery || !customerQuery.trim()) {
    if (context.lastCustomerId && allowContextMatch) {
      const ctxCust = customers.find((c) => c.id === context.lastCustomerId);
      if (ctxCust) return { customer: ctxCust };
    }
    return {
      clarification: {
        type: 'MISSING_CUSTOMER',
        originalUtterance: utterance,
        intent,
        candidates: customers.slice(0, 4),
      },
      question: buildLocalizedAck(
        lang,
        'Which customer is this transaction for?',
        'Yeh hisaab kis customer ke liye hai?'
      ),
    };
  }

  const matches = matchCustomers(customerQuery, customers);

  if (matches.length === 1) {
    return { customer: matches[0] };
  }

  if (matches.length > 1) {
    // Check if the active thread already resolved one of these exact matches recently
    if (allowContextMatch && context.lastCustomerId) {
      const activeMatch = matches.find((m) => m.id === context.lastCustomerId);
      if (activeMatch) return { customer: activeMatch };
    }

    const candidateNames = matches.slice(0, 3).map((m) => m.name);
    const question =
      candidateNames.length === 2
        ? `${candidateNames[0]} or ${candidateNames[1]}?`
        : `Which customer: ${candidateNames.join(', ')}?`;

    return {
      clarification: {
        type: 'DISAMBIGUATE_CUSTOMER',
        originalUtterance: utterance,
        intent,
        candidates: matches,
      },
      question,
    };
  }

  // Zero matches — ask before adding or committing
  return {
    clarification: {
      type: 'CONFIRM_NEW_CUSTOMER',
      originalUtterance: utterance,
      intent,
      suggestedName: customerQuery.trim(),
      candidates: customers.slice(0, 3),
    },
    question: buildLocalizedAck(
      lang,
      `I couldn't find "${customerQuery.trim()}" in your khata. Would you like to add them as a new customer?`,
      `"${customerQuery.trim()}" khata mein nahi mile. Kya naya customer add kar doon?`
    ),
  };
}
