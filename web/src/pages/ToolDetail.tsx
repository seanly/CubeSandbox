// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 Tencent. All rights reserved.

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toolApi, type ToolDetail, type ToolStorageMount } from '@/api/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Trash2, Edit2, Save, X, Plus } from 'lucide-react';

interface FormState {
  name: string;
  templateID: string;
  instanceType: string;
  networkType: string;
  runtimeHandler: string;
  defaultTimeout: string;
  storageMounts: ToolStorageMount[];
}

function detailToForm(detail: ToolDetail): FormState {
  return {
    name: detail.name ?? '',
    templateID: detail.templateID,
    instanceType: detail.instanceType ?? '',
    networkType: detail.networkType ?? '',
    runtimeHandler: detail.runtimeHandler ?? '',
    defaultTimeout: detail.defaultTimeout?.toString() ?? '',
    storageMounts: detail.storageMounts,
  };
}

export default function ToolDetail() {
  const { toolID } = useParams<{ toolID: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('toolDetail');
  const qc = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  const { data: tool, isLoading, error } = useQuery({
    queryKey: ['tools', toolID],
    queryFn: () => toolApi.get(toolID!),
    enabled: !!toolID,
  });

  const updateMutation = useMutation({
    mutationFn: (body: Parameters<typeof toolApi.update>[1]) => toolApi.update(toolID!, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tools', toolID] });
      qc.invalidateQueries({ queryKey: ['tools'] });
      setIsEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => toolApi.remove(toolID!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tools'] });
      navigate('/tools');
    },
  });

  const startEdit = () => {
    if (tool) {
      setForm(detailToForm(tool));
      setIsEditing(true);
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setForm(null);
  };

  const saveEdit = () => {
    if (!form) return;
    updateMutation.mutate({
      tool_id: toolID,
      name: form.name || undefined,
      template_id: form.templateID,
      instance_type: form.instanceType || undefined,
      network_type: form.networkType || undefined,
      runtime_handler: form.runtimeHandler || undefined,
      default_timeout: form.defaultTimeout ? parseInt(form.defaultTimeout, 10) : undefined,
      storage_mounts: form.storageMounts.map((m) => ({
        name: m.name,
        mount_path: m.mountPath,
        read_only: m.readOnly ?? undefined,
        sub_path: m.subPath || undefined,
        storage_source: {
          host_dir: m.storageSource.hostDir ? { host_path: m.storageSource.hostDir.hostPath } : undefined,
        },
      })),
    });
  };

  const updateMount = (idx: number, patch: Partial<ToolStorageMount>) => {
    if (!form) return;
    const mounts = [...form.storageMounts];
    mounts[idx] = { ...mounts[idx], ...patch };
    setForm({ ...form, storageMounts: mounts });
  };

  const updateMountHostPath = (idx: number, hostPath: string) => {
    if (!form) return;
    const mounts = [...form.storageMounts];
    mounts[idx] = {
      ...mounts[idx],
      storageSource: { hostDir: { hostPath } },
    };
    setForm({ ...form, storageMounts: mounts });
  };

  const addMount = () => {
    if (!form) return;
    setForm({
      ...form,
      storageMounts: [
        ...form.storageMounts,
        { name: '', mountPath: '', storageSource: { hostDir: { hostPath: '' } } },
      ],
    });
  };

  const removeMount = (idx: number) => {
    if (!form) return;
    const mounts = form.storageMounts.filter((_, i) => i !== idx);
    setForm({ ...form, storageMounts: mounts });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !tool) {
    return (
      <div className="p-4 md:p-6">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {t('loadError')}: {(error as Error)?.message}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/tools')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">{tool.name || tool.toolID}</h1>
          <p className="text-sm text-muted-foreground">{tool.toolID}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                <X className="h-4 w-4 mr-1" />
                {t('cancel')}
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={updateMutation.isPending}>
                <Save className="h-4 w-4 mr-1" />
                {updateMutation.isPending ? t('saving') : t('save')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Edit2 className="h-4 w-4 mr-1" />
                {t('edit')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t('delete')}
              </Button>
            </>
          )}
        </div>
      </div>

      {updateMutation.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {(updateMutation.error as Error)?.message}
        </div>
      )}

      {deleteMutation.isError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {(deleteMutation.error as Error)?.message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('configuration')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <ReadOnlyField label={t('toolID')} value={tool.toolID} />
            {isEditing && form ? (
              <EditField label={t('name')} value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            ) : (
              <ReadOnlyField label={t('name')} value={tool.name ?? '-'} />
            )}
            {isEditing && form ? (
              <EditField label={t('templateID')} value={form.templateID} onChange={(v) => setForm({ ...form, templateID: v })} />
            ) : (
              <ReadOnlyField label={t('templateID')} value={tool.templateID} />
            )}
            {isEditing && form ? (
              <EditField label={t('instanceType')} value={form.instanceType} onChange={(v) => setForm({ ...form, instanceType: v })} />
            ) : (
              <ReadOnlyField label={t('instanceType')} value={tool.instanceType ?? '-'} />
            )}
            {isEditing && form ? (
              <EditField label={t('networkType')} value={form.networkType} onChange={(v) => setForm({ ...form, networkType: v })} />
            ) : (
              <ReadOnlyField label={t('networkType')} value={tool.networkType ?? '-'} />
            )}
            {isEditing && form ? (
              <EditField label={t('runtimeHandler')} value={form.runtimeHandler} onChange={(v) => setForm({ ...form, runtimeHandler: v })} />
            ) : (
              <ReadOnlyField label={t('runtimeHandler')} value={tool.runtimeHandler ?? '-'} />
            )}
            {isEditing && form ? (
              <EditField label={t('defaultTimeout')} value={form.defaultTimeout} onChange={(v) => setForm({ ...form, defaultTimeout: v })} />
            ) : (
              <ReadOnlyField label={t('defaultTimeout')} value={tool.defaultTimeout?.toString() ?? '-'} />
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">{t('storageMounts')}</CardTitle>
          {isEditing && (
            <Button variant="outline" size="sm" onClick={addMount}>
              <Plus className="h-4 w-4 mr-1" />
              {t('addMount')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {isEditing && form ? (
            form.storageMounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noStorageMounts')}</p>
            ) : (
              form.storageMounts.map((mount, idx) => (
                <div key={idx} className="rounded-md border p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <EditField label={t('mountName')} value={mount.name} onChange={(v) => updateMount(idx, { name: v })} />
                    <EditField label={t('mountPath')} value={mount.mountPath} onChange={(v) => updateMount(idx, { mountPath: v })} />
                    <EditField label={t('subPath')} value={mount.subPath ?? ''} onChange={(v) => updateMount(idx, { subPath: v })} />
                    <EditField label={t('hostPath')} value={mount.storageSource.hostDir?.hostPath ?? ''} onChange={(v) => updateMountHostPath(idx, v)} />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border"
                      checked={mount.readOnly ?? false}
                      onChange={(e) => updateMount(idx, { readOnly: e.target.checked })}
                    />
                    <span className="text-sm">{t('readOnly')}</span>
                  </label>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeMount(idx)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    {t('removeMount')}
                  </Button>
                </div>
              ))
            )
          ) : tool.storageMounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noStorageMounts')}</p>
          ) : (
            tool.storageMounts.map((mount) => (
              <div key={mount.name} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{mount.name}</span>
                  {mount.readOnly && <Badge tone="info">read-only</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t('mountPath')}: </span>
                    {mount.mountPath}
                  </div>
                  {mount.subPath && (
                    <div>
                      <span className="text-muted-foreground">{t('subPath')}: </span>
                      {mount.subPath}
                    </div>
                  )}
                  {mount.storageSource.hostDir && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">{t('hostPath')}: </span>
                      {mount.storageSource.hostDir.hostPath}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input value={value} readOnly className="bg-muted/50" />
    </div>
  );
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
