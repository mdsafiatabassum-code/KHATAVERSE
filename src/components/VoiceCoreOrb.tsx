import React from 'react';
import { motion } from 'motion/react';
import { Check, Loader2, Mic, MicOff, Sparkles } from 'lucide-react';
import { VoicePipelineState } from '../types/khata';

interface VoiceCoreOrbProps {
  state: VoicePipelineState;
  volumeLevels: number[];
  size?: 'hero' | 'counter';
  onTap: () => void;
  disabled?: boolean;
  label?: string;
}

const STATE_LABELS: Record<VoicePipelineState, string> = {
  READY: 'READY',
  LISTENING: 'LISTENING',
  UNDERSTANDING: 'UNDERSTANDING',
  CONFIRMING: 'CONFIRMING',
  TRANSACTION_SAVED: 'TRANSACTION SAVED',
  ERROR: 'RETRY NEEDED',
};

export const VoiceCoreOrb: React.FC<VoiceCoreOrbProps> = ({
  state,
  volumeLevels,
  size = 'hero',
  onTap,
  disabled = false,
  label,
}) => {
  const isListening = state === 'LISTENING';
  const isUnderstanding = state === 'UNDERSTANDING';
  const isSaved = state === 'TRANSACTION_SAVED';
  const isConfirming = state === 'CONFIRMING';
  const isError = state === 'ERROR';

  const orbSize = size === 'counter' ? 'h-28 w-28 sm:h-32 sm:w-32' : 'h-24 w-24 sm:h-28 sm:w-28';
  const iconSize = size === 'counter' ? 36 : 30;

  const ringColor = isSaved
    ? 'border-[#35D39A]/50 shadow-[0_0_50px_rgba(53,211,154,0.28)]'
    : isListening
      ? 'border-[#35D6F2]/70 shadow-[0_0_64px_rgba(53,214,242,0.34)]'
      : isUnderstanding
        ? 'border-[#8B72FF]/60 shadow-[0_0_50px_rgba(139,114,255,0.28)]'
        : isConfirming
          ? 'border-[#FFBD59]/60 shadow-[0_0_45px_rgba(255,189,89,0.24)]'
          : isError
            ? 'border-rose-400/60 shadow-[0_0_40px_rgba(244,63,94,0.22)]'
            : 'border-[#35D6F2]/35 shadow-[0_0_36px_rgba(53,214,242,0.16)]';

  return (
    <div className="flex flex-col items-center justify-center select-none">
      {/* Live acoustic bars */}
      <div
        className="flex items-end justify-center gap-1 h-8 mb-4"
        aria-hidden="true"
      >
        {volumeLevels.map((lvl, idx) => {
          const heightPct = isListening
            ? Math.round(lvl * 100)
            : isUnderstanding
              ? 30 + ((idx * 17) % 45)
              : 18;
          return (
            <motion.span
              key={idx}
              animate={{
                scaleY: Math.max(0.18, heightPct / 100),
                opacity: isListening ? 0.95 : isUnderstanding ? 0.65 : 0.25,
              }}
              transition={{ duration: 0.12 }}
              className={`w-1 h-7 rounded-full origin-bottom ${
                isSaved
                  ? 'bg-[#35D39A]'
                  : isUnderstanding
                    ? 'bg-[#8B72FF]'
                    : isConfirming
                      ? 'bg-[#FFBD59]'
                      : 'bg-[#35D6F2]'
              }`}
            />
          );
        })}
      </div>

      {/* Central Interactive Microphone Core */}
      <div className="relative flex items-center justify-center">
        {isListening && (
          <>
            <motion.span
              initial={{ scale: 1, opacity: 0.55 }}
              animate={{ scale: 1.55, opacity: 0 }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full border border-[#35D6F2]/50 pointer-events-none"
            />
            <motion.span
              initial={{ scale: 1, opacity: 0.45 }}
              animate={{ scale: 1.32, opacity: 0 }}
              transition={{ duration: 1.6, delay: 0.5, repeat: Infinity, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full border border-[#8B72FF]/50 pointer-events-none"
            />
          </>
        )}

        <motion.button
          type="button"
          onClick={onTap}
          disabled={disabled || isUnderstanding}
          whileTap={{ scale: 0.94 }}
          aria-label={
            isListening
              ? 'Stop listening and process speech'
              : 'Start speaking to KHATAVERSE'
          }
          className={`relative ${orbSize} rounded-full flex items-center justify-center border bg-gradient-to-b from-[#16223B] to-[#0B1224] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#35D6F2] cursor-pointer disabled:opacity-60 ${ringColor}`}
        >
          <span className="absolute inset-2 rounded-full bg-gradient-to-tr from-[#35D6F2]/10 via-transparent to-[#8B72FF]/15 pointer-events-none" />
          {isUnderstanding ? (
            <Loader2 size={iconSize} className="text-[#8B72FF] animate-spin" />
          ) : isSaved ? (
            <Check size={iconSize} className="text-[#35D39A]" />
          ) : isError ? (
            <MicOff size={iconSize} className="text-rose-400" />
          ) : isConfirming ? (
            <Sparkles size={iconSize} className="text-[#FFBD59]" />
          ) : (
            <Mic
              size={iconSize}
              className={isListening ? 'text-[#35D6F2]' : 'text-[#F4F7FC]'}
            />
          )}
        </motion.button>
      </div>

      {/* State & Action Label */}
      <div className="mt-4 flex flex-col items-center gap-1 text-center">
        <span
          className={`text-xs font-medium tracking-[0.16em] ${
            isSaved
              ? 'text-[#35D39A]'
              : isListening
                ? 'text-[#35D6F2]'
                : isUnderstanding
                  ? 'text-[#8B72FF]'
                  : isConfirming
                    ? 'text-[#FFBD59]'
                    : isError
                      ? 'text-rose-400'
                      : 'text-[#94A3B8]'
          }`}
        >
          {STATE_LABELS[state]}
        </span>
        {label && (
          <span className="text-sm font-medium text-[#F4F7FC]/90">{label}</span>
        )}
      </div>
    </div>
  );
};
