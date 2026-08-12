'use client';

import { useMemo } from 'react';
import {
  getCharStates,
  getCurrentChunkIndex,
  splitTextIntoChunks,
  type WordSlice,
} from '@/lib/typing-test/engine';
import { cn } from '@/lib/utils';

type TypingTextProps = {
  text: string;
  typed: string;
  className?: string;
};

export function TypingText({ text, typed, className }: TypingTextProps) {
  const states = getCharStates(text, typed);
  const cursorIndex = typed.length;

  const chunks = useMemo(() => splitTextIntoChunks(text), [text]);
  const chunkIndex = getCurrentChunkIndex(chunks, cursorIndex);
  const currentChunk = chunks[chunkIndex];
  const visibleWords = currentChunk?.words ?? [];

  return (
    <div className={cn('w-full max-w-3xl', className)} aria-label="Typing test text">
      <div
        className={cn(
          'flex min-h-[4.5rem] flex-wrap content-start justify-center gap-x-[0.35em] gap-y-2',
          'text-2xl leading-relaxed tracking-wide sm:min-h-[5.5rem] sm:text-3xl',
        )}
      >
        {visibleWords.map((wordSlice) => (
          <WordBlock
            key={wordSlice.startIndex}
            text={text}
            wordSlice={wordSlice}
            cursorIndex={cursorIndex}
            states={states}
          />
        ))}
      </div>
    </div>
  );
}

function WordBlock({
  text,
  wordSlice,
  cursorIndex,
  states,
}: {
  text: string;
  wordSlice: WordSlice;
  cursorIndex: number;
  states: ReturnType<typeof getCharStates>;
}) {
  const { word, startIndex } = wordSlice;
  const spaceIndex = startIndex + word.length;
  const hasSpaceAfter = spaceIndex < text.length && text[spaceIndex] === ' ';
  const cursorOnSpace = cursorIndex === spaceIndex && hasSpaceAfter;

  return (
    <span className="inline-flex items-baseline whitespace-nowrap">
      {word.split('').map((char, charIndex) => {
        const i = startIndex + charIndex;
        return (
          <CharSpan
            key={i}
            char={char}
            state={states[i] ?? 'pending'}
            isCursor={i === cursorIndex}
          />
        );
      })}
      {hasSpaceAfter ? (
        <span
          className={cn(
            'inline-block w-[0.35em]',
            cursorOnSpace &&
              'rounded-sm bg-primary/15 underline decoration-primary decoration-2 underline-offset-4',
          )}
          aria-hidden
        >
          {' '}
        </span>
      ) : null}
    </span>
  );
}

function CharSpan({
  char,
  state,
  isCursor,
}: {
  char: string;
  state: 'pending' | 'correct' | 'incorrect' | 'extra';
  isCursor: boolean;
}) {
  return (
    <span
      className={cn(
        'relative',
        state === 'pending' && 'text-muted-foreground/60',
        state === 'correct' && 'text-foreground',
        state === 'incorrect' && 'text-destructive underline decoration-destructive/50',
        isCursor &&
          'rounded-sm bg-primary/15 text-foreground underline decoration-primary decoration-2 underline-offset-4',
      )}
    >
      {char}
    </span>
  );
}
