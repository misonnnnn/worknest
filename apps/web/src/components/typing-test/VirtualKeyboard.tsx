'use client';

import { KEYBOARD_ROWS, charToKeyId } from '@/lib/typing-test/engine';
import { cn } from '@/lib/utils';

type VirtualKeyboardProps = {
  expectedChar: string | null;
  pressedKey: string | null;
};

export function VirtualKeyboard({ expectedChar, pressedKey }: VirtualKeyboardProps) {
  const expectedKey = expectedChar ? charToKeyId(expectedChar) : null;

  return (
    <div className="mt-10 flex flex-col items-center gap-1.5 select-none" aria-hidden>
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-1"
          style={{ paddingLeft: rowIndex === 1 ? '1rem' : rowIndex === 2 ? '2rem' : 0 }}
        >
          {row.map((key) => (
            <KeyCap
              key={key}
              label={key}
              active={pressedKey === key}
              expected={expectedKey === key}
            />
          ))}
        </div>
      ))}
      <KeyCap
        label="space"
        wide
        active={pressedKey === 'space'}
        expected={expectedKey === 'space'}
      />
    </div>
  );
}

function KeyCap({
  label,
  wide,
  active,
  expected,
}: {
  label: string;
  wide?: boolean;
  active?: boolean;
  expected?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex h-10 items-center justify-center rounded-md border text-xs font-medium uppercase transition-colors',
        wide ? 'w-56' : 'w-9 sm:w-10',
        expected && 'border-primary bg-primary/10 text-primary',
        active && 'scale-95 border-foreground/40 bg-muted',
        !expected && !active && 'border-border/60 bg-background text-muted-foreground',
      )}
    >
      {wide ? 'space' : label}
    </div>
  );
}

export function keyEventToId(key: string): string | null {
  if (key === ' ') return 'space';
  if (key.length === 1 && /[a-zA-Z]/.test(key)) return key.toLowerCase();
  return null;
}
