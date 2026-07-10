// Copyright (c) 2026 Tencent Inc.
// SPDX-License-Identifier: Apache-2.0
//

//! Tool handlers — forwarder to CubeMaster `/cube/tool` endpoints.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use crate::{
    error::{AppError, AppResult},
    models::{ApiError, CreateToolRequest, ToolDetail, ToolSummary},
    state::AppState,
};

// ─── GET /tools ───────────────────────────────────────────────────────────────

#[utoipa::path(
    get,
    path = "/tools",
    responses(
        (status = 200, description = "Tool list", body = [ToolSummary]),
        (status = 500, description = "Unexpected backend error", body = ApiError)
    )
)]
pub async fn list_tools(State(state): State<AppState>) -> AppResult<impl IntoResponse> {
    let items = state.services.tools.list_tools().await?;
    Ok((StatusCode::OK, Json(items)))
}

// ─── GET /tools/:toolID ───────────────────────────────────────────────────────

#[utoipa::path(
    get,
    path = "/tools/{toolID}",
    params(
        ("toolID" = String, Path, description = "Tool identifier")
    ),
    responses(
        (status = 200, description = "Tool detail", body = ToolDetail),
        (status = 404, description = "Tool not found", body = ApiError),
        (status = 500, description = "Unexpected backend error", body = ApiError)
    )
)]
pub async fn get_tool(
    State(state): State<AppState>,
    Path(tool_id): Path<String>,
) -> AppResult<impl IntoResponse> {
    let detail = state.services.tools.get_tool(&tool_id).await?;
    Ok((StatusCode::OK, Json(detail)))
}

// ─── POST /tools ──────────────────────────────────────────────────────────────

#[utoipa::path(
    post,
    path = "/tools",
    request_body = CreateToolRequest,
    responses(
        (status = 201, description = "Tool created", body = ToolDetail),
        (status = 400, description = "Bad request", body = ApiError),
        (status = 500, description = "Unexpected backend error", body = ApiError)
    )
)]
pub async fn create_tool(
    State(state): State<AppState>,
    Json(body): Json<CreateToolRequest>,
) -> AppResult<impl IntoResponse> {
    let detail = state.services.tools.create_tool(body).await?;
    Ok((StatusCode::CREATED, Json(detail)))
}

// ─── PATCH /tools/:toolID ─────────────────────────────────────────────────────

#[utoipa::path(
    patch,
    path = "/tools/{toolID}",
    params(
        ("toolID" = String, Path, description = "Tool identifier")
    ),
    request_body = CreateToolRequest,
    responses(
        (status = 200, description = "Tool updated", body = ToolDetail),
        (status = 400, description = "Bad request", body = ApiError),
        (status = 404, description = "Tool not found", body = ApiError),
        (status = 500, description = "Unexpected backend error", body = ApiError)
    )
)]
pub async fn update_tool(
    State(state): State<AppState>,
    Path(tool_id): Path<String>,
    Json(body): Json<CreateToolRequest>,
) -> AppResult<impl IntoResponse> {
    let detail = state.services.tools.update_tool(&tool_id, body).await?;
    Ok((StatusCode::OK, Json(detail)))
}

// ─── DELETE /tools/:toolID ────────────────────────────────────────────────────

#[utoipa::path(
    delete,
    path = "/tools/{toolID}",
    params(
        ("toolID" = String, Path, description = "Tool identifier")
    ),
    responses(
        (status = 204, description = "Tool deleted"),
        (status = 404, description = "Tool not found", body = ApiError),
        (status = 500, description = "Unexpected backend error", body = ApiError)
    )
)]
pub async fn delete_tool(
    State(state): State<AppState>,
    Path(tool_id): Path<String>,
) -> AppResult<impl IntoResponse> {
    state.services.tools.delete_tool(&tool_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
