'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { NumberMemoryBest } from '@worknest/types';
import { apiRequest, ApiClientError } from '@/lib/api';
import { useAuth } from '@/components/auth-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DISPLAY_MS, generateNumber, MAX_DIGITS, STARTING_DIGITS } from '@/lib/number-memory';

type Phase = 'idle' | 'showing' | 'recalling' | 'correct' | 'over';

export function NumberMemory() {
  const { can } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('idle');
  const [digits, setDigits] = useState(STARTING_DIGITS);
  const [number, setNumber] = useState('');
  const [guess, setGuess] = useState('');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const [reachedMax, setReachedMax] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    async function loadBest() {
      try {
        const result = await apiRequest<NumberMemoryBest>('/number-memory/my-best');
        setBest(result.maxDigits);
      } catch {
        // Personal best is optional if the request fails
      }
    }
    void loadBest();
  }, []);

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    if (phase === 'recalling') {
      inputRef.current?.focus();
    }
  }, [phase]);

  const saveResult = useCallback(
    async (maxDigits: number) => {
      if (maxDigits < 1 || !can('number-memory.play')) return;
      setSaving(true);
      setSubmitError(null);
      try {
        await apiRequest('/number-memory/results', {
          method: 'POST',
          body: { maxDigits },
        });
        setBest((current) => {
          if (maxDigits > current) {
            setNewBest(true);
            return maxDigits;
          }
          return current;
        });
      } catch (err) {
        setSubmitError(err instanceof ApiClientError ? err.message : 'Failed to save score');
      } finally {
        setSaving(false);
      }
    },
    [can],
  );

  const showNumber = useCallback((length: number) => {
    clearTimer();
    checkingRef.current = false;
    setNumber(generateNumber(length));
    setGuess('');
    setDigits(length);
    setPhase('showing');
    timerRef.current = setTimeout(() => {
      setPhase('recalling');
    }, DISPLAY_MS);
  }, []);

  const startGame = () => {
    setSubmitError(null);
    setNewBest(false);
    setReachedMax(false);
    setScore(0);
    showNumber(STARTING_DIGITS);
  };

  const finishGame = useCallback(
    (maxDigits: number, won: boolean) => {
      setScore(maxDigits);
      setReachedMax(won);
      setPhase('over');
      void saveResult(maxDigits);
    },
    [saveResult],
  );

  const handleGuess = useCallback(
    (value: string, { allowPartial = false }: { allowPartial?: boolean } = {}) => {
      if (checkingRef.current || phase !== 'recalling') return;
      if (!allowPartial && value.length !== number.length) return;
      if (allowPartial && value.length === 0) return;
      checkingRef.current = true;

      if (value === number) {
        if (digits >= MAX_DIGITS) {
          finishGame(digits, true);
          return;
        }
        setPhase('correct');
        timerRef.current = setTimeout(() => {
          showNumber(digits + 1);
        }, 700);
        return;
      }

      finishGame(digits > STARTING_DIGITS ? digits - 1 : 0, false);
    },
    [digits, finishGame, number, phase, showNumber],
  );

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-8 text-center">
      {phase === 'idle' ? (
        <>
          <p className="text-sm text-muted-foreground">
            A number appears for {DISPLAY_MS / 1000} seconds. Memorize it, then type it back.
            Each round adds one digit.
          </p>
          <BestLabel best={best} />
          <Button className="mt-8" onClick={startGame}>
            Start
          </Button>
        </>
      ) : null}

      {phase === 'showing' || phase === 'correct' ? (
        <>
          <RoundLabel digits={digits} />
          {phase === 'correct' ? (
            <p className="mt-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">Correct</p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Memorize</p>
          )}
          <p className="mt-8 border-l-2 border-muted-foreground/30 pl-5 font-mono text-4xl font-medium tracking-[0.2em] tabular-nums sm:text-5xl">
            {number}
          </p>
        </>
      ) : null}

      {phase === 'recalling' ? (
        <>
          <RoundLabel digits={digits} />
          <p className="mt-2 text-sm text-muted-foreground">What was the number?</p>
          <form
            className="mt-8 w-full max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              handleGuess(guess, { allowPartial: true });
            }}
          >
            <Input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={guess}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '').slice(0, number.length);
                setGuess(next);
                if (next.length === number.length) {
                  handleGuess(next);
                }
              }}
              className="h-12 text-center font-mono text-2xl tracking-[0.2em] tabular-nums"
            />
            <p className="mt-2 text-xs tabular-nums text-muted-foreground">
              {guess.length}/{number.length}
            </p>
          </form>
        </>
      ) : null}

      {phase === 'over' ? (
        <>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {reachedMax ? 'Max level' : 'Game over'}
          </p>
          <p className="mt-6 font-mono text-5xl font-medium tabular-nums">{score}</p>
          <p className="text-sm text-muted-foreground">
            {score === 1 ? 'digit remembered' : 'digits remembered'}
          </p>

          {!reachedMax ? (
            <dl className="mt-8 grid w-full max-w-sm grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-left text-sm">
              <dt className="text-muted-foreground">The number</dt>
              <dd className="font-mono tabular-nums tracking-wider">{number}</dd>
              <dt className="text-muted-foreground">You typed</dt>
              <dd className="font-mono tabular-nums tracking-wider text-destructive">{guess || '—'}</dd>
            </dl>
          ) : null}

          {newBest ? (
            <p className="mt-4 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              New personal best
            </p>
          ) : (
            <BestLabel best={best} className="mt-4" />
          )}

          {saving ? <p className="mt-2 text-xs text-muted-foreground">Saving score…</p> : null}
          {submitError ? <p className="mt-2 text-sm text-destructive">{submitError}</p> : null}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button onClick={startGame}>Play again</Button>
            <Button variant="outline" asChild>
              <Link href="/number-memory/leaderboard">Leaderboard</Link>
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function RoundLabel({ digits }: { digits: number }) {
  return (
    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
      Round {digits - STARTING_DIGITS + 1} · {digits} digits
    </p>
  );
}

function BestLabel({ best, className }: { best: number; className?: string }) {
  if (!best) return null;
  return (
    <p className={className ?? 'mt-4 text-sm text-muted-foreground'}>
      Personal best:{' '}
      <span className="font-medium text-foreground">
        {best} {best === 1 ? 'digit' : 'digits'}
      </span>
    </p>
  );
}
