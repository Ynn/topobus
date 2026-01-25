use roxmltree::Document;
use std::collections::HashMap;

use crate::knx::xml_tags;
use crate::knx::xml_utils::attr_value;

pub(crate) fn strip_prefix(value: &str, prefix: &str) -> String {
    value.strip_prefix(prefix).unwrap_or(value).to_string()
}

pub(crate) fn attr_value_localized(
    node: &roxmltree::Node,
    name: &str,
    translations: &HashMap<String, HashMap<String, String>>,
    prefix: &str,
) -> Option<String> {
    let id = node.attribute("Id").unwrap_or("");
    if !id.is_empty() {
        let key = strip_prefix(id, prefix);
        if let Some(map) = translations.get(&key) {
            if let Some(text) = map.get(name) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    return Some(trimmed.to_string());
                }
            }
        }
    }
    attr_value(node, name)
}

pub(crate) fn build_translations(
    doc: &Document,
    prefix: &str,
) -> HashMap<String, HashMap<String, String>> {
    let mut map = HashMap::new();
    let language = select_language(doc);
    if language.is_none() {
        return map;
    }
    let language = language.unwrap();

    let language_node = doc
        .descendants()
        .find(|node| node.tag_name().name() == xml_tags::LANGUAGE && node.attribute("Identifier") == Some(language.as_str()));
    let language_node = match language_node {
        Some(node) => node,
        None => return map,
    };

    for unit in language_node
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::TRANSLATION_UNIT)
    {
        for element in unit
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == xml_tags::TRANSLATION_ELEMENT)
        {
            let ref_id = element.attribute("RefId").unwrap_or("");
            if ref_id.is_empty() {
                continue;
            }
            let key = strip_prefix(ref_id, prefix);
            for trans in element
                .children()
                .filter(|n| n.is_element() && n.tag_name().name() == xml_tags::TRANSLATION)
            {
                let attr_name = trans.attribute("AttributeName").unwrap_or("");
                let text = trans.attribute("Text").unwrap_or("");
                if attr_name.is_empty() || text.trim().is_empty() {
                    continue;
                }
                map.entry(key.clone())
                    .or_insert_with(HashMap::new)
                    .insert(attr_name.to_string(), text.to_string());
            }
        }
    }

    map
}

fn select_language(doc: &Document) -> Option<String> {
    let mut first = None;
    for node in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::LANGUAGE)
    {
        let id = match node.attribute("Identifier") {
            Some(value) => value.trim(),
            None => continue,
        };
        if id.is_empty() {
            continue;
        }
        if first.is_none() {
            first = Some(id.to_string());
        }
        if id.to_ascii_lowercase().starts_with("en") {
            return Some(id.to_string());
        }
    }
    first
}
