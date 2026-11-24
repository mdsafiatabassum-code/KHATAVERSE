export type LanguageCode = 'hi' | 'en' | 'kn' | 'hinglish' | 'kanglish';

export type PreferredLanguage = 'Hindi' | 'English' | 'Kannada' | 'Hinglish';

export type TransactionType = 'CREDIT' | 'PAYMENT' | 'CORRECTION' | 'REVERSAL';

export type TransactionDirection = 'CREDIT' | 'PAYMENT';

export type TransactionStatus = 'CONFIRMED' | 'CORRECTED' | 'REVERSED';

export interface KhataTransaction {
  id: string;
  customer_id: string;
  customer_name: string;
  type: TransactionType;
  /** For CORRECTION and REVERSAL entries, tracks whether the underlying entry was CREDIT or PAYMENT */
  direction: TransactionDirection;
  amount: number;
  /** ISO date YYYY-MM-DD in local shop calendar */
  date: string;
  /** ISO timestamp */
  created_at: string;
  original_utterance: string;
  status: TransactionStatus;
  corrected_from: string | null;
  corrected_amount_from?: number | null;
  note?: string;
}

export interface KhataCustomer {
  id: string;
  name: string;
  phone?: string;
  aliases: string[];
  created_at: string;
  reminder_opt_in: boolean;
}

export interface CustomerSummary {
  customer: KhataCustomer;
  totalCredit: number;
  totalPayments: number;
  outstanding: number;
  lastTransaction: KhataTransaction | null;
  transactionCount: number;
  correctionCount: number;
}

export type VoicePipelineState =
  | 'READY'
  | 'LISTENING'
  | 'UNDERSTANDING'
  | 'CONFIRMING'
  | 'TRANSACTION_SAVED'
  | 'ERROR';

export type ExtractedIntentType =
  | 'CREDIT'
  | 'PAYMENT'
  | 'CORRECTION'
  | 'REVERSAL'
  | 'QUERY'
  | 'ADD_CUSTOMER'
  | 'DAILY_REPORT'
  | 'CLARIFICATION_NEEDED'
  | 'UNKNOWN';

export type QueryScope =
  | 'CUSTOMER_BALANCE'
  | 'TODAY_CREDIT'
  | 'TODAY_PAYMENT'
  | 'HIGHEST_OUTSTANDING'
  | 'LAST_PAYMENT'
  | 'WEEK_COLLECTION'
  | 'TODAY_SUMMARY';

export interface ExtractedIntent {
  intent: ExtractedIntentType;
  customerQuery: string | null;
  phone: string | null;
  amount: number | null;
  targetDate: string; // 'TODAY' | 'YESTERDAY' | 'DAY_BEFORE' | YYYY-MM-DD
  correctionTarget: 'AMOUNT' | 'TYPE' | 'CUSTOMER' | 'UNDO_LAST' | null;
  newType: TransactionDirection | null;
  queryScope: QueryScope | null;
  detectedLanguage: LanguageCode;
  confidence: number;
  clarificationQuestion: string | null;
  interpretedMeaning: string;
}

export interface PendingClarification {
  type: 'DISAMBIGUATE_CUSTOMER' | 'MISSING_AMOUNT' | 'MISSING_CUSTOMER' | 'CONFIRM_NEW_CUSTOMER';
  originalUtterance: string;
  intent: ExtractedIntent;
  candidates?: KhataCustomer[];
  suggestedName?: string;
}

export interface ConversationContext {
  lastTransactionId: string | null;
  lastCustomerId: string | null;
  lastCustomerName: string | null;
  lastAmount: number | null;
  lastType: TransactionDirection | null;
  lastIntent: ExtractedIntentType | null;
  pendingClarification: PendingClarification | null;
  updatedAt: number;
}

export interface TranscriptLogEntry {
  id: string;
  utterance: string;
  interpretedMeaning: string;
  response: string;
  language: LanguageCode;
  createdAt: string;
  expiresAt: string;
}

export interface ShopSettings {
  shopName: string;
  preferredLanguage: PreferredLanguage;
  onboardingComplete: boolean;
  demoMode: boolean;
  voiceOutputEnabled: boolean;
  streamingTranscriptionPreferred: boolean;
}

export interface ConversationTurn {
  id: string;
  utterance: string;
  interpretedMeaning: string;
  aiResponse: string;
  detectedLanguage: LanguageCode;
  confidence: number;
  transaction?: KhataTransaction;
  correctedFromAmount?: number | null;
  pendingClarification?: PendingClarification | null;
  queryResult?: {
    title: string;
    primaryValue: string;
    detail: string;
  };
  error?: string;
  timestamp: string;
}
