use std::{
    env,
    fs,
    path::{Path, PathBuf},
};

fn main() {
    // Re-run when git state changes (best-effort for local dev). In CI, builds are fresh anyway.
    rerun_if_git_changed();

    let repo_root = repo_root_from_manifest_dir();
    let frontend_dir = repo_root.join("frontend");

    // Prefer GitHub Actions SHA (works for Pages builds).
    let build_id = env::var("GITHUB_SHA")
        .ok()
        .and_then(|s| short_sha(&s))
        .or_else(|| read_git_sha(&repo_root).and_then(|s| short_sha(&s)))
        .unwrap_or_else(|| "dev".to_string());

    // Write generated files into frontend/ so they are published by GitHub Pages.
    write_generated_files(&frontend_dir, &build_id);
}

fn repo_root_from_manifest_dir() -> PathBuf {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    // crates/topobus-wasm -> repo root
    manifest_dir
        .parent()
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .unwrap_or(manifest_dir)
}

fn short_sha(full: &str) -> Option<String> {
    let s = full.trim();
    if s.len() < 7 {
        return None;
    }
    // 12 is a nice tradeoff; git uses 7 by default.
    Some(s.chars().take(12).collect())
}

fn rerun_if_git_changed() {
    // These cover most local scenarios.
    println!("cargo:rerun-if-changed=../../.git/HEAD");
    println!("cargo:rerun-if-changed=../../.git/packed-refs");
}

fn read_git_sha(repo_root: &Path) -> Option<String> {
    let git_path = repo_root.join(".git");

    // Support both a .git directory and a .git file pointing to gitdir (worktrees/submodules).
    let git_dir = if git_path.is_dir() {
        git_path
    } else {
        let content = fs::read_to_string(&git_path).ok()?;
        let content = content.trim();
        let prefix = "gitdir:";
        if !content.starts_with(prefix) {
            return None;
        }
        let rel = content[prefix.len()..].trim();
        let p = PathBuf::from(rel);
        if p.is_absolute() {
            p
        } else {
            repo_root.join(p)
        }
    };

    let head = fs::read_to_string(git_dir.join("HEAD")).ok()?;
    let head = head.trim();

    if let Some(rest) = head.strip_prefix("ref:") {
        let reference = rest.trim();
        // Rerun if the current ref file changes.
        println!("cargo:rerun-if-changed={}", git_dir.join(reference).display());

        // Try loose ref first.
        if let Ok(sha) = fs::read_to_string(git_dir.join(reference)) {
            return Some(sha.trim().to_string());
        }

        // Fallback: packed-refs.
        if let Ok(packed) = fs::read_to_string(git_dir.join("packed-refs")) {
            for line in packed.lines() {
                if line.starts_with('#') || line.starts_with('^') || line.trim().is_empty() {
                    continue;
                }
                let mut parts = line.split_whitespace();
                let sha = parts.next();
                let name = parts.next();
                if name == Some(reference) {
                    return sha.map(|s| s.to_string());
                }
            }
        }

        None
    } else {
        Some(head.to_string())
    }
}

fn write_generated_files(frontend_dir: &Path, build_id: &str) {
    let _ = fs::create_dir_all(frontend_dir);

    // 1) sw.generated.js
    let sw_generated = format!(
        "// GENERATED - DO NOT EDIT\n// Source: crates/topobus-wasm/build.rs\nself.__TOPOBUS_BUILD_ID__ = '{id}';\n",
        id = build_id
    );
    let sw_generated_path = frontend_dir.join("sw.generated.js");
    write_if_changed(&sw_generated_path, sw_generated.as_bytes());

    // 2) build-id.txt (optional but useful for debugging / future checks)
    let build_id_path = frontend_dir.join("build-id.txt");
    write_if_changed(&build_id_path, format!("{build_id}\n").as_bytes());
}

fn write_if_changed(path: &Path, bytes: &[u8]) {
    if let Ok(existing) = fs::read(path) {
        if existing == bytes {
            return;
        }
    }
    // Best effort: if this fails, the build should fail because SW cache-busting would be broken.
    fs::write(path, bytes).expect("write generated frontend file");
}
