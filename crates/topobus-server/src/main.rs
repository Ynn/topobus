mod cli;
mod server;

use anyhow::Result;
use clap::Parser;
use env_logger::Env;

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();

    let args = cli::Args::parse();

    log::info!("Starting TopoBus on port {}", args.port);

    server::start_server(args).await
}
