'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest, ApiClientError } from '@/lib/api';
import { cn } from '@/lib/utils';

const MAX_MESSAGE_LENGTH = 2000;
const UNAVAILABLE_MESSAGE =
  'Sorry, the AI assistant is temporarily unavailable. Please try again later.';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

export function AiAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [takingLong, setTakingLong] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'How can I help you?',
    },
  ]);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!loading) {
      setTakingLong(false);
      return;
    }

    const timer = window.setTimeout(() => setTakingLong(true), 3000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, loading, takingLong, open]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const history = messages
      .filter((item) => item.id !== 'welcome')
      .map((item) => ({
        role: item.role === 'user' ? 'user' : 'model',
        content: item.text,
      }));

    setInput('');
    setError(null);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text }]);
    setLoading(true);

    try {
      const data = await apiRequest<{ message: string }>('/ai/chat', {
        method: 'POST',
        body: { message: text, history },
      });

      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', text: data.message },
      ]);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 400) {
        setError('Please enter a valid question.');
      } else if (err instanceof ApiClientError && err.status === 429) {
        setError(err.message);
      } else {
        setError(UNAVAILABLE_MESSAGE);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="flex h-[min(28rem,calc(100vh-6rem))] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bot className="size-4" />
              ERP Assistant
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Close assistant"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn('flex gap-2 text-sm', message.role === 'user' && 'justify-end')}
              >
                {message.role === 'assistant' && (
                  <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
                    🤖
                  </span>
                )}
                <p
                  className={cn(
                    'max-w-[85%] rounded-lg px-2.5 py-1.5 whitespace-pre-wrap',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground',
                  )}
                >
                  {message.role === 'user' ? `You: ${message.text}` : message.text}
                </p>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 text-sm text-muted-foreground">
                <span className="mt-0.5 shrink-0 text-base leading-none" aria-hidden>
                  🤖
                </span>
                <p className="rounded-lg bg-muted px-2.5 py-1.5">
                  {takingLong
                    ? 'Thinking… sorry, taking too long. Eto na, wait lang…'
                    : 'Thinking…'}
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="border-t px-3 py-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          <form
            className="flex items-center gap-2 border-t p-2"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <Input
              ref={inputRef}
              value={input}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder="Ask something..."
              autoComplete="off"
              disabled={loading}
              onChange={(event) => setInput(event.target.value)}
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              <Send data-icon="inline-start" />
              Send
            </Button>
          </form>
        </div>
      )}

      <Button
        type="button"
        size="icon-lg"
        className="size-12 rounded-full shadow-lg"
        aria-label={open ? 'Close ERP assistant' : 'Open ERP assistant'}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        {open ? <X className="size-5" /> : <Bot className="size-5" />}
      </Button>
    </div>
  );
}
