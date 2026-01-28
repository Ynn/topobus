use axum::{
    body::Body,
    http::{header, Response, StatusCode, Uri},
    response::IntoResponse,
};
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "../../frontend/"]
struct Assets;

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

pub async fn serve_sw() -> impl IntoResponse {
    match Assets::get("sw.js") {
        Some(content) => {
            let source = String::from_utf8_lossy(&content.data);
            let body = source.replace("__TOPOBUS_VERSION__", APP_VERSION);
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/javascript; charset=utf-8")
                // Service workers must update reliably; prevent sticky caching.
                .header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")
                .header(header::PRAGMA, "no-cache")
                .header(header::EXPIRES, "0")
                .body(Body::from(body.into_bytes()))
                .unwrap()
        }
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("404 Not Found"))
            .unwrap(),
    }
}

pub async fn serve_assets(uri: Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');

    // Default to index.html for root
    let path = if path.is_empty() { "index.html" } else { path };

    match Assets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            let mut builder = Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, mime.as_ref());

            // Default to no-cache to reduce mixed-version issues during deploys.
            // (Files are not content-hashed, so long-lived caching would be unsafe.)
            if path == "index.html" || path == "manifest.json" {
                builder = builder
                    .header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")
                    .header(header::PRAGMA, "no-cache")
                    .header(header::EXPIRES, "0");
            } else {
                builder = builder.header(header::CACHE_CONTROL, "no-cache");
            }

            builder.body(Body::from(content.data)).unwrap()
        }
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("404 Not Found"))
            .unwrap(),
    }
}
