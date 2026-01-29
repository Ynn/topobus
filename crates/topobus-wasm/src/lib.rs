#[cfg(target_arch = "wasm32")]
use serde::Serialize;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
use topobus_core::{build_project_graphs, load_knxproj_bytes_with_language};

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn parse_knxproj(
    data: &[u8],
    password: Option<String>,
    preferred_language: Option<String>,
) -> Result<JsValue, JsValue> {
    let project = load_knxproj_bytes_with_language(
        data,
        password.as_deref(),
        preferred_language.as_deref(),
    )
    .map_err(to_js_error)?;
    let graphs = build_project_graphs(&project);
    let serializer = serde_wasm_bindgen::Serializer::json_compatible();
    graphs.serialize(&serializer).map_err(to_js_error)
}

#[cfg(target_arch = "wasm32")]
fn to_js_error(err: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&err.to_string())
}
