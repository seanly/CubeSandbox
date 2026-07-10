// Copyright (c) 2024 Tencent Inc.
// SPDX-License-Identifier: Apache-2.0
//

package cube

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/tencentcloud/CubeSandbox/CubeMaster/pkg/base/log"
	"github.com/tencentcloud/CubeSandbox/CubeMaster/pkg/errorcode"
	"github.com/tencentcloud/CubeSandbox/CubeMaster/pkg/service/httpservice/common"
	"github.com/tencentcloud/CubeSandbox/CubeMaster/pkg/service/sandbox/types"
	"github.com/tencentcloud/CubeSandbox/CubeMaster/pkg/tools"
	"github.com/tencentcloud/CubeSandbox/cubelog"
)

var (
	createToolFn = tools.CreateTool
	getToolFn    = tools.GetTool
	listToolsFn  = listToolsFromStore
	updateToolFn = updateToolInStore
	deleteToolFn = deleteToolFromStore
)

func listToolsFromStore(ctx context.Context) ([]*tools.Tool, error) {
	store := tools.GetDefaultStore()
	if store == nil {
		return nil, errors.New("tool store not initialized")
	}
	return store.ListTools(ctx)
}

func updateToolInStore(ctx context.Context, tool *tools.Tool) error {
	store := tools.GetDefaultStore()
	if store == nil {
		return errors.New("tool store not initialized")
	}
	return store.UpdateTool(ctx, tool)
}

func deleteToolFromStore(ctx context.Context, toolID string) error {
	store := tools.GetDefaultStore()
	if store == nil {
		return errors.New("tool store not initialized")
	}
	return store.DeleteTool(ctx, toolID)
}

type toolCreateUpdateRequest struct {
	*types.Request
	Tool *tools.Tool `json:"tool,omitempty"`
}

type toolResponse struct {
	*types.Res
	Tool *tools.Tool `json:"tool,omitempty"`
}

type toolListResponse struct {
	*types.Res
	Data []*tools.Tool `json:"data,omitempty"`
}

type toolDeleteRequest struct {
	*types.Request
	ToolID string `json:"tool_id,omitempty"`
}

func handleToolAction(w http.ResponseWriter, r *http.Request, rt *CubeLog.RequestTrace) interface{} {
	switch r.Method {
	case http.MethodPost:
		return createTool(w, r, rt)
	case http.MethodGet:
		if strings.HasPrefix(r.URL.Path, actionURI(ToolAction)+"/") {
			return getTool(w, r, rt)
		}
		return listTools(w, r, rt)
	case http.MethodPut:
		return updateTool(w, r, rt)
	case http.MethodDelete:
		return deleteTool(w, r, rt)
	default:
		return &types.Res{
			Ret: &types.Ret{
				RetCode: int(errorcode.ErrorCode_MasterParamsError),
				RetMsg:  http.StatusText(http.StatusMethodNotAllowed),
			},
		}
	}
}

func createTool(w http.ResponseWriter, r *http.Request, rt *CubeLog.RequestTrace) interface{} {
	_ = w
	req := &toolCreateUpdateRequest{}
	if err := common.GetBodyReq(r, req); err != nil {
		return newToolErrorResponse(req.RequestID, errorcode.ErrorCode_MasterParamsError, err.Error())
	}
	if req.Tool == nil {
		return newToolErrorResponse(req.RequestID, errorcode.ErrorCode_MasterParamsError, "tool is required")
	}
	if req.Tool.ToolID == "" {
		return newToolErrorResponse(req.RequestID, errorcode.ErrorCode_MasterParamsError, "tool_id is required")
	}
	if req.Tool.TemplateID == "" {
		return newToolErrorResponse(req.RequestID, errorcode.ErrorCode_MasterParamsError, "template_id is required")
	}

	ctx := log.WithLogger(r.Context(), log.G(r.Context()).WithFields(map[string]any{
		"RequestId": req.RequestID,
		"ToolID":    req.Tool.ToolID,
		"Action":    "CreateTool",
	}))

	if err := createToolFn(ctx, req.Tool); err != nil {
		return newToolErrorResponse(req.RequestID, errorcode.ErrorCode_MasterInternalError, err.Error())
	}

	return &toolResponse{
		Res:  &types.Res{RequestID: req.RequestID, Ret: &types.Ret{RetCode: int(errorcode.ErrorCode_Success)}},
		Tool: req.Tool,
	}
}

func getTool(w http.ResponseWriter, r *http.Request, rt *CubeLog.RequestTrace) interface{} {
	_ = w
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		return newToolErrorResponse("", errorcode.ErrorCode_MasterParamsError, "tool_id is required")
	}
	toolID := parts[len(parts)-1]

	ctx := log.WithLogger(r.Context(), log.G(r.Context()).WithFields(map[string]any{
		"ToolID": toolID,
		"Action": "GetTool",
	}))

	tool, err := getToolFn(ctx, toolID)
	if err != nil {
		code := errorcode.ErrorCode_MasterInternalError
		if strings.Contains(err.Error(), "not found") {
			code = errorcode.ErrorCode_NotFound
		}
		return newToolErrorResponse("", code, err.Error())
	}

	return &toolResponse{
		Res:  &types.Res{Ret: &types.Ret{RetCode: int(errorcode.ErrorCode_Success)}},
		Tool: tool,
	}
}

func listTools(w http.ResponseWriter, r *http.Request, rt *CubeLog.RequestTrace) interface{} {
	_ = w
	ctx := log.WithLogger(r.Context(), log.G(r.Context()).WithFields(map[string]any{
		"Action": "ListTools",
	}))

	tools, err := listToolsFn(ctx)
	if err != nil {
		return newToolErrorResponse("", errorcode.ErrorCode_MasterInternalError, err.Error())
	}

	return &toolListResponse{
		Res:  &types.Res{Ret: &types.Ret{RetCode: int(errorcode.ErrorCode_Success)}},
		Data: tools,
	}
}

func updateTool(w http.ResponseWriter, r *http.Request, rt *CubeLog.RequestTrace) interface{} {
	_ = w
	req := &toolCreateUpdateRequest{}
	if err := common.GetBodyReq(r, req); err != nil {
		return newToolErrorResponse(req.RequestID, errorcode.ErrorCode_MasterParamsError, err.Error())
	}
	if req.Tool == nil {
		return newToolErrorResponse(req.RequestID, errorcode.ErrorCode_MasterParamsError, "tool is required")
	}
	if req.Tool.ToolID == "" {
		return newToolErrorResponse(req.RequestID, errorcode.ErrorCode_MasterParamsError, "tool_id is required")
	}

	ctx := log.WithLogger(r.Context(), log.G(r.Context()).WithFields(map[string]any{
		"RequestId": req.RequestID,
		"ToolID":    req.Tool.ToolID,
		"Action":    "UpdateTool",
	}))

	if err := updateToolFn(ctx, req.Tool); err != nil {
		return newToolErrorResponse(req.RequestID, errorcode.ErrorCode_MasterInternalError, err.Error())
	}

	return &toolResponse{
		Res:  &types.Res{RequestID: req.RequestID, Ret: &types.Ret{RetCode: int(errorcode.ErrorCode_Success)}},
		Tool: req.Tool,
	}
}

func deleteTool(w http.ResponseWriter, r *http.Request, rt *CubeLog.RequestTrace) interface{} {
	_ = w
	req := &toolDeleteRequest{}
	if err := common.GetBodyReq(r, req); err != nil {
		return newToolErrorResponse(req.RequestID, errorcode.ErrorCode_MasterParamsError, err.Error())
	}
	if req.ToolID == "" {
		return newToolErrorResponse(req.RequestID, errorcode.ErrorCode_MasterParamsError, "tool_id is required")
	}

	ctx := log.WithLogger(r.Context(), log.G(r.Context()).WithFields(map[string]any{
		"RequestId": req.RequestID,
		"ToolID":    req.ToolID,
		"Action":    "DeleteTool",
	}))

	if err := deleteToolFn(ctx, req.ToolID); err != nil {
		return newToolErrorResponse(req.RequestID, errorcode.ErrorCode_MasterInternalError, err.Error())
	}

	return &types.Res{
		RequestID: req.RequestID,
		Ret:       &types.Ret{RetCode: int(errorcode.ErrorCode_Success)},
	}
}

func newToolErrorResponse(requestID string, code errorcode.ErrorCode, msg string) *toolResponse {
	return &toolResponse{
		Res: &types.Res{
			RequestID: requestID,
			Ret: &types.Ret{
				RetCode: int(code),
				RetMsg:  msg,
			},
		},
	}
}
