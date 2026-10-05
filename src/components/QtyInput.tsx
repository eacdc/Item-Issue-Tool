import type { KeyboardEvent, Ref } from 'react';
import { sanitizeQuantityInput } from '../lib/quantity';

interface Props {
  value: string;
  onChange: (value: string) => void;
  unit: string | null | undefined;
  onEnter?: () => void;
  invalid?: boolean;
  label?: string;
  ref?: Ref<HTMLInputElement>;
  disabled?: boolean;
}

/**
 * Quantity entry: digits and one dot only, selects everything on focus so a
 * prefilled number is overwritten rather than appended to, Enter submits, and
 * the stock unit sits right next to the number so Kg and Sheet cannot be
 * confused.
 */
export function QtyInput({ value, onChange, unit, onEnter, invalid, label = 'Quantity', ref, disabled }: Props) {
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter?.();
    }
  }
  return (
    <span className={`qty-input${invalid ? ' is-invalid' : ''}`}>
      <input
        ref={ref}
        aria-label={label}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(sanitizeQuantityInput(e.target.value))}
        onFocus={(e) => e.currentTarget.select()}
        onMouseUp={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
      />
      <span className="unit">{unit ?? '?'}</span>
    </span>
  );
}
