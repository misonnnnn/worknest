'use client';

import { Button } from '@/components/ui/button';

type RowAction = {
  label: string;
  onClick: () => void;
  variant?: 'outline' | 'destructive' | 'ghost';
  disabled?: boolean;
};

export function RowActions({ actions }: { actions: RowAction[] }) {
  if (actions.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {actions.map((action) => (
        <Button
          key={action.label}
          type="button"
          size="xs"
          variant={action.variant ?? 'outline'}
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
