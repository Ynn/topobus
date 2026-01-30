use std::collections::HashMap;

use roxmltree::Document;

use crate::knx::app_model::{AppProgram, ComObjectDef, ComObjectRefDef, Flags};
use crate::knx::parsers::translations::{attr_value_localized, strip_prefix};
use crate::knx::xml_tags;
use crate::knx::xml_utils::attr_value;

#[derive(Clone)]
pub(crate) struct ComObjectData {
    pub(crate) flags: Flags,
    pub(crate) datapoint_type: Option<String>,
    pub(crate) channel: Option<String>,
    pub(crate) number: Option<u32>,
    pub(crate) description: Option<String>,
    pub(crate) object_size: Option<String>,
}

pub(crate) fn parse_com_objects(
    doc: &Document,
    prefix: &str,
    translations: &HashMap<String, HashMap<String, String>>,
) -> HashMap<String, ComObjectDef> {
    let mut com_objects = HashMap::new();
    for obj in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::COM_OBJECT)
    {
        let id = match obj.attribute("Id") {
            Some(id) => id,
            None => continue,
        };
        com_objects.insert(
            strip_prefix(id, prefix),
            ComObjectDef {
                flags: Flags::from_node(&obj),
                datapoint_type: attr_value(&obj, "DatapointType"),
                number: obj.attribute("Number").and_then(|v| v.parse().ok()),
                object_size: attr_value(&obj, "ObjectSize"),
                base_number_argument_ref: obj.attribute("BaseNumber").map(|value| value.to_string()),
                description: attr_value_localized(&obj, "Description", translations, prefix),
                name: attr_value_localized(&obj, "Name", translations, prefix),
                text: attr_value_localized(&obj, "Text", translations, prefix),
                function_text: attr_value_localized(&obj, "FunctionText", translations, prefix),
            },
        );
    }
    com_objects
}

pub(crate) fn parse_com_object_refs(
    doc: &Document,
    prefix: &str,
    translations: &HashMap<String, HashMap<String, String>>,
) -> HashMap<String, ComObjectRefDef> {
    let mut com_object_refs = HashMap::new();
    for obj in doc.descendants() {
        if obj.tag_name().name() != xml_tags::COM_OBJECT_REF {
            continue;
        }
        let id = match obj.attribute("Id") {
            Some(id) => id,
            None => continue,
        };

        let channel_node = obj
            .ancestors()
            .find(|n| n.tag_name().name() == xml_tags::CHANNEL || n.tag_name().name() == xml_tags::MODULE);
        let channel_name = channel_node.and_then(|node| {
            attr_value_localized(&node, "Text", translations, prefix)
                .or_else(|| attr_value_localized(&node, "Name", translations, prefix))
                .or_else(|| attr_value(&node, "Text"))
                .or_else(|| attr_value(&node, "Name"))
        });

        let def = ComObjectRefDef {
            function_text: attr_value_localized(&obj, "FunctionText", translations, prefix),
            name: attr_value_localized(&obj, "Name", translations, prefix),
            text: attr_value_localized(&obj, "Text", translations, prefix),
            datapoint_type: attr_value(&obj, "DatapointType"),
            object_size: attr_value(&obj, "ObjectSize"),
            ref_id: obj
                .attribute("RefId")
                .map(|value| strip_prefix(value, prefix)),
            flags: Flags::from_node(&obj),
            channel: channel_name,
            number: obj.attribute("Number").and_then(|v| v.parse().ok()),
            description: attr_value_localized(&obj, "Description", translations, prefix),
        };
        com_object_refs.insert(strip_prefix(id, prefix), def);
    }
    com_object_refs
}

pub(crate) fn com_object_key(instance_ref: &str) -> String {
    if let Some(o_index) = instance_ref.find("_O-") {
        let module = instance_ref.split('_').next().unwrap_or("");
        let suffix = &instance_ref[o_index + 1..];
        if !module.is_empty() {
            return format!("{}_{}", module, suffix);
        }
    }
    instance_ref.to_string()
}

pub(crate) fn resolve_module_arguments(
    module_args: Option<&HashMap<String, String>>,
    app: Option<&AppProgram>,
) -> HashMap<String, String> {
    let mut mapped = HashMap::new();
    let module_args = match module_args {
        Some(args) => args,
        None => return mapped,
    };
    let app_args = app.map(|program| &program.arguments);

    for (ref_id, value) in module_args {
        let name = app_args
            .and_then(|map| map.get(ref_id))
            .cloned()
            .unwrap_or_else(|| ref_id.to_string());
        mapped.insert(name, value.to_string());
    }

    mapped
}

pub(crate) fn resolve_object_name(
    com_def: Option<&ComObjectRefDef>,
    com_obj: Option<&ComObjectDef>,
    arg_values: &HashMap<String, String>,
) -> Option<String> {
    let base = com_def
        .and_then(|def| def.function_text.as_deref())
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            com_def
                .and_then(|def| def.text.as_deref())
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| {
            com_def
                .and_then(|def| def.name.as_deref())
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| {
            com_obj
                .and_then(|def| def.function_text.as_deref())
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| {
            com_obj
                .and_then(|def| def.text.as_deref())
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| {
            com_obj
                .and_then(|def| def.name.as_deref())
                .filter(|value| !value.trim().is_empty())
        })?;
    resolve_template(Some(base), arg_values)
}

pub(crate) fn resolve_template(
    value: Option<&str>,
    arg_values: &HashMap<String, String>,
) -> Option<String> {
    let base = value?.trim();
    if base.is_empty() {
        return None;
    }
    let mut resolved = base.to_string();
    for (key, value) in arg_values {
        let token = format!("{{{{{}}}}}", key);
        resolved = resolved.replace(&token, value);
    }
    Some(resolved)
}

pub(crate) fn resolve_com_data(
    com_def: Option<&ComObjectRefDef>,
    com_obj: Option<&ComObjectDef>,
    app: Option<&AppProgram>,
) -> ComObjectData {
    let mut flags = com_def.map(|def| def.flags.clone()).unwrap_or_default();
    let mut dpt = com_def.and_then(|def| def.datapoint_type.clone());
    let mut object_size = com_def.and_then(|def| def.object_size.clone());
    let channel = com_def.and_then(|def| def.channel.clone());
    let mut number = com_obj.and_then(|def| def.number).or_else(|| com_def.and_then(|def| def.number));
    let mut description = com_def.and_then(|def| def.description.clone());

    if let Some(def) = com_def {
        if let Some(ref_id) = &def.ref_id {
            if let Some(program) = app {
                if let Some(obj) = program.com_objects.get(ref_id) {
                    flags = flags.with_fallback(obj.flags.clone());
                    if dpt.is_none() {
                        dpt = obj.datapoint_type.clone();
                    }
                    if object_size.is_none() {
                        object_size = obj.object_size.clone();
                    }
                    if number.is_none() {
                        number = obj.number;
                    }
                    if description.is_none() {
                        description = obj.description.clone();
                    }
                }
            }
        }
    }
    ComObjectData {
        flags,
        datapoint_type: dpt,
        channel,
        number,
        description,
        object_size,
    }
}

pub(crate) fn compute_object_number(
    base_number: Option<u32>,
    com_obj: Option<&ComObjectDef>,
    module_values: Option<&HashMap<String, String>>,
    base_module_values: Option<&HashMap<String, String>>,
    app: Option<&AppProgram>,
    com_ref_id: &str,
) -> Option<u32> {
    let base_number = base_number?;
    let base_ref = com_obj.and_then(|obj| obj.base_number_argument_ref.as_deref());
    let (base_ref, module_values, base_module_values, app) =
        match (base_ref, module_values, base_module_values, app) {
            (Some(base_ref), Some(values), base_module_values, Some(app)) => {
                (base_ref, values, base_module_values, app)
            }
            _ => return Some(base_number),
        };

    let adjustment = resolve_base_number(
        base_ref,
        module_values,
        base_module_values,
        app,
        com_ref_id,
    )?;
    Some(base_number.saturating_add(adjustment))
}

fn resolve_base_number(
    base_ref: &str,
    module_values: &HashMap<String, String>,
    base_module_values: Option<&HashMap<String, String>>,
    app: &AppProgram,
    com_ref_id: &str,
) -> Option<u32> {
    let raw = lookup_module_value(base_ref, module_values, base_module_values)?.trim();
    if raw.is_empty() {
        return None;
    }

    if let Ok(value) = raw.parse::<u32>() {
        return Some(value);
    }

    let numeric = app
        .numeric_args
        .get(base_ref)
        .or_else(|| {
            app.numeric_args
                .iter()
                .find(|(key, _)| key.ends_with(base_ref))
                .map(|(_, arg)| arg)
        });

    if let Some(numeric) = numeric {
        if let Some(value) = numeric.value {
            return Some(value);
        }
    }

    let allocator_ref = numeric
        .and_then(|num| num.allocator_ref_id.as_deref())
        .unwrap_or(raw);

    let allocator_start = find_allocator_start(app, allocator_ref)?;
    let allocates = app
        .module_def_arguments
        .get(base_ref)
        .or_else(|| {
            app.module_def_arguments
                .iter()
                .find(|(key, _)| key.ends_with(base_ref))
                .map(|(_, info)| info)
        })
        .and_then(|info| info.allocates)?;

    let index = parse_module_index(com_ref_id).unwrap_or(1);
    let mut value = allocator_start.saturating_add(allocates.saturating_mul(index.saturating_sub(1)));

    if let Some(numeric) = numeric {
        if let Some(base_ref_id) = numeric.base_value.as_deref() {
            if let Some(extra) = resolve_base_number(
                base_ref_id,
                module_values,
                base_module_values,
                app,
                com_ref_id,
            ) {
                value = value.saturating_add(extra);
            }
        }
    }

    Some(value)
}

fn lookup_module_value<'a>(
    key: &str,
    module_values: &'a HashMap<String, String>,
    base_module_values: Option<&'a HashMap<String, String>>,
) -> Option<&'a String> {
    module_values
        .get(key)
        .or_else(|| {
            module_values
                .iter()
                .find(|(k, _)| k.ends_with(key))
                .map(|(_, value)| value)
        })
        .or_else(|| {
            base_module_values.and_then(|values| {
                values
                    .get(key)
                    .or_else(|| {
                        values
                            .iter()
                            .find(|(k, _)| k.ends_with(key))
                            .map(|(_, value)| value)
                    })
            })
        })
}

fn find_allocator_start(app: &AppProgram, allocator_ref: &str) -> Option<u32> {
    if let Some(allocator) = app.allocators.get(allocator_ref) {
        return Some(allocator.start);
    }
    let prefixed = format!("{}{}", app.prefix, allocator_ref);
    if let Some(allocator) = app.allocators.get(&prefixed) {
        return Some(allocator.start);
    }
    app.allocators
        .iter()
        .find(|(id, _)| id.ends_with(allocator_ref))
        .map(|(_, allocator)| allocator.start)
}

fn parse_module_index(ref_id: &str) -> Option<u32> {
    let marker = "_MI-";
    let start = ref_id.find(marker)? + marker.len();
    let suffix = &ref_id[start..];
    let digits: String = suffix.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    digits.parse().ok()
}
