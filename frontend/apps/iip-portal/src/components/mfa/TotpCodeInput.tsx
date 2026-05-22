import { useEffect, useRef } from 'react';

const LENGTH = 6;

interface TotpCodeInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
  invalid?: boolean;
  align?: 'center' | 'start';
}

export function TotpCodeInput({
  value,
  onChange,
  disabled = false,
  autoFocus = false,
  id = 'totp-code',
  invalid = false,
  align = 'center',
}: TotpCodeInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const digits = value.padEnd(LENGTH, ' ').slice(0, LENGTH).split('');

  useEffect(() => {
    if (!autoFocus || disabled) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [autoFocus, disabled]);

  const setFromString = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, LENGTH);
    onChange(next);
  };

  const focusInput = () => {
    if (!disabled) inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      <div className={`flex w-full ${align === 'center' ? 'justify-center' : 'justify-start'}`}>
        <div
          className={`relative cursor-text ${invalid ? 'totp-input-invalid' : ''}`}
          onClick={focusInput}
        >
          <div className="flex gap-2 sm:gap-2.5 pointer-events-none" aria-hidden>
            {digits.map((d, i) => (
              <div
                key={i}
                className={`flex h-12 w-10 sm:h-14 sm:w-11 items-center justify-center rounded-xl border text-xl font-semibold tabular-nums transition-colors ${
                  invalid
                    ? 'border-red-500/60 bg-red-500/5 text-red-700 dark:text-red-300'
                    : d.trim()
                      ? 'border-iip-primary/50 bg-iip-primary/5 text-iip-text'
                      : 'border-iip-border bg-iip-bg text-iip-text-muted'
                }`}
              >
                {d.trim() || '·'}
              </div>
            ))}
          </div>
          <input
            ref={inputRef}
            id={id}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={LENGTH}
            value={value}
            disabled={disabled}
            onChange={(e) => setFromString(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              setFromString(e.clipboardData.getData('text'));
            }}
            className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
            aria-label="6-digit authentication code"
          />
        </div>
      </div>
    </div>
  );
}
