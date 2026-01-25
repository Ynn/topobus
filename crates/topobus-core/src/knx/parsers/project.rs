use roxmltree::Document;

use crate::knx::xml_tags;

pub fn extract_project_name(doc: &Document) -> String {
    doc.descendants()
        .find(|node| node.tag_name().name() == xml_tags::PROJECT_INFORMATION)
        .and_then(|node| node.attribute("Name"))
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("TopoBus Project")
        .to_string()
}
