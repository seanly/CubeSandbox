// Copyright (c) 2024 Tencent Inc.
// SPDX-License-Identifier: Apache-2.0
//

package tools

// StorageSource describes the backend of a StorageMount.
// For the MVP only HostDir is supported; Cos/Cfs/Image are reserved for
// future phases.
type StorageSource struct {
	HostDir *HostDirStorageSource `json:"host_dir,omitempty"`
	// Cos     *CosStorageSource     `json:"cos,omitempty"`
	// Cfs     *CfsStorageSource     `json:"cfs,omitempty"`
	// Image   *ImageStorageSource   `json:"image,omitempty"`
}

// HostDirStorageSource mounts a host directory into the sandbox via the
// existing HostDir/virtiofs path.
type HostDirStorageSource struct {
	HostPath string `json:"host_path,omitempty"`
}

// StorageMount defines a default mount declared on a Tool.
type StorageMount struct {
	Name          string        `json:"name,omitempty"`
	MountPath     string        `json:"mount_path,omitempty"`
	ReadOnly      bool          `json:"read_only,omitempty"`
	SubPath       string        `json:"sub_path,omitempty"`
	StorageSource StorageSource `json:"storage_source,omitempty"`
}

// Tool is the application-level sandbox template. A Tool references a
// low-level CubeSandbox Template/Snapshot (TemplateID) and adds default
// runtime configuration such as network, command, and storage mounts.
type Tool struct {
	ToolID         string            `json:"tool_id,omitempty"`
	Name           string            `json:"name,omitempty"`
	TemplateID     string            `json:"template_id,omitempty"`
	InstanceType   string            `json:"instance_type,omitempty"`
	NetworkType    string            `json:"network_type,omitempty"`
	RuntimeHandler string            `json:"runtime_handler,omitempty"`
	DefaultTimeout int               `json:"default_timeout,omitempty"`
	StorageMounts  []StorageMount    `json:"storage_mounts,omitempty"`
	Labels         map[string]string `json:"labels,omitempty"`
	Annotations    map[string]string `json:"annotations,omitempty"`
}
