// Copyright (c) 2024 Tencent Inc.
// SPDX-License-Identifier: Apache-2.0
//

package tools

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/tencentcloud/CubeSandbox/CubeMaster/pkg/base/db/models"
	"gorm.io/gorm"
)

var (
	defaultStore *Store
)

// Store provides persistence for Tool definitions.
type Store struct {
	db *gorm.DB
}

// Init creates the tool_definition table if it does not exist.
func Init(db *gorm.DB) error {
	if err := initToolDefinitionTable(db); err != nil {
		return err
	}
	defaultStore = &Store{db: db}
	return nil
}

func initToolDefinitionTable(client *gorm.DB) error {
	if client.Migrator().HasTable(&models.ToolDefinition{}) {
		return nil
	}
	stmt := &gorm.Statement{DB: client}
	stmt.Parse(&models.ToolDefinition{})
	return client.Exec(`CREATE TABLE IF NOT EXISTS ` + stmt.Schema.Table + ` (
		id bigint unsigned NOT NULL AUTO_INCREMENT,
		tool_id varchar(128) NOT NULL COMMENT 'tool id',
		name varchar(256) NOT NULL DEFAULT '' COMMENT 'tool display name',
		template_id varchar(128) NOT NULL DEFAULT '' COMMENT 'referenced cubebox template id',
		instance_type varchar(64) NOT NULL DEFAULT '' COMMENT 'instance type',
		network_type varchar(64) NOT NULL DEFAULT '' COMMENT 'network type',
		runtime_handler varchar(64) NOT NULL DEFAULT '' COMMENT 'runtime handler',
		default_timeout int NOT NULL DEFAULT 0 COMMENT 'default timeout in seconds',
		storage_mounts mediumtext COMMENT 'storage mounts json',
		labels mediumtext COMMENT 'labels json',
		annotations mediumtext COMMENT 'annotations json',
		created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
		deleted_at datetime DEFAULT NULL,
		PRIMARY KEY (id),
		UNIQUE KEY idx_tool_id (tool_id)
	  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3`).Error
}

// GetDefaultStore returns the package-level default store. It is intended for
// use by HTTP handlers that do not have direct access to the Store instance.
func GetDefaultStore() *Store {
	return defaultStore
}

// GetTool retrieves a Tool by its ToolID.
func GetTool(ctx context.Context, toolID string) (*Tool, error) {
	if defaultStore == nil {
		return nil, fmt.Errorf("tool store not initialized")
	}
	return defaultStore.GetTool(ctx, toolID)
}

// CreateTool persists a new Tool definition.
func CreateTool(ctx context.Context, tool *Tool) error {
	if defaultStore == nil {
		return fmt.Errorf("tool store not initialized")
	}
	return defaultStore.CreateTool(ctx, tool)
}

// GetTool retrieves a Tool by its ToolID.
func (s *Store) GetTool(ctx context.Context, toolID string) (*Tool, error) {
	var def models.ToolDefinition
	if err := s.db.WithContext(ctx).Where("tool_id = ?", toolID).First(&def).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("tool %q not found", toolID)
		}
		return nil, err
	}
	return toolFromDefinition(def)
}

// CreateTool persists a new Tool definition.
func (s *Store) CreateTool(ctx context.Context, tool *Tool) error {
	def, err := definitionFromTool(tool)
	if err != nil {
		return err
	}
	return s.db.WithContext(ctx).Create(def).Error
}

// UpdateTool updates an existing Tool definition.
func (s *Store) UpdateTool(ctx context.Context, tool *Tool) error {
	def, err := definitionFromTool(tool)
	if err != nil {
		return err
	}
	return s.db.WithContext(ctx).
		Where("tool_id = ?", tool.ToolID).
		Updates(def).Error
}

// DeleteTool hard-deletes a Tool definition so the unique index on tool_id
// does not block re-creating a tool with the same ID after deletion.
func (s *Store) DeleteTool(ctx context.Context, toolID string) error {
	return s.db.WithContext(ctx).
		Where("tool_id = ?", toolID).
		Unscoped().
		Delete(&models.ToolDefinition{}).Error
}

// ListTools returns all non-deleted Tool definitions.
func (s *Store) ListTools(ctx context.Context) ([]*Tool, error) {
	var defs []models.ToolDefinition
	if err := s.db.WithContext(ctx).Find(&defs).Error; err != nil {
		return nil, err
	}
	out := make([]*Tool, 0, len(defs))
	for _, def := range defs {
		tool, err := toolFromDefinition(def)
		if err != nil {
			return nil, err
		}
		out = append(out, tool)
	}
	return out, nil
}

func toolFromDefinition(def models.ToolDefinition) (*Tool, error) {
	tool := &Tool{
		ToolID:         def.ToolID,
		Name:           def.Name,
		TemplateID:     def.TemplateID,
		InstanceType:   def.InstanceType,
		NetworkType:    def.NetworkType,
		RuntimeHandler: def.RuntimeHandler,
		DefaultTimeout: def.DefaultTimeout,
	}
	if def.StorageMounts != "" {
		if err := json.Unmarshal([]byte(def.StorageMounts), &tool.StorageMounts); err != nil {
			return nil, fmt.Errorf("unmarshal storage_mounts for tool %q: %w", def.ToolID, err)
		}
	}
	if def.Labels != "" {
		if err := json.Unmarshal([]byte(def.Labels), &tool.Labels); err != nil {
			return nil, fmt.Errorf("unmarshal labels for tool %q: %w", def.ToolID, err)
		}
	}
	if def.Annotations != "" {
		if err := json.Unmarshal([]byte(def.Annotations), &tool.Annotations); err != nil {
			return nil, fmt.Errorf("unmarshal annotations for tool %q: %w", def.ToolID, err)
		}
	}
	return tool, nil
}

func definitionFromTool(tool *Tool) (*models.ToolDefinition, error) {
	def := &models.ToolDefinition{
		ToolID:         tool.ToolID,
		Name:           tool.Name,
		TemplateID:     tool.TemplateID,
		InstanceType:   tool.InstanceType,
		NetworkType:    tool.NetworkType,
		RuntimeHandler: tool.RuntimeHandler,
		DefaultTimeout: tool.DefaultTimeout,
	}
	if len(tool.StorageMounts) > 0 {
		data, err := json.Marshal(tool.StorageMounts)
		if err != nil {
			return nil, err
		}
		def.StorageMounts = string(data)
	}
	if len(tool.Labels) > 0 {
		data, err := json.Marshal(tool.Labels)
		if err != nil {
			return nil, err
		}
		def.Labels = string(data)
	}
	if len(tool.Annotations) > 0 {
		data, err := json.Marshal(tool.Annotations)
		if err != nil {
			return nil, err
		}
		def.Annotations = string(data)
	}
	return def, nil
}
