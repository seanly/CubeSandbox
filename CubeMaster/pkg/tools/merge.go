// Copyright (c) 2024 Tencent Inc.
// SPDX-License-Identifier: Apache-2.0
//

package tools

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"

	cubeboxv1 "github.com/tencentcloud/CubeSandbox/CubeMaster/api/services/cubebox/v1"
	"github.com/tencentcloud/CubeSandbox/CubeMaster/pkg/service/sandbox/types"
)

const (
	AnnotationXMounts = "x-mounts"
)

// ParseMountOptions parses the JSON value of the x-mounts annotation into
// a slice of MountOption.
func ParseMountOptions(raw string) ([]*types.MountOption, error) {
	if raw == "" {
		return nil, nil
	}
	var opts []*types.MountOption
	if err := json.Unmarshal([]byte(raw), &opts); err != nil {
		return nil, fmt.Errorf("parse x-mounts: %w", err)
	}
	return opts, nil
}

// ApplyToolMounts merges a Tool's StorageMounts with instance-level
// MountOptions and injects the resulting volumes and volume mounts into req.
func ApplyToolMounts(tool *Tool, req *types.CreateCubeSandboxReq) error {
	if tool == nil {
		return nil
	}

	mountOpts := req.MountOptions
	if len(tool.StorageMounts) == 0 && len(mountOpts) > 0 {
		return fmt.Errorf("no storage mounts defined on tool %q", tool.ToolID)
	}

	// Index tool storage mounts by name.
	smByName := make(map[string]*StorageMount, len(tool.StorageMounts))
	for i := range tool.StorageMounts {
		sm := &tool.StorageMounts[i]
		if sm.Name == "" {
			return fmt.Errorf("tool %q has storage mount without name", tool.ToolID)
		}
		if sm.StorageSource.HostDir == nil {
			return fmt.Errorf("tool %q storage mount %q has unsupported source (only host_dir is supported in this phase)", tool.ToolID, sm.Name)
		}
		if sm.MountPath == "" {
			return fmt.Errorf("tool %q storage mount %q has empty mount_path", tool.ToolID, sm.Name)
		}
		if _, exists := smByName[sm.Name]; exists {
			return fmt.Errorf("tool %q has duplicate storage mount name %q", tool.ToolID, sm.Name)
		}
		smByName[sm.Name] = sm
	}

	// If no instance-level overrides are provided, use the Tool defaults.
	if len(mountOpts) == 0 {
		for _, sm := range tool.StorageMounts {
			mountOpts = append(mountOpts, &types.MountOption{Name: sm.Name})
		}
	}

	// Validate mount options and build effective mounts.
	type mountKey struct {
		mountPath string
		subPath   string
	}
	seen := make(map[mountKey]struct{})
	effective := make([]*effectiveMount, 0, len(mountOpts))

	for _, opt := range mountOpts {
		if opt.Name == "" {
			return fmt.Errorf("mount option has empty name")
		}
		sm, ok := smByName[opt.Name]
		if !ok {
			return fmt.Errorf("mount option references unknown storage mount %q on tool %q", opt.Name, tool.ToolID)
		}

		mountPath := sm.MountPath
		if opt.MountPath != "" {
			mountPath = opt.MountPath
		}
		if !isAbsPath(mountPath) {
			return fmt.Errorf("mount path %q must be absolute", mountPath)
		}

		readOnly := sm.ReadOnly
		if opt.ReadOnly != nil {
			if sm.ReadOnly && !*opt.ReadOnly {
				return fmt.Errorf("cannot widen read-only storage mount %q to read-write", sm.Name)
			}
			readOnly = *opt.ReadOnly
		}

		subPath := sm.SubPath
		if opt.SubPath != "" {
			subPath = filepath.Join(subPath, opt.SubPath)
		}
		subPath = filepath.Clean(subPath)
		if err := validateSubPath(subPath); err != nil {
			return fmt.Errorf("invalid sub_path for mount %q: %w", sm.Name, err)
		}

		hostPath := filepath.Join(sm.StorageSource.HostDir.HostPath, subPath)
		hostPath = filepath.Clean(hostPath)

		key := mountKey{mountPath: mountPath, subPath: subPath}
		if _, exists := seen[key]; exists {
			return fmt.Errorf("duplicate effective mount (mountPath=%q, subPath=%q) for tool %q", mountPath, subPath, tool.ToolID)
		}
		seen[key] = struct{}{}

		effective = append(effective, &effectiveMount{
			name:        fmt.Sprintf("%s-%d", sm.Name, len(effective)),
			volumeName:  sm.Name,
			hostPath:    hostPath,
			mountPath:   mountPath,
			readOnly:    readOnly,
			subPath:     subPath,
		})
	}

	if len(effective) == 0 {
		return nil
	}

	// Inject volumes and volume mounts.
	for _, em := range effective {
		req.Volumes = append(req.Volumes, &types.Volume{
			Name: em.name,
			VolumeSource: &types.VolumeSource{
				HostDirVolumeSources: &types.HostDirVolumeSources{
					VolumeSources: []*types.HostDirSource{{
						Name:     em.name,
						HostPath: em.hostPath,
					}},
				},
			},
		})

		vm := &cubeboxv1.VolumeMounts{
			Name:          em.name,
			ContainerPath: em.mountPath,
			Readonly:      em.readOnly,
			SubPath:       em.subPath,
		}
		for _, c := range req.Containers {
			c.VolumeMounts = append(c.VolumeMounts, vm)
		}
	}

	return nil
}

type effectiveMount struct {
	name       string
	volumeName string
	hostPath   string
	mountPath  string
	readOnly   bool
	subPath    string
}

func isAbsPath(p string) bool {
	return filepath.IsAbs(p)
}

func validateSubPath(p string) error {
	if p == "" || p == "." {
		return nil
	}
	if filepath.IsAbs(p) {
		return fmt.Errorf("sub_path must be relative")
	}
	if strings.Contains(p, "..") {
		return fmt.Errorf("sub_path cannot contain '..'")
	}
	return nil
}
