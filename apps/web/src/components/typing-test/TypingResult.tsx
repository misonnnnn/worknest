'use client';

import Link from 'next/link';
import type { TypingTestResult } from '@/lib/typing-test/use-typing-test';
import { Button } from '@/components/ui/button';

type TypingResultProps = {
  result: TypingTestResult;
  rank: number | null;
  onRestart: () => void;
};

export function TypingResult({ result, rank, onRestart }: TypingResultProps) {
  const modeLabel =
    result.mode === 'TIME' ? `${result.modeValue}s` : `${result.modeValue} words`;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-8 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Test complete</p>
      <p className="mt-6 font-mono text-5xl font-medium tabular-nums">{result.wpm}</p>
      <p className="text-sm text-muted-foreground">WPM</p>
      <p className="mt-2 text-2xl font-medium">{result.accuracy}%</p>
      <p className="text-sm text-muted-foreground">Accuracy</p>

      {rank ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Your rank: <span className="font-medium text-foreground">#{rank}</span>
        </p>
      ) : null}

      <dl className="mt-8 grid w-full grid-cols-2 gap-x-4 gap-y-2 text-left text-sm">
        <StatItem label="Raw WPM" value={String(result.rawWpm)} />
        <StatItem label="Duration" value={`${result.durationSeconds}s`} />
        <StatItem label="Correct" value={String(result.correctCharacters)} />
        <StatItem label="Incorrect" value={String(result.incorrectCharacters)} />
        <StatItem label="Total chars" value={String(result.totalCharacters)} />
        <StatItem label="Words" value={String(result.wordsCompleted)} />
        <StatItem label="Mode" value={modeLabel} />
        <StatItem label="Category" value={result.textCategory} />
      </dl>

      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Button onClick={onRestart}>Restart</Button>
        <Button variant="outline" asChild>
          <Link href="/typing-test/leaderboard">Leaderboard</Link>
        </Button>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </>
  );
}
