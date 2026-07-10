// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Tencent. All rights reserved.

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toolApi, type ToolDetail, type ToolStorageMount } from '@/api/client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Wrench, Plus, Trash2, X } from 'lucide-react';
import { formatDeleteError } from '@/lib/utils';

// ── create tool modal ────────────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
}

function CreateToolModal({ onClose }: CreateModalProps) {
  const { t } = useTranslation('tools');
  const qc = useQueryClient();
  const [toolID, setToolID] = useState('');
  const [name, setName] = useState('');
  const [templateID, setTemplateID] = useState('');
  const [instanceType, setInstanceType] = useState('');
  const [networkType, setNetworkType] = useState('');
  const [mountName, setMountName] = useState('');
  const [mountPath, setMountPath] = useState('');
  const [hostPath, setHostPath] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      const storageMounts = [];
      if (mountName.trim() && mountPath.trim() && hostPath.trim()) {
        storageMounts.push({
          name: mountName.trim(),
          mount_path: mountPath.trim(),
          storage_source: { host_dir: { host_path: hostPath.trim() } },
        });
      }
      return toolApi.create({
        tool_id: toolID.trim(),
        name: name.trim() || undefined,
        template_id: templateID.trim(),
        instance_type: instanceType.trim() || undefined,
        network_type: networkType.trim() || undefined,
        storage_mounts: storageMounts,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tools'] });
      onClose();
    },
  });

  const valid = toolID.trim().length > 0 && templateID.trim().length > 0;

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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t('create.toolID')} <span className="text-destructive text-sm font-bold">*</span>
              </label>
              <Input
                placeholder="sdt-xxxxxxxx"
                value={toolID}
                onChange={(e) => setToolID(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('create.name')}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t('create.templateID')} <span className="text-destructive text-sm font-bold">*</span>
            </label>
            <Input
              placeholder="tpl-xxxxxxxx"
              value={templateID}
              onChange={(e) => setTemplateID(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('create.instanceType')}</label>
              <Input value={instanceType} onChange={(e) => setInstanceType(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">{t('create.networkType')}</label>
              <Input value={networkType} onChange={(e) => setNetworkType(e.target.value)} />
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">{t('create.storageMount')}</p>
            <div className="grid grid-cols-3 gap-3">
              <Input placeholder={t('create.mountName')} value={mountName} onChange={(e) => setMountName(e.target.value)} />
              <Input placeholder={t('create.mountPath')} value={mountPath} onChange={(e) => setMountPath(e.target.value)} />
              <Input placeholder={t('create.hostPath')} value={hostPath} onChange={(e) => setHostPath(e.target.value)} />
            </div>
          </div>

          {mutation.isError && (
            <p className="text-xs text-destructive">
              {(mutation.error as Error)?.message ?? t('create.error')}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t('create.cancel')}
            </Button>
            <Button
              size="sm"
              disabled={!valid || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? t('create.creating') : t('create.submit')}
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
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="info" className="text-xs">{t('template')}: {tool.templateID}</Badge>
                  {tool.instanceType && <Badge tone="mute" className="text-xs">{tool.instanceType}</Badge>}
                  {tool.networkType && <Badge tone="mute" className="text-xs">{tool.networkType}</Badge>}
                </div>
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
