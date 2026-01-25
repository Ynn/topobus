use std::io::{Read, Seek};

use anyhow::{Context, Result};
use zip::ZipArchive;

pub(crate) fn strip_bom(input: &str) -> &str {
    input.strip_prefix('\u{feff}').unwrap_or(input)
}

pub(crate) fn read_zip_entry<R: Read + Seek>(zip: &mut ZipArchive<R>, path: &str) -> Result<String> {
    let mut file = zip
        .by_name(path)
        .with_context(|| format!("Missing file in .knxproj: {}", path))?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .with_context(|| format!("Failed to read {}", path))?;
    Ok(contents)
}
