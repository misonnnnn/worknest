'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TypingTextCategory } from '@worknest/types';
import {
  calcAccuracy,
  calcRawWpm,
  calcWpm,
  countCompletedWords,
  generateTestText,
  type TypingConfig,
  type TypingModeType,
} from './engine';

export type TypingTestPhase = 'idle' | 'running' | 'finished';

export type TypingTestStats = {
  wpm: number;
  rawWpm: number;
  accuracy: number;
  correctCharacters: number;
  incorrectCharacters: number;
  totalCharacters: number;
  wordsCompleted: number;
  durationSeconds: number;
  elapsedSeconds: number;
  remainingSeconds: number;
};

export type TypingTestResult = TypingTestStats & {
  mode: 'TIME' | 'WORDS';
  modeValue: number;
  textCategory: TypingTextCategory;
};

function buildStats(
  text: string,
  typed: string,
  startedAt: number | null,
  finishedAt: number | null,
  config: TypingConfig,
): TypingTestStats {
  let correct = 0;
  let incorrect = 0;
  for (let i = 0; i < typed.length; i++) {
    if (i < text.length && typed[i] === text[i]) correct++;
    else incorrect++;
  }

  const total = typed.length;
  const now = finishedAt ?? Date.now();
  const durationSeconds = startedAt
    ? Math.max(1, Math.round((now - startedAt) / 1000))
    : 0;

  const elapsedSeconds = durationSeconds;
  const remainingSeconds =
    config.modeType === 'time'
      ? Math.max(0, config.modeValue - elapsedSeconds)
      : 0;

  return {
    wpm: calcWpm(correct, durationSeconds),
    rawWpm: calcRawWpm(total, durationSeconds),
    accuracy: calcAccuracy(correct, total),
    correctCharacters: correct,
    incorrectCharacters: incorrect,
    totalCharacters: total,
    wordsCompleted: countCompletedWords(text, typed.length),
    durationSeconds,
    elapsedSeconds,
    remainingSeconds,
  };
}

export function useTypingTest(config: TypingConfig) {
  const [text, setText] = useState(() => generateTestText(config));
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<TypingTestPhase>('idle');
  const [stats, setStats] = useState<TypingTestStats>(() =>
    buildStats('', '', null, null, config),
  );
  const [pressedKey, setPressedKey] = useState<string | null>(null);

  const startedAtRef = useRef<number | null>(null);
  const finishedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finishTest = useCallback(() => {
    if (phase === 'finished') return;
    clearTimer();
    finishedAtRef.current = Date.now();
    setPhase('finished');
    setStats(
      buildStats(
        text,
        typed,
        startedAtRef.current,
        finishedAtRef.current,
        configRef.current,
      ),
    );
  }, [clearTimer, phase, text, typed]);

  const restart = useCallback(() => {
    clearTimer();
    const newText = generateTestText(configRef.current);
    startedAtRef.current = null;
    finishedAtRef.current = null;
    setText(newText);
    setTyped('');
    setPhase('idle');
    setStats(buildStats(newText, '', null, null, configRef.current));
    setPressedKey(null);
  }, [clearTimer]);

  // Restart when config changes
  useEffect(() => {
    restart();
  }, [config.modeType, config.modeValue, config.category, restart]);

  // Timer tick for time mode
  useEffect(() => {
    if (phase !== 'running' || config.modeType !== 'time') return;

    timerRef.current = setInterval(() => {
      const started = startedAtRef.current;
      if (!started) return;

      const elapsed = Math.floor((Date.now() - started) / 1000);
      if (elapsed >= config.modeValue) {
        finishTest();
        return;
      }

      setStats((prev) => ({
        ...prev,
        elapsedSeconds: elapsed,
        remainingSeconds: config.modeValue - elapsed,
        wpm: calcWpm(prev.correctCharacters, Math.max(1, elapsed)),
        rawWpm: calcRawWpm(prev.totalCharacters, Math.max(1, elapsed)),
      }));
    }, 250);

    return clearTimer;
  }, [phase, config.modeType, config.modeValue, finishTest, clearTimer]);

  const handleInput = useCallback(
    (char: string) => {
      if (phase === 'finished') return;

      if (phase === 'idle') {
        startedAtRef.current = Date.now();
        setPhase('running');
      }

      const nextTyped = typed + char;
      setTyped(nextTyped);

      const newStats = buildStats(
        text,
        nextTyped,
        startedAtRef.current,
        null,
        configRef.current,
      );
      setStats(newStats);

      // Word mode: finish when target words completed (cursor past last char of Nth word)
      if (configRef.current.modeType === 'words') {
        const target = configRef.current.modeValue;
        const wordsDone = countCompletedWords(text, nextTyped.length);
        if (wordsDone >= target) {
          finishedAtRef.current = Date.now();
          clearTimer();
          setPhase('finished');
          setStats(
            buildStats(
              text,
              nextTyped,
              startedAtRef.current,
              finishedAtRef.current,
              configRef.current,
            ),
          );
        }
      }
    },
    [phase, typed, text, clearTimer],
  );

  const handleBackspace = useCallback(() => {
    if (phase === 'finished' || typed.length === 0) return;
    const nextTyped = typed.slice(0, -1);
    setTyped(nextTyped);
    setStats(
      buildStats(text, nextTyped, startedAtRef.current, null, configRef.current),
    );
    if (nextTyped.length === 0 && phase === 'running') {
      startedAtRef.current = null;
      setPhase('idle');
    }
  }, [phase, typed, text]);

  const getResult = useCallback((): TypingTestResult => {
    const finalStats = buildStats(
      text,
      typed,
      startedAtRef.current,
      finishedAtRef.current ?? Date.now(),
      configRef.current,
    );
    return {
      ...finalStats,
      mode: configRef.current.modeType === 'time' ? 'TIME' : 'WORDS',
      modeValue: configRef.current.modeValue,
      textCategory: configRef.current.category,
    };
  }, [text, typed]);

  const expectedChar = text[typed.length] ?? null;

  return {
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
    finishTest,
    getResult,
  };
}

export function modeLabel(modeType: TypingModeType, modeValue: number) {
  return modeType === 'time' ? `${modeValue}s` : `${modeValue} words`;
}
