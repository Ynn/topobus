use anyhow::Result;
use roxmltree::Document;

use crate::knx::model::{AreaInfo, LineInfo};
use crate::knx::xml_tags;
use crate::knx::xml_utils::{attr_value, find_elements_by_tag, medium_name, required_ancestor_address, required_attribute};

pub fn extract_topology_metadata(doc: &Document) -> Result<(Vec<AreaInfo>, Vec<LineInfo>)> {
    let mut areas = Vec::new();
    let mut lines = Vec::new();

    for area in find_elements_by_tag(doc, xml_tags::AREA) {
        let address = match required_attribute(&area, "Address") {
            Ok(value) => value,
            Err(error) => {
                log::warn!("Skipping Area without Address: {}", error);
                continue;
            }
        };
        areas.push(AreaInfo {
            address,
            name: attr_value(&area, "Name"),
            description: attr_value(&area, "Description"),
            comment: attr_value(&area, "Comment"),
            completion_status: attr_value(&area, "CompletionStatus"),
        });
    }

    for line in find_elements_by_tag(doc, xml_tags::LINE) {
        let address = match required_attribute(&line, "Address") {
            Ok(value) => value,
            Err(error) => {
                log::warn!("Skipping Line without Address: {}", error);
                continue;
            }
        };
        let area = match required_ancestor_address(&line, xml_tags::AREA) {
            Ok(value) => value,
            Err(error) => {
                log::warn!("Skipping Line without Area ancestor: {}", error);
                continue;
            }
        };
        let medium_type = line
            .children()
            .find(|node| node.is_element() && node.tag_name().name() == xml_tags::SEGMENT)
            .and_then(|node| attr_value(&node, "MediumTypeRefId"))
            .or_else(|| attr_value(&line, "MediumTypeRefId"))
            .map(|value| medium_name(&value));

        lines.push(LineInfo {
            area,
            line: address,
            name: attr_value(&line, "Name"),
            description: attr_value(&line, "Description"),
            comment: attr_value(&line, "Comment"),
            medium_type,
            completion_status: attr_value(&line, "CompletionStatus"),
        });
    }

    Ok((areas, lines))
}
