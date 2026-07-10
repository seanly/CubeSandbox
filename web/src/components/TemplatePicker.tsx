// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Tencent. All rights reserved.

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { templateApi } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface TemplatePickerProps {
  selected: string;
  onSelect: (id: string) => void;
}

export function TemplatePicker({ selected, onSelect }: TemplatePickerProps) {
  const { t } = useTranslation('sandboxNew');
  const { data: templates, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templateApi.list,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {(templates ?? []).map((tpl) => {
        const statusLower = tpl.status.toLowerCase();
        const isReady = statusLower === 'ready';
        const isSelected = tpl.templateID === selected;
        return (
          <button
            key={tpl.templateID}
            type="button"
            disabled={!isReady}
            onClick={() => onSelect(tpl.templateID)}
            className={cn(
              'flex flex-col gap-1 rounded-lg border px-4 py-3 text-left transition-colors',
              isSelected
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'border-border bg-card hover:border-primary/50 hover:bg-muted/40',
              !isReady && 'cursor-not-allowed opacity-50',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-sm font-medium">{tpl.templateID}</span>
              <Badge
                tone={statusLower === 'ready' ? 'ok' : statusLower === 'pending' || statusLower === 'creating' ? 'warn' : 'err'}
                className="shrink-0 text-xs"
              >
                {tpl.status}
              </Badge>
            </div>
            <span className="truncate text-xs text-muted-foreground">
              {tpl.instanceType ?? '—'} · v{tpl.version ?? '—'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
