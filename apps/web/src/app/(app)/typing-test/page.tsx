'use client';

import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { TypingTest } from '@/components/typing-test/TypingTest';

export default function TypingTestPage() {
  const { can, loading } = useAuth();

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!can('typing-tests.view')) {
    return (
      <p className="text-sm text-destructive">You do not have permission to access the typing test.</p>
    );
  }

  return (
    <>
      <PageHeader
        title="Typing Test"
        description="Practice typing speed and accuracy. Timer starts on your first keystroke."
      />
      <TypingTest />
    </>
  );
}
