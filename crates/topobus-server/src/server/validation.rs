use std::fmt;
use std::io::Cursor;

pub struct FileValidator {
    max_size_bytes: usize,
    max_uncompressed_size_bytes: u64,
}

impl FileValidator {
    pub fn new(max_size_bytes: usize, max_uncompressed_size_bytes: usize) -> Self {
        Self {
            max_size_bytes,
            max_uncompressed_size_bytes: max_uncompressed_size_bytes as u64,
        }
    }

    pub fn validate_upload(&self, filename: &str, data: &[u8]) -> Result<(), ValidationError> {
        if data.len() > self.max_size_bytes {
            return Err(ValidationError::FileTooLarge {
                size: data.len(),
                max: self.max_size_bytes,
            });
        }

        if !is_knxproj_filename(filename) {
            return Err(ValidationError::InvalidFileFormat {
                expected: "*.knxproj",
                got: filename.to_string(),
            });
        }

        if !is_zip_signature(data) {
            return Err(ValidationError::InvalidArchive);
        }

        let uncompressed_size = estimate_uncompressed_size(data)?;
        if uncompressed_size > self.max_uncompressed_size_bytes {
            return Err(ValidationError::UncompressedTooLarge {
                size: uncompressed_size,
                max: self.max_uncompressed_size_bytes,
            });
        }

        Ok(())
    }
}

#[derive(Debug)]
pub enum ValidationError {
    FileTooLarge { size: usize, max: usize },
    InvalidFileFormat { expected: &'static str, got: String },
    InvalidArchive,
    UncompressedTooLarge { size: u64, max: u64 },
    ArchiveError(String),
}

impl fmt::Display for ValidationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValidationError::FileTooLarge { size, max } => {
                write!(f, "File too large ({} bytes, max {} bytes)", size, max)
            }
            ValidationError::InvalidFileFormat { expected, got } => {
                write!(f, "Invalid file format (expected {}, got {})", expected, got)
            }
            ValidationError::InvalidArchive => write!(f, "Invalid or corrupted ZIP archive"),
            ValidationError::UncompressedTooLarge { size, max } => {
                write!(f, "Uncompressed data too large ({} bytes, max {} bytes)", size, max)
            }
            ValidationError::ArchiveError(message) => write!(f, "Archive error: {}", message),
        }
    }
}

impl std::error::Error for ValidationError {}

fn is_knxproj_filename(filename: &str) -> bool {
    filename.to_lowercase().ends_with(".knxproj")
}

fn is_zip_signature(data: &[u8]) -> bool {
    if data.len() < 4 {
        return false;
    }
    matches!(
        &data[0..4],
        b"PK\x03\x04" | b"PK\x05\x06" | b"PK\x07\x08"
    )
}

fn estimate_uncompressed_size(data: &[u8]) -> Result<u64, ValidationError> {
    let cursor = Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| ValidationError::ArchiveError(e.to_string()))?;
    let mut total: u64 = 0;
    for i in 0..archive.len() {
        let file = archive
            .by_index(i)
            .map_err(|e| ValidationError::ArchiveError(e.to_string()))?;
        total = total.saturating_add(file.size());
    }
    Ok(total)
}
