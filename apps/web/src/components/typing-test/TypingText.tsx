'use client';

import { useMemo } from 'react';
import {
  getCharStates,
  getChunkLines,
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
  const lines = currentChunk ? getChunkLines(text, currentChunk) : [];

  return (
    <div className={cn('w-full max-w-3xl', className)} aria-label="Typing test text">
      <div className="flex min-h-[7rem] flex-col justify-center gap-3 text-2xl leading-relaxed tracking-wide sm:min-h-[8rem] sm:text-3xl">
        {lines.map((lineWords, lineIndex) => (
          <div key={`${chunkIndex}-${lineIndex}`} className="flex flex-wrap gap-x-[0.35em]">
            {lineWords.map((wordSlice) => (
              <WordBlock
                key={wordSlice.startIndex}
                text={text}
                wordSlice={wordSlice}
                cursorIndex={cursorIndex}
                states={states}
              />
            ))}
          </div>
        ))}
      </div>

      {chunks.length > 1 ? (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Part {chunkIndex + 1} of {chunks.length}
        </p>
      ) : null}
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
