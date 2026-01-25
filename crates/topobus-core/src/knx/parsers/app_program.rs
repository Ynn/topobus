use std::collections::HashMap;
use std::io::{Read, Seek};

use anyhow::{Context, Result};
use roxmltree::Document;
use zip::ZipArchive;

use crate::knx::app_model::{AllocatorDef, AppProgram, ModuleArgumentInfo, NumericArgDef};
use crate::knx::parsers::com_objects::{parse_com_object_refs, parse_com_objects};
use crate::knx::parsers::parameters::{
    parse_parameter_definitions,
    parse_parameter_ref_context,
    parse_parameter_refs,
    parse_parameter_types,
};
use crate::knx::parsers::translations::{attr_value_localized, build_translations, strip_prefix};
use crate::knx::xml_tags;
use crate::knx::xml_utils::attr_value;
use crate::knx::zip_utils::{read_zip_entry, strip_bom};

pub(crate) fn load_app_program<R: Read + Seek>(
    zip: &mut ZipArchive<R>,
    app_id: &str,
) -> Result<AppProgram> {
    let manufacturer = app_id.split('_').next().unwrap_or("");
    let path = format!("{}/{}.xml", manufacturer, app_id);
    let xml = read_zip_entry(zip, &path)?;
    let doc =
        Document::parse(strip_bom(&xml)).with_context(|| format!("Failed to parse {}", path))?;
    let prefix = format!("{}_", app_id);
    let translations = build_translations(&doc, &prefix);

    let mut arguments = HashMap::new();
    for arg in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::ARGUMENT)
    {
        let id = match arg.attribute("Id") {
            Some(id) => id,
            None => continue,
        };
        let name = match attr_value_localized(&arg, "Name", &translations, &prefix) {
            Some(name) if !name.trim().is_empty() => name,
            _ => continue,
        };
        arguments.insert(strip_prefix(id, &prefix), name.to_string());
    }

    let com_objects = parse_com_objects(&doc, &prefix, &translations);
    let com_object_refs = parse_com_object_refs(&doc, &prefix, &translations);
    let parameter_types = parse_parameter_types(&doc, &prefix, &translations);
    let parameter_refs = parse_parameter_refs(&doc, &prefix, &translations);
    let parameter_ref_context = parse_parameter_ref_context(&doc, &prefix);
    let parameters = parse_parameter_definitions(&doc, &prefix, &translations);

    let mut allocators = HashMap::new();
    for allocator in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::ALLOCATOR)
    {
        let id = match allocator.attribute("Id") {
            Some(id) => id,
            None => continue,
        };
        let start = allocator
            .attribute("Start")
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        let end = allocator
            .attribute("maxInclusive")
            .and_then(|value| value.parse().ok());
        allocators.insert(
            id.to_string(),
            AllocatorDef {
                start,
                end,
            },
        );
    }

    let mut module_def_arguments = HashMap::new();
    for arg in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::ARGUMENT)
    {
        let id = match arg.attribute("Id") {
            Some(id) => id,
            None => continue,
        };
        let allocates = arg
            .attribute("Allocates")
            .and_then(|value| value.parse().ok());
        if allocates.is_none() && arg.attribute("Name").is_none() {
            continue;
        }
        module_def_arguments.insert(
            id.to_string(),
            ModuleArgumentInfo {
                name: attr_value_localized(&arg, "Name", &translations, &prefix),
                allocates,
            },
        );
    }

    let mut numeric_args = HashMap::new();
    for num in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::NUMERIC_ARG)
    {
        let ref_id = match num.attribute("RefId") {
            Some(id) => id,
            None => continue,
        };
        let value = num.attribute("Value").and_then(|val| val.parse().ok());
        numeric_args.insert(
            ref_id.to_string(),
            NumericArgDef {
                allocator_ref_id: num.attribute("AllocatorRefId").map(|v| v.to_string()),
                base_value: num.attribute("BaseValue").map(|v| v.to_string()),
                value,
            },
        );
    }

    let app_node = doc
        .descendants()
        .find(|node| node.tag_name().name() == xml_tags::APPLICATION_PROGRAM);
    let app_name = app_node.and_then(|node| attr_value_localized(&node, "Name", &translations, &prefix));
    let app_version = app_node.and_then(|node| attr_value(&node, "ApplicationVersion"));
    let app_number = app_node.and_then(|node| attr_value(&node, "ApplicationNumber"));
    let app_type = app_node.and_then(|node| attr_value(&node, "ProgramType"));
    let mask_version = app_node.and_then(|node| attr_value(&node, "MaskVersion"));

    Ok(AppProgram {
        prefix,
        name: app_name,
        version: app_version,
        number: app_number,
        program_type: app_type,
        mask_version,
        arguments,
        com_object_refs,
        com_objects,
        parameters,
        parameter_types,
        parameter_refs,
        parameter_ref_context,
        allocators,
        module_def_arguments,
        numeric_args,
    })
}
