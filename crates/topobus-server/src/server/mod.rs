mod api;
mod assets;
mod config;
mod validation;

use crate::cli::Args;
use anyhow::Result;
use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use config::ServerConfig;

pub async fn start_server(args: Args) -> Result<()> {
    let config = ServerConfig::from_args(&args);
    let app = Router::new()
        // API routes
        .route("/api/upload", post(api::handle_upload))
        .route("/api/health", get(api::health_check))
        .layer(DefaultBodyLimit::max(config.max_upload_size_bytes))
        .with_state(config.clone())
        // Static assets
        .fallback(assets::serve_assets);

    let app = if config.enable_cors {
        app.layer(CorsLayer::permissive())
    } else {
        app
    };

    let addr = SocketAddr::from((config.bind_address.parse::<std::net::IpAddr>()?, config.port));
    log::info!("Server listening on http://{}", addr);

    // Open browser unless --no-browser is specified
    if !args.no_browser {
        let url = format!("http://{}", addr);
        log::info!("Opening browser at {}", url);
        if let Err(e) = open::that(&url) {
            log::warn!("Failed to open browser: {}", e);
        }
    }

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
