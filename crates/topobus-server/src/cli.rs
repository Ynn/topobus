use clap::Parser;

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
pub struct Args {
    /// Path to .knxproj file (optional, can be uploaded via web interface)
    pub knxproj_path: Option<String>,

    /// Port to serve on
    #[arg(short, long, default_value_t = 8080)]
    pub port: u16,

    /// Do not auto-open the browser
    #[arg(long)]
    pub no_browser: bool,
}
