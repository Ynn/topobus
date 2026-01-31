use std::collections::HashMap;

use roxmltree::{Document, Node};

use crate::knx::app_model::{
    AppProgram,
    ParameterDef,
    ParameterRefDef,
    ParameterTypeDef,
    ParameterTypeKind,
};
use crate::knx::model::DeviceConfigEntry;
use crate::knx::parsers::translations::{attr_value_localized, strip_prefix};
use crate::knx::xml_tags;
use crate::knx::xml_utils::{attr_value, short_id};

pub(crate) fn parse_parameter_definitions(
    doc: &Document,
    prefix: &str,
    translations: &HashMap<String, HashMap<String, String>>,
) -> HashMap<String, ParameterDef> {
    let mut parameters = HashMap::new();
    for param in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::PARAMETER)
    {
        let id = match param.attribute("Id") {
            Some(id) => id,
            None => continue,
        };
        parameters.insert(
            strip_prefix(id, prefix),
            ParameterDef {
                name: attr_value_localized(&param, "Name", translations, prefix),
                text: attr_value_localized(&param, "Text", translations, prefix),
                parameter_type_ref: param
                    .attribute("ParameterType")
                    .map(|value| strip_prefix(value, prefix)),
            },
        );
    }
    parameters
}

pub(crate) fn parse_parameter_types(
    doc: &Document,
    prefix: &str,
    translations: &HashMap<String, HashMap<String, String>>,
) -> HashMap<String, ParameterTypeDef> {
    let mut types = HashMap::new();
    for param_type in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::PARAMETER_TYPE)
    {
        let id = match param_type.attribute("Id") {
            Some(id) => id,
            None => continue,
        };
        let mut def = ParameterTypeDef {
            name: attr_value_localized(&param_type, "Name", translations, prefix),
            ..ParameterTypeDef::default()
        };
        if let Some(restriction) = param_type
            .children()
            .find(|node| node.is_element() && node.tag_name().name() == xml_tags::TYPE_RESTRICTION)
        {
            def.kind = ParameterTypeKind::Enum;
            def.base = restriction.attribute("Base").map(|value| value.to_string());
            def.size_bits = restriction
                .attribute("SizeInBit")
                .and_then(|value| value.parse().ok());
            let mut enum_values = HashMap::new();
            for entry in restriction
                .children()
                .filter(|node| node.is_element() && node.tag_name().name() == xml_tags::ENUMERATION)
            {
                let value = entry.attribute("Value").unwrap_or("").trim();
                if value.is_empty() {
                    continue;
                }
                let text = attr_value_localized(&entry, "Text", translations, prefix).unwrap_or_default();
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    enum_values.insert(value.to_string(), trimmed.to_string());
                }
            }
            def.enum_values = enum_values;
        } else if let Some(number) = param_type
            .children()
            .find(|node| node.is_element() && node.tag_name().name() == xml_tags::TYPE_NUMBER)
        {
            def.kind = ParameterTypeKind::Number;
            def.size_bits = number.attribute("SizeInBit").and_then(|value| value.parse().ok());
            def.min = number.attribute("minInclusive").and_then(|value| value.parse().ok());
            def.max = number.attribute("maxInclusive").and_then(|value| value.parse().ok());
            def.base = number.attribute("Type").map(|value| value.to_string());
        } else {
            def.kind = ParameterTypeKind::Unknown;
        }

        types.insert(strip_prefix(id, prefix), def);
    }
    types
}

pub(crate) fn parse_parameter_refs(
    doc: &Document,
    prefix: &str,
    translations: &HashMap<String, HashMap<String, String>>,
) -> HashMap<String, ParameterRefDef> {
    let mut refs = HashMap::new();
    for param_ref in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::PARAMETER_REF)
    {
        let id = match param_ref.attribute("Id") {
            Some(id) => id,
            None => continue,
        };
        let ref_id = match param_ref.attribute("RefId") {
            Some(value) => value,
            None => continue,
        };
        refs.insert(
            strip_prefix(id, prefix),
            ParameterRefDef {
                parameter_id: strip_prefix(ref_id, prefix),
                name: attr_value_localized(&param_ref, "Name", translations, prefix),
                text: attr_value_localized(&param_ref, "Text", translations, prefix),
                value: attr_value(&param_ref, "Value"),
                tag: attr_value(&param_ref, "Tag"),
                display_order: param_ref
                    .attribute("DisplayOrder")
                    .and_then(|value| value.parse().ok()),
            },
        );
    }
    refs
}

pub(crate) fn parse_parameter_ref_context(
    doc: &Document,
    prefix: &str,
    translations: &HashMap<String, HashMap<String, String>>,
) -> HashMap<String, String> {
    let mut contexts = HashMap::new();
    for node in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::PARAMETER_REF_REF)
    {
        let ref_id = match node.attribute("RefId") {
            Some(id) => id,
            None => continue,
        };
        if let Some(context) = build_context_path(&node, translations, prefix) {
            contexts.insert(strip_prefix(ref_id, prefix), context);
        }
    }
    contexts
}

fn build_context_path(
    node: &Node<'_, '_>,
    translations: &HashMap<String, HashMap<String, String>>,
    prefix: &str,
) -> Option<String> {
    let mut parts = Vec::new();
    for ancestor in node.ancestors() {
        match ancestor.tag_name().name() {
            xml_tags::CHANNEL => {
                if let Some(name) = translated_attr_only(&ancestor, "Text", translations, prefix)
                    .or_else(|| translated_attr_only(&ancestor, "Name", translations, prefix))
                    .or_else(|| attr_value(&ancestor, "Text"))
                    .or_else(|| attr_value(&ancestor, "Name"))
                {
                    parts.push(format!("Channel: {}", name));
                }
            }
            xml_tags::PARAMETER_BLOCK => {
                let mut name = translated_attr_only(&ancestor, "Text", translations, prefix)
                    .or_else(|| translated_attr_only(&ancestor, "Name", translations, prefix));
                if name.is_none() {
                    if let Some(param_ref_id) = ancestor.attribute("ParamRefId") {
                        name = resolve_param_ref_title(param_ref_id, translations, prefix);
                    }
                }
                if name.is_none() {
                    name = attr_value(&ancestor, "Text").or_else(|| attr_value(&ancestor, "Name"));
                }
                if let Some(name) = name {
                    parts.push(format!("Block: {}", name));
                }
            }
            xml_tags::MODULE => {
                if let Some(name) = translated_attr_only(&ancestor, "Text", translations, prefix)
                    .or_else(|| translated_attr_only(&ancestor, "Name", translations, prefix))
                    .or_else(|| attr_value(&ancestor, "Text"))
                    .or_else(|| attr_value(&ancestor, "Name"))
                {
                    parts.push(format!("Module: {}", name));
                }
            }
            _ => {}
        }
    }
    if parts.is_empty() {
        None
    } else {
        parts.reverse();
        Some(parts.join(" / "))
    }
}

fn translated_attr_only(
    node: &Node<'_, '_>,
    name: &str,
    translations: &HashMap<String, HashMap<String, String>>,
    prefix: &str,
) -> Option<String> {
    let id = node.attribute("Id").unwrap_or("");
    if id.is_empty() {
        return None;
    }
    let key = strip_prefix(id, prefix);
    let map = translations.get(&key)?;
    let text = map.get(name)?.trim();
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

fn resolve_param_ref_title(
    param_ref_id: &str,
    translations: &HashMap<String, HashMap<String, String>>,
    prefix: &str,
) -> Option<String> {
    let key = strip_prefix(param_ref_id, prefix);
    if let Some(text) = lookup_translation_key(&key, translations) {
        return Some(text);
    }
    if let Some((base, _)) = key.split_once("_R-") {
        if let Some(text) = lookup_translation_key(base, translations) {
            return Some(text);
        }
    }
    None
}

fn lookup_translation_key(
    key: &str,
    translations: &HashMap<String, HashMap<String, String>>,
) -> Option<String> {
    let map = translations.get(key)?;
    if let Some(text) = map.get("Text") {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    if let Some(text) = map.get("Name") {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    None
}

pub(crate) fn extract_device_configuration(
    device_node: &Node<'_, '_>,
    app: Option<&AppProgram>,
) -> (HashMap<String, String>, Vec<DeviceConfigEntry>) {
    let mut configuration = HashMap::new();
    let mut configuration_entries = Vec::new();

    for param_ref in device_node
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::PARAMETER_INSTANCE_REF)
    {
        let ref_id = param_ref.attribute("RefId").unwrap_or("");
        let value = param_ref.attribute("Value").unwrap_or("");
        if ref_id.is_empty() || value.is_empty() {
            continue;
        }

        let (name, value_label, value_raw, param_type, context) =
            resolve_parameter_details(app, ref_id, value);
        let display_value = value_label.clone().unwrap_or_else(|| value_raw.clone());

        configuration.insert(name.clone(), display_value.clone());
        configuration_entries.push(DeviceConfigEntry {
            name,
            value: display_value,
            value_raw: Some(value_raw),
            value_label,
            parameter_type: param_type,
            context,
            ref_id: Some(strip_parameter_ref_id(app, ref_id)),
            source: Some("Parameter".to_string()),
        });
    }

    for property in device_node
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::PROPERTY)
    {
        let id = property.attribute("Id").unwrap_or("");
        let value = property.attribute("Value").unwrap_or("");

        if !value.is_empty() {
            let name = format!("Property {}", id);
            configuration.insert(name.clone(), value.to_string());
            configuration_entries.push(DeviceConfigEntry {
                name,
                value: value.to_string(),
                value_raw: None,
                value_label: None,
                parameter_type: None,
                context: None,
                ref_id: if id.is_empty() { None } else { Some(id.to_string()) },
                source: Some("Property".to_string()),
            });
        }
    }

    (configuration, configuration_entries)
}

fn strip_parameter_ref_id(app: Option<&AppProgram>, ref_id: &str) -> String {
    if let Some(program) = app {
        return strip_prefix(ref_id, &program.prefix);
    }
    short_id(ref_id)
}

fn resolve_parameter_details(
    app: Option<&AppProgram>,
    ref_id: &str,
    raw_value: &str,
) -> (String, Option<String>, String, Option<String>, Option<String>) {
    let raw_value = raw_value.to_string();
    let mut name = short_id(ref_id);
    let mut value_label = None;
    let mut parameter_type = None;
    let mut context = None;

    let Some(program) = app else {
        return (name, value_label, raw_value, parameter_type, context);
    };

    let ref_key = strip_prefix(ref_id, &program.prefix);
    let param_ref = program
        .parameter_refs
        .get(&ref_key)
        .or_else(|| program.parameter_refs.get(&short_id(&ref_key)));

    let mut param_id = None;
    if let Some(reference) = param_ref {
        param_id = Some(reference.parameter_id.as_str());
        name = reference
            .text
            .as_ref()
            .or(reference.name.as_ref())
            .cloned()
            .unwrap_or_else(|| name.clone());
    }

    if let Some(ctx) = program.parameter_ref_context.get(&ref_key) {
        context = Some(ctx.clone());
    }

    let param_def = param_id
        .and_then(|id| program.parameters.get(id))
        .or_else(|| program.parameters.get(&short_id(&ref_key)));

    if let Some(def) = param_def {
        if name == short_id(ref_id) {
            name = def
                .text
                .as_ref()
                .or(def.name.as_ref())
                .cloned()
                .unwrap_or_else(|| name.clone());
        }
        if let Some(type_ref) = def.parameter_type_ref.as_deref() {
            parameter_type = program
                .parameter_types
                .get(type_ref)
                .and_then(|def| def.name.clone())
                .or_else(|| Some(type_ref.to_string()));
            if let Some(def) = program.parameter_types.get(type_ref) {
                if def.kind == ParameterTypeKind::Enum {
                    value_label = def.enum_values.get(&raw_value).cloned();
                }
            }
        }
    }

    (name, value_label, raw_value, parameter_type, context)
}
