// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Tencent. All rights reserved.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toolApi, type ToolStorageMount } from '@/api/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplatePicker } from '@/components/TemplatePicker';
import { Wrench, Plus, Trash2, X } from 'lucide-react';
import { formatDeleteError } from '@/lib/utils';

// ── create tool modal ────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
}

function CreateToolModal({ onClose }: CreateModalProps) {
  const { t } = useTranslation('tools');
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [templateID, setTemplateID] = useState('');
  const [storageMounts, setStorageMounts] = useState<ToolStorageMount[]>([
    { name: '', mountPath: '', storageSource: { hostDir: { hostPath: '' } } },
  ]);

  const createMutation = useMutation({
    mutationFn: () =>
      toolApi.create({
        template_id: templateID,
        name: name.trim() || undefined,
        storage_mounts: storageMounts
          .filter(
            (m) =>
              m.name.trim() || m.mountPath.trim() || (m.storageSource.hostDir?.hostPath ?? '').trim()
          )
          .map((m) =>
            ({
              name: m.name,
              mount_path: m.mountPath,
              read_only: m.readOnly ?? undefined,
              storage_source: {
                host_dir: m.storageSource.hostDir
                  ? { host_path: m.storageSource.hostDir.hostPath }
                  : undefined,
              },
            })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tools'] });
      onClose();
    },
  });

  const updateMount = (idx: number, patch: Partial<ToolStorageMount>) => {
    const next = [...storageMounts];
    next[idx] = { ...next[idx], ...patch };
    setStorageMounts(next);
  };

  const updateHostPath = (idx: number, hostPath: string) => {
    const next = [...storageMounts];
    next[idx] = {
      ...next[idx],
      storageSource: { hostDir: { hostPath } },
    };
    setStorageMounts(next);
  };

  const addMount = () =>
    setStorageMounts([
      ...storageMounts,
      { name: '', mountPath: '', storageSource: { hostDir: { hostPath: '' } } },
    ]);

  const removeMount = (idx: number) => setStorageMounts(storageMounts.filter((_, i) => i !== idx));

  const valid = templateID.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <Card className="w-full max-w-2xl shadow-xl overflow-y-auto max-h-[90vh]">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">{t('create.title')}</CardTitle>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">{t('create.name')}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t('create.template')} <span className="text-destructive text-sm font-bold">*</span>
            </p>
            <TemplatePicker selected={templateID} onSelect={setTemplateID} />
          </div>

          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{t('create.storageMount')}</p>
              <Button type="button" variant="ghost" size="sm" onClick={addMount}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('create.addMount')}
              </Button>
            </div>
            {storageMounts.map((mount, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                <Input
                  placeholder={t('create.mountName')}
                  value={mount.name}
                  onChange={(e) => updateMount(idx, { name: e.target.value })}
                />
                <Input
                  placeholder={t('create.mountPath')}
                  value={mount.mountPath}
                  onChange={(e) => updateMount(idx, { mountPath: e.target.value })}
                />
                <Input
                  placeholder={t('create.hostPath')}
                  value={mount.storageSource.hostDir?.hostPath ?? ''}
                  onChange={(e) => updateHostPath(idx, e.target.value)}
                />
                <button
                  onClick={() => removeMount(idx)}
                  className="text-muted-foreground hover:text-destructive p-1"
                  title={t('create.removeMount')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {createMutation.isError && (
            <p className="text-xs text-destructive">{(createMutation.error as Error)?.message ?? t('create.error')}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t('create.cancel')}
            </Button>
            <Button size="sm" disabled={!valid || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? t('create.creating') : t('create.submit')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── list page ────────────────────────────────────────────────────────────────

export default function Tools() {
  const { t } = useTranslation('tools');
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const { data: tools, isLoading, error } = useQuery({
    queryKey: ['tools'],
    queryFn: () => toolApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => toolApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tools'] }),
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('create.button')}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t('loadError')}: {(error as Error).message}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (tools?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <Wrench className="h-10 w-10 text-muted-foreground/60" />
          <p className="mt-3 text-sm text-muted-foreground">{t('empty')}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {tools!.map((tool) => (
            <Card key={tool.toolID} className="group relative hover:border-primary/40 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      <Link to={`/tools/${tool.toolID}`} className="hover:underline">
                        {tool.name || tool.toolID}
                      </Link>
                    </CardTitle>
                    <CardDescription className="text-xs">{tool.toolID}</CardDescription>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(tool.toolID)}
                    disabled={deleteMutation.isPending && deleteMutation.variables === tool.toolID}
                    className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    title={t('delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('template')}: {tool.templateID}</p>
                {deleteMutation.isError && deleteMutation.variables === tool.toolID && (
                  <p className="text-xs text-destructive">
                    {formatDeleteError(deleteMutation.error)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showCreate && <CreateToolModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
