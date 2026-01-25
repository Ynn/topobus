use crate::cli::Args;

#[derive(Clone, Debug)]
pub struct ServerConfig {
    pub bind_address: String,
    pub port: u16,
    pub enable_cors: bool,
    pub max_upload_size_bytes: usize,
    pub max_uncompressed_size_bytes: usize,
}

impl ServerConfig {
    pub fn from_args(args: &Args) -> Self {
        let bind_address = std::env::var("TOPOBUS_BIND_ADDRESS").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = std::env::var("TOPOBUS_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(args.port);
        let enable_cors = std::env::var("TOPOBUS_ENABLE_CORS")
            .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
            .unwrap_or(true);
        let max_upload_size_bytes = read_mb_env("TOPOBUS_MAX_UPLOAD_MB", 200);
        let max_uncompressed_size_bytes = read_mb_env("TOPOBUS_MAX_UNCOMPRESSED_MB", 600);

        Self {
            bind_address,
            port,
            enable_cors,
            max_upload_size_bytes,
            max_uncompressed_size_bytes,
        }
    }
}

fn read_mb_env(key: &str, fallback_mb: usize) -> usize {
    let value = std::env::var(key)
        .ok()
        .and_then(|raw| raw.parse::<usize>().ok())
        .unwrap_or(fallback_mb);
    value.saturating_mul(1024 * 1024)
}
