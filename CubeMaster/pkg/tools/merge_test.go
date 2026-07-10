// Copyright (c) 2024 Tencent Inc.
// SPDX-License-Identifier: Apache-2.0
//

package tools

import (
	"testing"

	"github.com/tencentcloud/CubeSandbox/CubeMaster/pkg/service/sandbox/types"
	"github.com/stretchr/testify/assert"
)

func boolPtr(b bool) *bool {
	return &b
}

func TestApplyToolMounts_NoMounts(t *testing.T) {
	tool := &Tool{ToolID: "t1", TemplateID: "tpl-1"}
	req := &types.CreateCubeSandboxReq{}

	assert.NoError(t, ApplyToolMounts(tool, req))
	assert.Empty(t, req.Volumes)
	assert.Empty(t, req.Containers)
}

func TestApplyToolMounts_SingleDefaultMount(t *testing.T) {
	tool := &Tool{
		ToolID: "t1",
		StorageMounts: []StorageMount{
			{
				Name:      "data",
				MountPath: "/mnt/data",
				StorageSource: StorageSource{
					HostDir: &HostDirStorageSource{HostPath: "/host/data"},
				},
			},
		},
	}
	req := &types.CreateCubeSandboxReq{
		Containers: []*types.Container{{Name: "c1"}},
	}

	assert.NoError(t, ApplyToolMounts(tool, req))
	assert.Len(t, req.Volumes, 1)
	assert.Len(t, req.Containers[0].VolumeMounts, 1)

	vm := req.Containers[0].VolumeMounts[0]
	assert.Equal(t, "/mnt/data", vm.ContainerPath)
	assert.False(t, vm.Readonly)

	vol := req.Volumes[0]
	assert.Equal(t, "/host/data", vol.VolumeSource.HostDirVolumeSources.VolumeSources[0].HostPath)
}

func TestApplyToolMounts_OverrideMountPath(t *testing.T) {
	tool := &Tool{
		ToolID: "t1",
		StorageMounts: []StorageMount{
			{
				Name:      "data",
				MountPath: "/mnt/data",
				StorageSource: StorageSource{
					HostDir: &HostDirStorageSource{HostPath: "/host/data"},
				},
			},
		},
	}
	req := &types.CreateCubeSandboxReq{
		Containers:   []*types.Container{{Name: "c1"}},
		MountOptions: []*types.MountOption{{Name: "data", MountPath: "/workspace/data"}},
	}

	assert.NoError(t, ApplyToolMounts(tool, req))
	assert.Equal(t, "/workspace/data", req.Containers[0].VolumeMounts[0].ContainerPath)
}

func TestApplyToolMounts_SubPathAppended(t *testing.T) {
	tool := &Tool{
		ToolID: "t1",
		StorageMounts: []StorageMount{
			{
				Name:      "data",
				MountPath: "/mnt/data",
				SubPath:   "prefix",
				StorageSource: StorageSource{
					HostDir: &HostDirStorageSource{HostPath: "/host/data"},
				},
			},
		},
	}
	req := &types.CreateCubeSandboxReq{
		Containers:   []*types.Container{{Name: "c1"}},
		MountOptions: []*types.MountOption{{Name: "data", SubPath: "user-123"}},
	}

	assert.NoError(t, ApplyToolMounts(tool, req))
	vol := req.Volumes[0]
	assert.Equal(t, "/host/data/prefix/user-123", vol.VolumeSource.HostDirVolumeSources.VolumeSources[0].HostPath)
	assert.Equal(t, "prefix/user-123", req.Containers[0].VolumeMounts[0].SubPath)
}

func TestApplyToolMounts_ReadOnlyCanTighten(t *testing.T) {
	tool := &Tool{
		ToolID: "t1",
		StorageMounts: []StorageMount{
			{
				Name:      "data",
				MountPath: "/mnt/data",
				ReadOnly:  false,
				StorageSource: StorageSource{
					HostDir: &HostDirStorageSource{HostPath: "/host/data"},
				},
			},
		},
	}
	req := &types.CreateCubeSandboxReq{
		Containers:   []*types.Container{{Name: "c1"}},
		MountOptions: []*types.MountOption{{Name: "data", ReadOnly: boolPtr(true)}},
	}

	assert.NoError(t, ApplyToolMounts(tool, req))
	assert.True(t, req.Containers[0].VolumeMounts[0].Readonly)
}

func TestApplyToolMounts_ReadOnlyCannotWiden(t *testing.T) {
	tool := &Tool{
		ToolID: "t1",
		StorageMounts: []StorageMount{
			{
				Name:      "data",
				MountPath: "/mnt/data",
				ReadOnly:  true,
				StorageSource: StorageSource{
					HostDir: &HostDirStorageSource{HostPath: "/host/data"},
				},
			},
		},
	}
	req := &types.CreateCubeSandboxReq{
		Containers:   []*types.Container{{Name: "c1"}},
		MountOptions: []*types.MountOption{{Name: "data", ReadOnly: boolPtr(false)}},
	}

	assert.ErrorContains(t, ApplyToolMounts(tool, req), "cannot widen read-only")
}

func TestApplyToolMounts_MultipleMountsSameSource(t *testing.T) {
	tool := &Tool{
		ToolID: "t1",
		StorageMounts: []StorageMount{
			{
				Name:      "data",
				MountPath: "/mnt/data",
				StorageSource: StorageSource{
					HostDir: &HostDirStorageSource{HostPath: "/host/data"},
				},
			},
		},
	}
	req := &types.CreateCubeSandboxReq{
		Containers: []*types.Container{{Name: "c1"}},
		MountOptions: []*types.MountOption{
			{Name: "data", MountPath: "/workspace/input", SubPath: "run-001"},
			{Name: "data", MountPath: "/workspace/output", SubPath: "run-002"},
		},
	}

	assert.NoError(t, ApplyToolMounts(tool, req))
	assert.Len(t, req.Volumes, 2)
	assert.Len(t, req.Containers[0].VolumeMounts, 2)
}

func TestApplyToolMounts_DuplicateMountPathRejected(t *testing.T) {
	tool := &Tool{
		ToolID: "t1",
		StorageMounts: []StorageMount{
			{
				Name:      "data",
				MountPath: "/mnt/data",
				StorageSource: StorageSource{
					HostDir: &HostDirStorageSource{HostPath: "/host/data"},
				},
			},
		},
	}
	req := &types.CreateCubeSandboxReq{
		Containers: []*types.Container{{Name: "c1"}},
		MountOptions: []*types.MountOption{
			{Name: "data", MountPath: "/workspace/data", SubPath: "run-001"},
			{Name: "data", MountPath: "/workspace/data", SubPath: "run-001"},
		},
	}

	assert.ErrorContains(t, ApplyToolMounts(tool, req), "duplicate effective mount")
}

func TestApplyToolMounts_UnknownMountOptionRejected(t *testing.T) {
	tool := &Tool{
		ToolID: "t1",
		StorageMounts: []StorageMount{
			{
				Name:      "data",
				MountPath: "/mnt/data",
				StorageSource: StorageSource{
					HostDir: &HostDirStorageSource{HostPath: "/host/data"},
				},
			},
		},
	}
	req := &types.CreateCubeSandboxReq{
		MountOptions: []*types.MountOption{{Name: "unknown"}},
	}

	assert.ErrorContains(t, ApplyToolMounts(tool, req), "unknown storage mount")
}

func TestApplyToolMounts_MountPathMustBeAbsolute(t *testing.T) {
	tool := &Tool{
		ToolID: "t1",
		StorageMounts: []StorageMount{
			{
				Name:      "data",
				MountPath: "/mnt/data",
				StorageSource: StorageSource{
					HostDir: &HostDirStorageSource{HostPath: "/host/data"},
				},
			},
		},
	}
	req := &types.CreateCubeSandboxReq{
		MountOptions: []*types.MountOption{{Name: "data", MountPath: "relative/path"}},
	}

	assert.ErrorContains(t, ApplyToolMounts(tool, req), "must be absolute")
}

func TestApplyToolMounts_SubPathEscapeRejected(t *testing.T) {
	tool := &Tool{
		ToolID: "t1",
		StorageMounts: []StorageMount{
			{
				Name:      "data",
				MountPath: "/mnt/data",
				StorageSource: StorageSource{
					HostDir: &HostDirStorageSource{HostPath: "/host/data"},
				},
			},
		},
	}
	req := &types.CreateCubeSandboxReq{
		MountOptions: []*types.MountOption{{Name: "data", SubPath: "../escape"}},
	}

	assert.ErrorContains(t, ApplyToolMounts(tool, req), "cannot contain '..'")
}

func TestApplyToolMounts_VolumeMountsAppendedToAllContainers(t *testing.T) {
	tool := &Tool{
		ToolID: "t1",
		StorageMounts: []StorageMount{
			{
				Name:      "data",
				MountPath: "/mnt/data",
				StorageSource: StorageSource{
					HostDir: &HostDirStorageSource{HostPath: "/host/data"},
				},
			},
		},
	}
	req := &types.CreateCubeSandboxReq{
		Containers: []*types.Container{{Name: "c1"}, {Name: "c2"}},
	}

	assert.NoError(t, ApplyToolMounts(tool, req))
	assert.Len(t, req.Containers[0].VolumeMounts, 1)
	assert.Len(t, req.Containers[1].VolumeMounts, 1)
}

func TestParseMountOptions(t *testing.T) {
	opts, err := ParseMountOptions(`[{"name":"data","mountPath":"/workspace/data","readOnly":true,"subPath":"run-001"}]`)
	assert.NoError(t, err)
	assert.Len(t, opts, 1)
	assert.Equal(t, "data", opts[0].Name)
	assert.Equal(t, "/workspace/data", opts[0].MountPath)
	assert.NotNil(t, opts[0].ReadOnly)
	assert.True(t, *opts[0].ReadOnly)
	assert.Equal(t, "run-001", opts[0].SubPath)
}

func TestParseMountOptions_Empty(t *testing.T) {
	opts, err := ParseMountOptions("")
	assert.NoError(t, err)
	assert.Empty(t, opts)
}
