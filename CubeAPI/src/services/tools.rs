// Copyright (c) 2024 Tencent Inc.
// SPDX-License-Identifier: Apache-2.0
//

use std::collections::HashMap;

use crate::{
    cubemaster::{
        CreateToolRequest, CubeMasterClient, CubeMasterError, HostDirStorageSource, StorageMount,
        StorageSource, Tool, ToolDeleteRequest,
    },
    error::{AppError, AppResult},
    models::{
        CreateToolRequest as CreateToolBody, ToolDetail, ToolHostDirStorageSource, ToolStorageMount,
        ToolStorageSource, ToolSummary, UpdateToolRequest as UpdateToolBody,
    },
};

#[derive(Clone)]
pub struct ToolService {
    cubemaster: CubeMasterClient,
}

impl ToolService {
    pub fn new(cubemaster: CubeMasterClient) -> Self {
        Self { cubemaster }
    }

    pub async fn list_tools(&self) -> AppResult<Vec<ToolSummary>> {
        let resp = self.cubemaster.list_tools().await.map_err(map_err)?;
        resp.ret.into_result().map_err(map_err)?;

        Ok(resp
            .data
            .into_iter()
            .map(|t| ToolSummary {
                tool_id: t.tool_id,
                name: t.name,
                template_id: t.template_id,
                instance_type: t.instance_type,
                network_type: t.network_type,
            })
            .collect())
    }

    pub async fn get_tool(&self, tool_id: &str) -> AppResult<ToolDetail> {
        let resp = self.cubemaster.get_tool(tool_id).await.map_err(map_err)?;
        resp.ret.into_result().map_err(map_err)?;

        let tool = resp.tool.ok_or_else(|| AppError::NotFound(format!("tool {} not found", tool_id)))?;
        Ok(map_cubemaster_tool_to_detail(tool))
    }

    pub async fn create_tool(&self, body: CreateToolBody) -> AppResult<ToolDetail> {
        validate_create_tool_body(&body)?;
        let req = CreateToolRequest {
            request_id: new_request_id(),
            tool: map_body_to_cubemaster_tool(body),
        };
        let resp = self.cubemaster.create_tool(&req).await.map_err(map_err)?;
        resp.ret.into_result().map_err(map_err)?;

        let tool = resp
            .tool
            .ok_or_else(|| AppError::Internal(anyhow::anyhow!("create tool response missing tool")))?;
        Ok(map_cubemaster_tool_to_detail(tool))
    }

    pub async fn update_tool(&self, tool_id: &str, body: UpdateToolBody) -> AppResult<ToolDetail> {
        validate_update_tool_body(&body)?;
        if body.tool_id.as_ref() != Some(&tool_id.to_string()) {
            return Err(AppError::BadRequest(
                "tool_id in path does not match body".to_string(),
            ));
        }
        let req = CreateToolRequest {
            request_id: new_request_id(),
            tool: map_update_body_to_cubemaster_tool(body),
        };
        let resp = self.cubemaster.update_tool(&req).await.map_err(map_err)?;
        resp.ret.into_result().map_err(map_err)?;

        let tool = resp.tool.ok_or_else(|| AppError::Internal(anyhow::anyhow!("update tool response missing tool")))?;
        Ok(map_cubemaster_tool_to_detail(tool))
    }

    pub async fn delete_tool(&self, tool_id: &str) -> AppResult<()> {
        let req = ToolDeleteRequest {
            request_id: new_request_id(),
            tool_id: tool_id.to_string(),
        };
        let resp = self.cubemaster.delete_tool(&req).await.map_err(map_err)?;
        resp.ret.into_result().map_err(map_err)?;
        Ok(())
    }
}

fn validate_create_tool_body(body: &CreateToolBody) -> AppResult<()> {
    if body.template_id.trim().is_empty() {
        return Err(AppError::BadRequest("template_id is required".to_string()));
    }
    validate_storage_mounts(&body.storage_mounts)?;
    Ok(())
}

fn validate_update_tool_body(body: &UpdateToolBody) -> AppResult<()> {
    if body.tool_id.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true) {
        return Err(AppError::BadRequest("tool_id is required".to_string()));
    }
    if body.template_id.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true) {
        return Err(AppError::BadRequest("template_id is required".to_string()));
    }
    validate_storage_mounts(&body.storage_mounts)?;
    Ok(())
}

fn validate_storage_mounts(mounts: &[ToolStorageMount]) -> AppResult<()> {
    for mount in mounts {
        if mount.name.trim().is_empty() {
            return Err(AppError::BadRequest("storage mount name is required".to_string()));
        }
        if mount.mount_path.trim().is_empty() {
            return Err(AppError::BadRequest(format!(
                "mount_path is required for storage mount {}",
                mount.name
            )));
        }
        if mount.storage_source.host_dir.as_ref().map(|h| h.host_path.trim().is_empty()).unwrap_or(true) {
            return Err(AppError::BadRequest(format!(
                "host_dir.host_path is required for storage mount {}",
                mount.name
            )));
        }
    }
    Ok(())
}

fn map_body_to_cubemaster_tool(body: CreateToolBody) -> Tool {
    map_tool_fields_to_cubemaster(
        "".to_string(), // tool_id is generated by CubeMaster
        body.name,
        body.template_id,
        None,
        None,
        None,
        None,
        body.storage_mounts,
        None,
        None,
    )
}

fn map_update_body_to_cubemaster_tool(body: UpdateToolBody) -> Tool {
    map_tool_fields_to_cubemaster(
        body.tool_id.unwrap_or_default(),
        body.name,
        body.template_id.unwrap_or_default(),
        body.instance_type,
        body.network_type,
        body.runtime_handler,
        body.default_timeout,
        body.storage_mounts,
        body.labels,
        body.annotations,
    )
}

fn map_tool_fields_to_cubemaster(
    tool_id: String,
    name: Option<String>,
    template_id: String,
    instance_type: Option<String>,
    network_type: Option<String>,
    runtime_handler: Option<String>,
    default_timeout: Option<i32>,
    storage_mounts: Vec<ToolStorageMount>,
    labels: Option<HashMap<String, String>>,
    annotations: Option<HashMap<String, String>>,
) -> Tool {
    Tool {
        tool_id,
        name,
        template_id,
        instance_type,
        network_type,
        runtime_handler,
        default_timeout,
        storage_mounts: storage_mounts
            .into_iter()
            .map(|m| StorageMount {
                name: m.name,
                mount_path: m.mount_path,
                read_only: m.read_only,
                sub_path: m.sub_path.unwrap_or_default(),
                storage_source: StorageSource {
                    host_dir: m.storage_source.host_dir.map(|h| HostDirStorageSource {
                        host_path: h.host_path,
                    }),
                },
            })
            .collect(),
        labels,
        annotations,
    }
}

fn map_cubemaster_tool_to_detail(tool: Tool) -> ToolDetail {
    ToolDetail {
        tool_id: tool.tool_id,
        name: tool.name,
        template_id: tool.template_id,
        instance_type: tool.instance_type,
        network_type: tool.network_type,
        runtime_handler: tool.runtime_handler,
        default_timeout: tool.default_timeout,
        storage_mounts: tool
            .storage_mounts
            .into_iter()
            .map(|m| ToolStorageMount {
                name: m.name,
                mount_path: m.mount_path,
                read_only: m.read_only,
                sub_path: if m.sub_path.is_empty() {
                    None
                } else {
                    Some(m.sub_path)
                },
                storage_source: ToolStorageSource {
                    host_dir: m.storage_source.host_dir.map(|h| ToolHostDirStorageSource {
                        host_path: h.host_path,
                    }),
                },
            })
            .collect(),
        labels: tool.labels,
        annotations: tool.annotations,
    }
}

fn map_err(e: CubeMasterError) -> AppError {
    match e {
        CubeMasterError::Api {
            ret_code: 130404, ..
        } => AppError::NotFound(e.to_string()),
        _ => AppError::Internal(anyhow::anyhow!(e.to_string())),
    }
}

fn new_request_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
