'use client';

import { useAuth } from '@/components/auth-provider';
import { PageHeader } from '@/components/page-header';
import { NumberMemory } from '@/components/number-memory/NumberMemory';

export default function NumberMemoryPage() {
  const { can, loading } = useAuth();

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  if (!can('number-memory.view')) {
    return (
      <p className="text-sm text-destructive">
        You do not have permission to access number memory.
      </p>
    );
  }

  return (
    <>
      <PageHeader
        title="Number Memory"
        description="Memorize the number, then type it back. Each round gets one digit longer."
      />
      <NumberMemory />
    </>
  );
}
