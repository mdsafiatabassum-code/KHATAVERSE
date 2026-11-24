import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Copy,
  Edit3,
  MessageSquare,
  Phone,
  Plus,
  RotateCcw,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { useKhata } from '../context/KhataContext';
import {
  computeAllCustomerSummaries,
  computeCustomerSummary,
  formatINR,
  getEffectiveDirection,
} from '../engine/ledger';
import { KhataCustomer } from '../types/khata';

interface CustomersScreenProps {
  selectedCustomerId: string | null;
  onSelectCustomer: (id: string | null) => void;
}

type CustomerFilter = 'ALL' | 'HIGHEST_OUTSTANDING' | 'RECENT_ACTIVITY';

export const CustomersScreen: React.FC<CustomersScreenProps> = ({
  selectedCustomerId,
  onSelectCustomer,
}) => {
  const {
    customers,
    transactions,
    settings,
    addCustomerManual,
    updateCustomer,
    reverseTransaction,
  } = useKhata();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CustomerFilter>('HIGHEST_OUTSTANDING');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<KhataCustomer | null>(null);

  // Add/Edit form state
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAliases, setFormAliases] = useState('');
  const [formOptIn, setFormOptIn] = useState(false);

  // Reminder preview state
  const [showReminderPreview, setShowReminderPreview] = useState(false);
  const [copiedReminder, setCopiedReminder] = useState(false);

  const summaries = useMemo(
    () => computeAllCustomerSummaries(customers, transactions),
    [customers, transactions]
  );

  const filteredSummaries = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = summaries.filter((s) => {
      if (!q) return true;
      return (
        s.customer.name.toLowerCase().includes(q) ||
        s.customer.aliases.some((a) => a.toLowerCase().includes(q)) ||
        (s.customer.phone ?? '').includes(q)
      );
    });

    if (filter === 'HIGHEST_OUTSTANDING') {
      list = [...list].sort((a, b) => b.outstanding - a.outstanding);
    } else if (filter === 'RECENT_ACTIVITY') {
      list = [...list].sort((a, b) => {
        const ta = a.lastTransaction ? new Date(a.lastTransaction.created_at).getTime() : 0;
        const tb = b.lastTransaction ? new Date(b.lastTransaction.created_at).getTime() : 0;
        return tb - ta;
      });
    } else {
      list = [...list].sort((a, b) => a.customer.name.localeCompare(b.customer.name));
    }

    return list;
  }, [summaries, search, filter]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  const selectedSummary = useMemo(
    () =>
      selectedCustomer ? computeCustomerSummary(selectedCustomer, transactions) : null,
    [selectedCustomer, transactions]
  );

  const selectedTimeline = useMemo(() => {
    if (!selectedCustomer) return [];
    return transactions
      .filter((tx) => tx.customer_id === selectedCustomer.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [selectedCustomer, transactions]);

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormName('');
    setFormPhone('');
    setFormAliases('');
    setFormOptIn(false);
    setShowAddModal(true);
  };

  const openEditModal = (cust: KhataCustomer) => {
    setEditingCustomer(cust);
    setFormName(cust.name);
    setFormPhone(cust.phone ?? '');
    setFormAliases(cust.aliases.join(', '));
    setFormOptIn(cust.reminder_opt_in);
    setShowAddModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    const aliases = formAliases
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (editingCustomer) {
      await updateCustomer({
        ...editingCustomer,
        name: formName.trim(),
        phone: formPhone.trim() || undefined,
        aliases: aliases.length > 0 ? aliases : [formName.trim().split(' ')[0]],
        reminder_opt_in: formOptIn,
      });
    } else {
      const created = await addCustomerManual({
        name: formName.trim(),
        phone: formPhone.trim() || undefined,
        aliases,
        reminder_opt_in: formOptIn,
      });
      onSelectCustomer(created.id);
    }
    setShowAddModal(false);
  };

  const buildRespectfulReminder = (name: string, outstanding: number) => {
    return `Namaste ${name} ji, ${settings.shopName} ki taraf se ek vinamra yaad-dilaani: aapke khate mein abhi ${formatINR(outstanding)} baaki hai. Jab bhi suvidha ho, kripya payment kar dein. Dhanyavaad!`;
  };

  const handleCopyReminder = async (msg: string) => {
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedReminder(true);
      setTimeout(() => setCopiedReminder(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  // Profile View
  if (selectedCustomer && selectedSummary) {
    const reminderMessage = buildRespectfulReminder(
      selectedCustomer.name,
      selectedSummary.outstanding
    );

    return (
      <div className="space-y-6 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setShowReminderPreview(false);
              onSelectCustomer(null);
            }}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#94A3B8] hover:text-[#35D6F2] min-h-[40px] cursor-pointer"
          >
            <ArrowLeft size={16} />
            All Customers
          </button>

          <button
            type="button"
            onClick={() => openEditModal(selectedCustomer)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#10182A] border border-white/[0.1] text-sm font-medium text-[#F4F7FC] hover:border-[#35D6F2]/50 min-h-[40px] cursor-pointer"
          >
            <Edit3 size={15} />
            Edit Profile
          </button>
        </div>

        {/* Customer Statement Header */}
        <section className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-5 mb-5">
            <div>
              <h1 className="font-display text-2xl font-semibold text-[#F4F7FC]">
                {selectedCustomer.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#94A3B8] mt-1.5">
                {selectedCustomer.phone && (
                  <span className="inline-flex items-center gap-1 font-mono-num">
                    <Phone size={12} />
                    {selectedCustomer.phone}
                  </span>
                )}
                {selectedCustomer.aliases.length > 0 && (
                  <>
                    {selectedCustomer.phone && <span aria-hidden="true">·</span>}
                    <span>Aliases: {selectedCustomer.aliases.join(', ')}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>
                  Reminders:{' '}
                  {selectedCustomer.reminder_opt_in ? 'Opted in' : 'Opted out'}
                </span>
              </div>
            </div>

            <div className="text-left md:text-right">
              <p className="text-xs text-[#94A3B8]">Outstanding Balance</p>
              <p
                className={`font-mono-num text-3xl font-semibold ${
                  selectedSummary.outstanding > 0
                    ? 'text-[#FFBD59]'
                    : 'text-[#35D39A]'
                }`}
              >
                {formatINR(selectedSummary.outstanding)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-[#080D1B] border border-white/[0.06] p-4">
              <p className="text-xs text-[#94A3B8]">Total Credit Given</p>
              <p className="font-mono-num text-lg font-semibold text-[#FFBD59] mt-1">
                {formatINR(selectedSummary.totalCredit)}
              </p>
            </div>
            <div className="rounded-xl bg-[#080D1B] border border-white/[0.06] p-4">
              <p className="text-xs text-[#94A3B8]">Total Payments Received</p>
              <p className="font-mono-num text-lg font-semibold text-[#35D39A] mt-1">
                {formatINR(selectedSummary.totalPayments)}
              </p>
            </div>
            <div className="rounded-xl bg-[#080D1B] border border-white/[0.06] p-4">
              <p className="text-xs text-[#94A3B8]">Entries & Corrections</p>
              <p className="font-mono-num text-lg font-semibold text-[#F4F7FC] mt-1">
                {selectedSummary.transactionCount} total · {selectedSummary.correctionCount}{' '}
                edited
              </p>
            </div>
          </div>

          {/* Optional Opt-In Respectful Reminder Module */}
          {selectedSummary.outstanding > 0 && (
            <div className="mt-5 pt-5 border-t border-white/[0.08]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#F4F7FC]">
                    Respectful Payment Reminder (Optional)
                  </p>
                  <p className="text-xs text-[#94A3B8]">
                    Messages are never sent automatically. Preview and send only with
                    customer opt-in.
                  </p>
                </div>

                {selectedCustomer.reminder_opt_in ? (
                  <button
                    type="button"
                    onClick={() => setShowReminderPreview((v) => !v)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#152038] border border-[#35D6F2]/40 text-xs font-medium text-[#35D6F2] hover:bg-[#1a2846] min-h-[40px] cursor-pointer"
                  >
                    <MessageSquare size={14} />
                    {showReminderPreview ? 'Hide Reminder Preview' : 'Preview Reminder'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      void updateCustomer({
                        ...selectedCustomer,
                        reminder_opt_in: true,
                      })
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#080D1B] border border-white/[0.12] text-xs font-medium text-[#94A3B8] hover:text-[#F4F7FC] min-h-[40px] cursor-pointer"
                  >
                    Enable Opt-In Reminders
                  </button>
                )}
              </div>

              {showReminderPreview && selectedCustomer.reminder_opt_in && (
                <div className="mt-4 rounded-xl bg-[#080D1B] border border-white/[0.08] p-4 space-y-3">
                  <p className="text-xs text-[#94A3B8]">Preview before sending:</p>
                  <p className="text-sm text-[#F4F7FC] leading-relaxed">
                    {reminderMessage}
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void handleCopyReminder(reminderMessage)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#35D6F2] text-[#080D1B] text-xs font-semibold cursor-pointer"
                    >
                      {copiedReminder ? <Check size={14} /> : <Copy size={14} />}
                      {copiedReminder ? 'Copied Message' : 'Copy Polite Message'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void updateCustomer({
                          ...selectedCustomer,
                          reminder_opt_in: false,
                        })
                      }
                      className="text-xs text-[#94A3B8] hover:text-[#F4F7FC] cursor-pointer"
                    >
                      Opt out reminders
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Transaction Timeline */}
        <section className="rounded-2xl bg-[#10182A] border border-white/[0.08] p-6">
          <h2 className="font-display text-base font-semibold text-[#F4F7FC] mb-4">
            Account Statement & Audit History
          </h2>

          {selectedTimeline.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#94A3B8]">
              No transactions recorded for {selectedCustomer.name} yet.
            </p>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {selectedTimeline.map((tx) => {
                const dir = getEffectiveDirection(tx);
                const isCredit = dir === 'CREDIT';
                return (
                  <div
                    key={tx.id}
                    className={`py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      tx.status !== 'CONFIRMED' ? 'opacity-55' : ''
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`font-semibold ${
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
                        <span className="text-[#94A3B8]">·</span>
                        <span className="font-mono-num text-[#94A3B8]">{tx.date}</span>
                        <span className="text-[#94A3B8]">·</span>
                        <span className="text-[#94A3B8]">{tx.status}</span>
                        {tx.corrected_amount_from !== undefined &&
                          tx.corrected_amount_from !== null && (
                            <>
                              <span className="text-[#94A3B8]">·</span>
                              <span className="text-[#8B72FF]">
                                Edited from {formatINR(tx.corrected_amount_from)}
                              </span>
                            </>
                          )}
                      </div>
                      <p className="text-sm text-[#F4F7FC] mt-1">
                        &ldquo;{tx.original_utterance}&rdquo;
                      </p>
                      {tx.note && (
                        <p className="text-xs text-[#94A3B8] mt-0.5">{tx.note}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`font-mono-num text-base font-semibold ${
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
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#080D1B] border border-white/[0.08] text-xs text-[#94A3B8] hover:text-rose-300 cursor-pointer"
                        >
                          <RotateCcw size={13} />
                          Reverse
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Edit Modal if opened from profile */}
        {showAddModal && (
          <CustomerFormModal
            editing={Boolean(editingCustomer)}
            name={formName}
            phone={formPhone}
            aliases={formAliases}
            optIn={formOptIn}
            onChangeName={setFormName}
            onChangePhone={setFormPhone}
            onChangeAliases={setFormAliases}
            onChangeOptIn={setFormOptIn}
            onClose={() => setShowAddModal(false)}
            onSubmit={handleSaveCustomer}
          />
        )}
      </div>
    );
  }

  // Customer Directory List View
  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#F4F7FC]">
            Smart Customer Universe
          </h1>
          <p className="text-sm text-[#94A3B8]">
            {customers.length} customers · Say &ldquo;Naya customer Vikram add karo&rdquo;
            or add below
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#35D6F2] text-[#080D1B] font-semibold text-sm hover:bg-[#5ce0f6] min-h-[44px] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus size={17} />
          Add Customer
        </button>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name, alias (e.g. Sharma ji), or phone..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#10182A] border border-white/[0.1] text-sm text-[#F4F7FC] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#35D6F2]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#10182A] border border-white/[0.08] self-start">
          {(
            [
              { id: 'HIGHEST_OUTSTANDING', label: 'Highest Outstanding' },
              { id: 'RECENT_ACTIVITY', label: 'Recent Activity' },
              { id: 'ALL', label: 'A–Z' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                filter === tab.id
                  ? 'bg-[#35D6F2] text-[#080D1B]'
                  : 'text-[#94A3B8] hover:text-[#F4F7FC]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customer List */}
      <div className="rounded-2xl bg-[#10182A] border border-white/[0.08] overflow-hidden">
        {filteredSummaries.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <UserPlus size={28} className="mx-auto text-[#94A3B8] mb-3" />
            <p className="text-sm font-medium text-[#F4F7FC] mb-1">
              No customers match your search
            </p>
            <p className="text-xs text-[#94A3B8] mb-4">
              Add a customer manually or use voice in Counter Mode.
            </p>
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2 rounded-xl bg-[#35D6F2] text-[#080D1B] text-xs font-semibold cursor-pointer"
            >
              Add First Customer
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {filteredSummaries.map((s) => (
              <button
                key={s.customer.id}
                type="button"
                onClick={() => onSelectCustomer(s.customer.id)}
                className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-white/[0.03] transition-colors min-h-[68px] cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-base text-[#F4F7FC] truncate">
                      {s.customer.name}
                    </span>
                    {s.customer.aliases.length > 0 && (
                      <span className="text-xs text-[#94A3B8]">
                        · {s.customer.aliases[0]}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#94A3B8] mt-1 truncate">
                    Credit {formatINR(s.totalCredit)} · Paid {formatINR(s.totalPayments)}
                    {s.lastTransaction ? ` · Last: ${s.lastTransaction.date}` : ''}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p
                    className={`font-mono-num text-lg font-semibold ${
                      s.outstanding > 0 ? 'text-[#FFBD59]' : 'text-[#35D39A]'
                    }`}
                  >
                    {formatINR(s.outstanding)}
                  </p>
                  <p className="text-xs text-[#94A3B8]">
                    {s.outstanding > 0 ? 'Outstanding' : 'Settled'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <CustomerFormModal
          editing={Boolean(editingCustomer)}
          name={formName}
          phone={formPhone}
          aliases={formAliases}
          optIn={formOptIn}
          onChangeName={setFormName}
          onChangePhone={setFormPhone}
          onChangeAliases={setFormAliases}
          onChangeOptIn={setFormOptIn}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleSaveCustomer}
        />
      )}
    </div>
  );
};

interface CustomerFormModalProps {
  editing: boolean;
  name: string;
  phone: string;
  aliases: string;
  optIn: boolean;
  onChangeName: (v: string) => void;
  onChangePhone: (v: string) => void;
  onChangeAliases: (v: string) => void;
  onChangeOptIn: (v: boolean) => void;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  editing,
  name,
  phone,
  aliases,
  optIn,
  onChangeName,
  onChangePhone,
  onChangeAliases,
  onChangeOptIn,
  onClose,
  onSubmit,
}) => (
  <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="w-full max-w-md rounded-2xl bg-[#10182A] border border-white/[0.12] p-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-lg font-semibold text-[#F4F7FC]">
          {editing ? 'Edit Customer' : 'Add New Customer'}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close modal"
          className="p-2 text-[#94A3B8] hover:text-[#F4F7FC] cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
            Full Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => onChangeName(e.target.value)}
            placeholder="e.g. Vikram Gowda"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#080D1B] border border-white/[0.12] text-sm text-[#F4F7FC] focus:outline-none focus:border-[#35D6F2]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
            Phone Number (Optional)
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => onChangePhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#080D1B] border border-white/[0.12] text-sm text-[#F4F7FC] focus:outline-none focus:border-[#35D6F2]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
            Spoken Aliases (Comma separated)
          </label>
          <input
            type="text"
            value={aliases}
            onChange={(e) => onChangeAliases(e.target.value)}
            placeholder="e.g. Vikram bhai, Vicky"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#080D1B] border border-white/[0.12] text-sm text-[#F4F7FC] focus:outline-none focus:border-[#35D6F2]"
          />
        </div>

        <label className="flex items-center gap-2.5 text-xs text-[#94A3B8] cursor-pointer pt-1">
          <input
            type="checkbox"
            checked={optIn}
            onChange={(e) => onChangeOptIn(e.target.checked)}
            className="h-4 w-4 accent-[#35D6F2]"
          />
          Customer opted in for polite payment reminders
        </label>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-sm text-[#94A3B8] hover:text-[#F4F7FC] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-[#35D6F2] text-[#080D1B] text-sm font-semibold hover:bg-[#5ce0f6] cursor-pointer"
          >
            {editing ? 'Save Changes' : 'Add Customer'}
          </button>
        </div>
      </form>
    </div>
  </div>
);
