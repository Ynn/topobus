use axum::{extract::{Multipart, State}, http::StatusCode, Json};

use topobus_core::{
    build_project_graphs,
    load_knxproj_bytes_with_language,
    InvalidPasswordError,
    PasswordRequiredError,
    ProjectGraphs,
};
use crate::server::config::ServerConfig;
use crate::server::validation::{FileValidator, ValidationError};

pub async fn health_check() -> &'static str {
    "OK"
}

pub async fn handle_upload(
    State(config): State<ServerConfig>,
    mut multipart: Multipart,
) -> Result<Json<ProjectGraphs>, (StatusCode, String)> {
    log::info!("Received file upload request");

    let mut filename = None;
    let mut data = None;
    let mut password: Option<String> = None;
    let mut preferred_language: Option<String> = None;

    while let Some(field) = multipart.next_field().await.map_err(|e| {
        (
            StatusCode::BAD_REQUEST,
            format!("Failed to read form data: {}", e),
        )
    })? {
        let name = field.name().unwrap_or("");
        if name == "file" {
            filename = Some(field.file_name().unwrap_or("upload.knxproj").to_string());
            data = Some(field.bytes().await.map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    format!("Failed to read file data: {}", e),
                )
            })?);
        } else if name == "password" {
            let value = field.text().await.map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    format!("Failed to read password: {}", e),
                )
            })?;
            let value = value.trim().to_string();
            if !value.is_empty() {
                password = Some(value);
            }
        } else if name == "product_language" {
            let value = field.text().await.map_err(|e| {
                (
                    StatusCode::BAD_REQUEST,
                    format!("Failed to read product language: {}", e),
                )
            })?;
            let value = value.trim().to_string();
            if !value.is_empty() {
                preferred_language = Some(value);
            }
        }
    }

    let filename = filename.ok_or((StatusCode::BAD_REQUEST, "No file in request".to_string()))?;
    let data = data.ok_or((
        StatusCode::BAD_REQUEST,
        "No file content in request".to_string(),
    ))?;

    log::info!("Uploading file: {} ({} bytes)", filename, data.len());
    match password.as_ref() {
        Some(value) => {
            log::info!("Password provided (len={})", value.len());
        }
        None => {
            log::info!("No password provided");
        }
    }

    let validator = FileValidator::new(
        config.max_upload_size_bytes,
        config.max_uncompressed_size_bytes,
    );
    if let Err(error) = validator.validate_upload(&filename, data.as_ref()) {
        let status = match error {
            ValidationError::FileTooLarge { .. } => StatusCode::PAYLOAD_TOO_LARGE,
            ValidationError::InvalidFileFormat { .. } => StatusCode::BAD_REQUEST,
            ValidationError::InvalidArchive => StatusCode::BAD_REQUEST,
            ValidationError::UncompressedTooLarge { .. } => StatusCode::BAD_REQUEST,
            ValidationError::ArchiveError(_) => StatusCode::BAD_REQUEST,
        };
        log::warn!("Upload validation failed: {}", error);
        return Err((status, error.to_string()));
    }

    // Parse the KNX project
    let project_data = load_knxproj_bytes_with_language(
        data.as_ref(),
        password.as_deref(),
        preferred_language.as_deref(),
    )
    .map_err(|e| {
        log::warn!("KNX parse error: {:?}", e);
        if e.downcast_ref::<PasswordRequiredError>().is_some() {
            (
                StatusCode::BAD_REQUEST,
                "Encrypted KNX project: password required".to_string(),
            )
        } else if e.downcast_ref::<InvalidPasswordError>().is_some() {
            (
                StatusCode::BAD_REQUEST,
                "Invalid password for KNX project".to_string(),
            )
        } else {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to parse KNX project: {}", e),
            )
        }
    })?;

    log::info!("Project parsed successfully");

    Ok(Json(build_project_graphs(&project_data)))
}
