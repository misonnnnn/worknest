'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Ban,
  Check,
  Eye,
  FileInput,
  PackageCheck,
  Pencil,
  Send,
  Shield,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type RowAction = {
  label: string;
  onClick: () => void;
  variant?: 'outline' | 'destructive' | 'ghost';
  disabled?: boolean;
};

const ACTION_ICONS = {
  view: Eye,
  edit: Pencil,
  delete: Trash2,
  submit: Send,
  approve: Check,
  reject: X,
  cancel: Ban,
  complete: Check,
  'convert to po': FileInput,
  receive: PackageCheck,
  permissions: Shield,
  roles: UserCog,
} satisfies Record<string, LucideIcon>;

function actionIcon(label: string): LucideIcon | undefined {
  return ACTION_ICONS[label.toLowerCase() as keyof typeof ACTION_ICONS];
}

export function RowActions({ actions }: { actions: RowAction[] }) {
  if (actions.length === 0) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-nowrap items-center justify-end gap-1">
      {actions.map((action) => {
        const Icon = actionIcon(action.label);
        return (
          <Tooltip key={action.label}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size={Icon ? 'icon-xs' : 'xs'}
                variant={action.variant ?? 'outline'}
                disabled={action.disabled}
                aria-label={action.label}
                onClick={action.onClick}
              >
                {Icon ? <Icon /> : action.label}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{action.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
