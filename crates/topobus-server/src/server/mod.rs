mod api;
mod assets;

use crate::cli::Args;
use anyhow::Result;
use axum::{
    extract::DefaultBodyLimit,
    routing::{get, post},
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

pub async fn start_server(args: Args) -> Result<()> {
    let app = Router::new()
        // API routes
        .route("/api/upload", post(api::handle_upload))
        .route("/api/health", get(api::health_check))
        .layer(DefaultBodyLimit::max(200 * 1024 * 1024))
        .layer(CorsLayer::permissive())
        // Static assets
        .fallback(assets::serve_assets);

    let addr = SocketAddr::from(([127, 0, 0, 1], args.port));
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
