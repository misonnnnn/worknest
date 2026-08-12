'use client';

import type { TypingTestStats } from '@/lib/typing-test/use-typing-test';
import type { TypingModeType } from '@/lib/typing-test/engine';

type TypingStatsProps = {
  stats: TypingTestStats;
  modeType: TypingModeType;
  modeValue: number;
  phase: 'idle' | 'running' | 'finished';
};

export function TypingStatsBar({ stats, modeType, modeValue, phase }: TypingStatsProps) {
  const timerDisplay =
    modeType === 'time'
      ? phase === 'idle'
        ? modeValue
        : stats.remainingSeconds
      : stats.elapsedSeconds;

  const timerLabel = modeType === 'time' ? (phase === 'idle' ? 'TIME' : 'TIME') : 'TIME';

  return (
    <div className="flex items-center justify-center gap-10 sm:gap-16">
      <StatBlock label="WPM" value={phase === 'idle' ? '0' : String(stats.wpm)} />
      <StatBlock
        label="ACC"
        value={phase === 'idle' ? '100%' : `${stats.accuracy}%`}
      />
      <StatBlock label={timerLabel} value={`${timerDisplay}s`} />
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="font-mono text-3xl font-medium tabular-nums text-muted-foreground sm:text-4xl">
        {value}
      </div>
      <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground/70">
        {label}
      </div>
    </div>
  );
}
