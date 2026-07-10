// Copyright (c) 2024 Tencent Inc.
// SPDX-License-Identifier: Apache-2.0
//

package models

import (
	"github.com/tencentcloud/CubeSandbox/CubeMaster/pkg/base/constants"
	"gorm.io/gorm"
)

// ToolDefinition persists the application-level sandbox Tool configuration.
type ToolDefinition struct {
	gorm.Model
	ToolID         string `json:"tool_id" gorm:"column:tool_id;uniqueIndex"`
	Name           string `json:"name" gorm:"column:name"`
	TemplateID     string `json:"template_id" gorm:"column:template_id"`
	InstanceType   string `json:"instance_type" gorm:"column:instance_type"`
	NetworkType    string `json:"network_type" gorm:"column:network_type"`
	RuntimeHandler string `json:"runtime_handler" gorm:"column:runtime_handler"`
	DefaultTimeout int    `json:"default_timeout" gorm:"column:default_timeout"`
	StorageMounts  string `json:"storage_mounts" gorm:"column:storage_mounts"`
	Labels         string `json:"labels" gorm:"column:labels"`
	Annotations    string `json:"annotations" gorm:"column:annotations"`
}

func (ToolDefinition) TableName() string {
	return constants.ToolDefinitionTableName
}
