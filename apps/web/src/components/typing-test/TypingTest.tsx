'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TypingTextCategory } from '@worknest/types';
import {
  TEXT_CATEGORY_LABELS,
  TIME_MODE_OPTIONS,
  WORD_MODE_OPTIONS,
  type TypingConfig,
} from '@/lib/typing-test/engine';
import { modeLabel, useTypingTest } from '@/lib/typing-test/use-typing-test';
import { TypingStatsBar } from '@/components/typing-test/TypingStats';
import { TypingText } from '@/components/typing-test/TypingText';
import { VirtualKeyboard, keyEventToId } from '@/components/typing-test/VirtualKeyboard';
import { TypingResult } from '@/components/typing-test/TypingResult';
import { apiRequest, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function TypingTest() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [modeType, setModeType] = useState<'time' | 'words'>('time');
  const [modeValue, setModeValue] = useState(60);
  const [category, setCategory] = useState<TypingTextCategory>('general');
  const [savedRank, setSavedRank] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  const config: TypingConfig = useMemo(
    () => ({ modeType, modeValue, category }),
    [modeType, modeValue, category],
  );

  const {
    text,
    typed,
    phase,
    stats,
    pressedKey,
    setPressedKey,
    expectedChar,
    handleInput,
    handleBackspace,
    restart,
    getResult,
  } = useTypingTest(config);

  const submitResult = useCallback(async () => {
    if (submittedRef.current || phase !== 'finished') return;
    submittedRef.current = true;
    setSubmitError(null);
    try {
      const result = getResult();
      await apiRequest('/typing-tests/results', { method: 'POST', body: result });
      const lb = await apiRequest<{ myRank: number | null }>('/typing-tests/leaderboard', {
        query: {
          period: 'all',
          mode: result.mode,
          modeValue: result.modeValue,
          page: 1,
          pageSize: 1,
        },
      });
      setSavedRank(lb.myRank);
    } catch (err) {
      submittedRef.current = false;
      setSubmitError(err instanceof ApiClientError ? err.message : 'Failed to save result');
    }
  }, [phase, getResult]);

  useEffect(() => {
    if (phase === 'finished') {
      void submitResult();
    }
  }, [phase, submitResult]);

  useEffect(() => {
    submittedRef.current = false;
    setSavedRank(null);
    setSubmitError(null);
  }, [config.modeType, config.modeValue, config.category]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        restart();
        submittedRef.current = false;
        setSavedRank(null);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        router.push('/dashboard');
        return;
      }

      if (phase === 'finished') return;

      const keyId = keyEventToId(e.key);
      if (keyId) setPressedKey(keyId);

      if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
        return;
      }

      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        handleInput(e.key);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const keyId = keyEventToId(e.key);
      if (keyId) setPressedKey(null);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [phase, handleInput, handleBackspace, restart, router, setPressedKey]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const handleRestart = () => {
    submittedRef.current = false;
    setSavedRank(null);
    setSubmitError(null);
    restart();
  };

  const settingsDisabled = phase === 'running';

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="mx-auto flex min-h-[calc(100vh-12rem)] max-w-4xl flex-col outline-none"
    >
      {/* Mode controls */}
      <div className="mb-8 flex flex-wrap items-center justify-center gap-3 text-sm">
        <Select
          value={modeType}
          onValueChange={(v) => {
            const next = (v ?? 'time') as 'time' | 'words';
            setModeType(next);
            setModeValue(next === 'time' ? 60 : 25);
          }}
          disabled={settingsDisabled}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="time">Time</SelectItem>
            <SelectItem value="words">Words</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={String(modeValue)}
          onValueChange={(v) => setModeValue(Number(v))}
          disabled={settingsDisabled}
        >
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(modeType === 'time' ? TIME_MODE_OPTIONS : WORD_MODE_OPTIONS).map((v) => (
              <SelectItem key={v} value={String(v)}>
                {modeLabel(modeType, v)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={category}
          onValueChange={(v) => setCategory((v ?? 'general') as TypingTextCategory)}
          disabled={settingsDisabled}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(TEXT_CATEGORY_LABELS) as TypingTextCategory[]).map((cat) => (
              <SelectItem key={cat} value={cat}>
                {TEXT_CATEGORY_LABELS[cat]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {phase === 'finished' ? (
        <>
          {submitError ? (
            <p className="mb-4 text-center text-sm text-destructive">{submitError}</p>
          ) : null}
          <TypingResult result={getResult()} rank={savedRank} onRestart={handleRestart} />
        </>
      ) : (
        <>
          <TypingStatsBar
            stats={stats}
            modeType={modeType}
            modeValue={modeValue}
            phase={phase}
          />

          <div className="mt-12 flex flex-1 flex-col items-center justify-center px-4">
            <TypingText text={text} typed={typed} />
            <VirtualKeyboard expectedChar={expectedChar} pressedKey={pressedKey} />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <span>
              <kbd className="rounded border px-1.5 py-0.5 font-mono">tab</kbd> restart
            </span>
            <span>
              <kbd className="rounded border px-1.5 py-0.5 font-mono">esc</kbd> exit
            </span>
            <Button variant="ghost" size="sm" onClick={handleRestart}>
              Restart
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')}>
              Exit
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
