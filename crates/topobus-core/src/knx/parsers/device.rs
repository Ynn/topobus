use std::collections::HashMap;
use std::io::{Read, Seek};

use anyhow::{Context, Result};
use roxmltree::Document;
use zip::ZipArchive;

use crate::knx::app_model::AppProgram;
use crate::knx::model::{DeviceInfo, GroupAddressInfo, GroupLink};
use crate::knx::parsers::app_program::load_app_program;
use crate::knx::parsers::com_objects::{
    com_object_key,
    compute_object_number,
    resolve_com_data,
    resolve_module_arguments,
    resolve_object_name,
    resolve_template,
};
use crate::knx::parsers::parameters::extract_device_configuration;
use crate::knx::xml_tags;
use crate::knx::xml_utils::{
    attr_value,
    format_individual_address,
    find_ancestor_address,
    medium_name,
    ParseError,
    required_attribute,
    short_id,
};
use crate::knx::zip_utils::{read_zip_entry, strip_bom};

pub(crate) fn extract_devices<R: Read + Seek>(
    doc: &Document,
    zip: &mut ZipArchive<R>,
    group_address_by_id: &HashMap<String, GroupAddressInfo>,
    manufacturer_names: &HashMap<String, String>,
    preferred_language: Option<&str>,
) -> Result<Vec<DeviceInfo>> {
    let mut devices = Vec::new();
    let mut hardware_cache: HashMap<String, HardwareData> = HashMap::new();
    let mut app_cache: HashMap<String, AppProgram> = HashMap::new();

    for device_node in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::DEVICE_INSTANCE)
    {
        let device_id = match required_attribute(&device_node, "Id") {
            Ok(value) => value,
            Err(error) => {
                log::warn!("Skipping DeviceInstance without Id: {}", error);
                continue;
            }
        };
        let area = find_ancestor_address(&device_node, xml_tags::AREA);
        let line = find_ancestor_address(&device_node, xml_tags::LINE);
        let mut device_addr = attr_value(&device_node, "Address");

        let raw_name = device_node
            .attribute("Name")
            .map(str::trim)
            .unwrap_or("")
            .to_string();
        let description = attr_value(&device_node, "Description");
        let comment = attr_value(&device_node, "Comment");
        let serial_number = attr_value(&device_node, "SerialNumber");
        let last_modified = attr_value(&device_node, "LastModified");
        let last_download = attr_value(&device_node, "LastDownload");
        let segment_node = device_node
            .ancestors()
            .find(|node| node.tag_name().name() == xml_tags::SEGMENT);
        let line_node = device_node
            .ancestors()
            .find(|node| node.tag_name().name() == xml_tags::LINE);
        let segment_id = segment_node
            .and_then(|node| node.attribute("Id"))
            .map(|value| value.to_string());
        let segment_number = segment_node.and_then(|node| attr_value(&node, "Number"));
        let segment_domain_address = segment_node.and_then(|node| attr_value(&node, "DomainAddress"));
        let segment_medium_type = segment_node
            .and_then(|node| attr_value(&node, "MediumTypeRefId"))
            .map(|value| medium_name(&value));
        let line_medium_type = line_node
            .and_then(|node| attr_value(&node, "MediumTypeRefId"))
            .map(|value| medium_name(&value));
        let medium_type = segment_medium_type.clone().or_else(|| line_medium_type.clone());
        let ip_config = device_node
            .children()
            .find(|node| node.is_element() && node.tag_name().name() == xml_tags::IP_CONFIG)
            .or_else(|| {
                device_node
                    .descendants()
                    .find(|node| node.tag_name().name() == xml_tags::IP_CONFIG)
            });
        let (ip_assignment, ip_address, ip_subnet_mask, ip_default_gateway, mac_address) =
            if let Some(ip_node) = ip_config {
                (
                    attr_value(&ip_node, "Assign"),
                    attr_value(&ip_node, "IPAddress"),
                    attr_value(&ip_node, "SubnetMask"),
                    attr_value(&ip_node, "DefaultGateway"),
                    attr_value(&ip_node, "MACAddress"),
                )
            } else {
                (None, None, None, None, None)
            };

        let product_ref_id = device_node
            .attribute("ProductRefId")
            .map(|value| value.to_string());

        let hardware2program = device_node
            .attribute("Hardware2ProgramRefId")
            .map(|s| s.to_string());

        let manufacturer_id = product_ref_id
            .as_deref()
            .and_then(manufacturer_id_from_ref)
            .or_else(|| {
                hardware2program
                    .as_deref()
                    .and_then(manufacturer_id_from_ref)
            });

        let manufacturer_name = manufacturer_id
            .as_ref()
            .and_then(|id| manufacturer_names.get(id))
            .cloned();

        let hardware_data = if let Some(ref manufacturer_id) = manufacturer_id {
            ensure_hardware_data(zip, manufacturer_id, &mut hardware_cache)?
        } else {
            None
        };

        let is_coupler = hardware_data
            .and_then(|data| {
                product_ref_id
                    .as_ref()
                    .and_then(|id| data.flags_by_ref.get(id))
                    .or_else(|| {
                        hardware2program
                            .as_ref()
                            .and_then(|id| data.flags_by_ref.get(id))
                    })
            })
            .map(|flags| flags.is_coupler)
            .unwrap_or(false);
        if device_addr.is_none() && is_coupler {
            device_addr = Some("0".to_string());
        }
        if device_addr.is_none() && area.is_none() && line.is_none() {
            let error = ParseError::MissingRequiredAttribute {
                element: xml_tags::DEVICE_INSTANCE.to_string(),
                attribute: "Address".to_string(),
                context: format!("line {}", device_node.range().start),
            };
            log::warn!("DeviceInstance missing Address and topology: {}", error);
        }

        let (product_name, product_reference) = product_ref_id
            .as_ref()
            .and_then(|id| hardware_data.and_then(|data| data.products.get(id)))
            .map(|info| (info.name.clone(), info.order_number.clone()))
            .unwrap_or((None, None));

        let individual_address = format_individual_address(
            area.as_deref(),
            line.as_deref(),
            device_addr.as_deref(),
            &device_id,
        );

        let name = if !raw_name.is_empty() {
            raw_name.clone()
        } else if let Some(name) = product_name.clone() {
            name
        } else if let Some(reference) = product_reference.clone() {
            reference
        } else if let Some(manu) = manufacturer_name.clone() {
            manu
        } else {
            format!("Device {}", individual_address)
        };

        let mut module_args: HashMap<String, HashMap<String, String>> = HashMap::new();
        for module in device_node
            .descendants()
            .filter(|n| n.tag_name().name() == xml_tags::MODULE_INSTANCE)
        {
            let module_id = module.attribute("Id").unwrap_or("").to_string();
            if module_id.is_empty() {
                continue;
            }
            let mut args = HashMap::new();
            for arg in module
                .descendants()
                .filter(|n| n.tag_name().name() == xml_tags::ARGUMENT)
            {
                let ref_id = arg.attribute("RefId").unwrap_or("");
                let value = arg.attribute("Value").unwrap_or("");
                if !ref_id.is_empty() {
                    args.insert(ref_id.to_string(), value.to_string());
                }
            }
            if !args.is_empty() {
                module_args.insert(module_id, args);
            }
        }

        let app_id = if let Some(hw) = &hardware2program {
            ensure_app_program(zip, hw, hardware_data, &mut app_cache, preferred_language)?
        } else {
            None
        };
        let app = app_id.as_ref().and_then(|id| app_cache.get(id));
        let app_program_name = app.and_then(|data| data.name.clone());
        let app_program_version = app.and_then(|data| data.version.clone());
        let app_program_number = app.and_then(|data| data.number.clone());
        let app_program_type = app.and_then(|data| data.program_type.clone());
        let app_mask_version = app.and_then(|data| data.mask_version.clone());

        let mut group_links = Vec::new();
        for com_ref in device_node
            .descendants()
            .filter(|n| n.tag_name().name() == xml_tags::COM_OBJECT_INSTANCE_REF)
        {
            let ref_id = com_ref.attribute("RefId").unwrap_or("");
            if ref_id.is_empty() {
                continue;
            }

            let link_attr = com_ref.attribute("Links").unwrap_or("");
            let mut link_ids: Vec<String> = parse_links_attribute(link_attr);
            if link_ids.is_empty() {
                link_ids = extract_connector_links(&com_ref);
            }
            if link_ids.is_empty() {
                continue;
            }

            let module_id = ref_id.split("_O-").next().unwrap_or("");
            let arg_values = resolve_module_arguments(module_args.get(module_id), app);
            let base_module_values = module_id
                .split("_SM-")
                .next()
                .and_then(|id| {
                    if id == module_id {
                        None
                    } else {
                        module_args.get(id)
                    }
                });

            let com_key = com_object_key(ref_id);
            let com_def = app.and_then(|program| program.com_object_refs.get(&com_key));
            let com_obj = com_def
                .and_then(|def| def.ref_id.as_ref())
                .and_then(|ref_id| app.and_then(|program| program.com_objects.get(ref_id)));
            let com_data = resolve_com_data(com_def, com_obj, app);
            let adjusted_number = compute_object_number(
                com_data.number,
                com_obj,
                module_args.get(module_id),
                base_module_values,
                app,
                ref_id,
            );
                let com_flags = com_data.flags;
            let link_security = attr_value(&com_ref, "Security");
            let link_building_function = attr_value(&com_ref, "BuildingFunction")
                .or_else(|| attr_value(&com_ref, "BuildingFunctionRefId"))
                .or_else(|| attr_value(&com_ref, "BuildingFunctionId"));
            let link_building_part = attr_value(&com_ref, "BuildingPart")
                .or_else(|| attr_value(&com_ref, "BuildingPartRefId"))
                .or_else(|| attr_value(&com_ref, "BuildingPartId"));
            let base_name = resolve_object_name(com_def, com_obj, &arg_values);
            let object_function_text =
                resolve_template(
                    com_def
                        .and_then(|def| def.function_text.as_deref())
                        .or_else(|| com_obj.and_then(|def| def.function_text.as_deref())),
                    &arg_values,
                );
            let object_name_raw = resolve_template(
                com_def
                    .and_then(|def| def.name.as_deref())
                    .or_else(|| com_obj.and_then(|def| def.name.as_deref())),
                &arg_values,
            );
            let object_text = resolve_template(
                com_def
                    .and_then(|def| def.text.as_deref())
                    .or_else(|| com_obj.and_then(|def| def.text.as_deref())),
                &arg_values,
            );

            // ETS/KNX project schema rule: the first group address link is always the sending one.
            // Keep the resolved address to expose it for all links of this ComObjectInstanceRef.
            let mut ets_sending_address: Option<String> = None;

            for (link_index, link_id) in link_ids.iter().enumerate() {
                let info = group_address_by_id
                    .get(link_id)
                    .or_else(|| group_address_by_id.get(&short_id(link_id)));
                let address = info
                    .map(|ga| ga.address.clone())
                    .unwrap_or_else(|| link_id.to_string());

                if link_index == 0 {
                    ets_sending_address = Some(address.clone());
                }
                let fallback = info
                    .map(|ga| ga.name.clone())
                    .filter(|name| !name.trim().is_empty())
                    .unwrap_or_else(|| ref_id.to_string());
                let mut parts = Vec::new();
                if let Some(num) = adjusted_number.or(com_data.number) {
                    parts.push(format!("[#{}]", num));
                }

            let name_part = object_text
                .clone()
                .or_else(|| object_name_raw.clone())
                .filter(|value| !value.trim().is_empty());
                let function_part = object_function_text
                    .clone()
                    .filter(|value| !value.trim().is_empty());

                if let Some(name) = name_part.as_ref() {
                    parts.push(format!("[{}]", name));
                }

                if let Some(func) = function_part.as_ref() {
                    let duplicate = name_part
                        .as_ref()
                        .map(|name| name.eq_ignore_ascii_case(func))
                        .unwrap_or(false);
                    if !duplicate {
                        parts.push(func.clone());
                    }
                }

            let object_name = if parts.is_empty() {
                base_name
                    .clone()
                    .filter(|name| !name.trim().is_empty())
                    .unwrap_or(fallback)
            } else {
                parts.join(" ")
            };

                let ets_sending = link_index == 0;
                group_links.push(GroupLink {
                    com_object_ref_id: Some(ref_id.to_string()),
                    object_name,
                    object_name_raw: object_name_raw.clone(),
                    object_text: object_text.clone(),
                    object_function_text: object_function_text.clone(),
                    group_address: address,
                    ets_sending_address: ets_sending_address.clone(),
                    ets_sending,
                    ets_receiving: link_index != 0,
                    channel: com_data.channel.clone(),
                    datapoint_type: com_data.datapoint_type.clone(),
                    number: adjusted_number.or(com_data.number),
                    description: com_data.description.clone(),
                    object_size: com_data.object_size.clone(),
                    security: link_security.clone(),
                    building_function: link_building_function.clone(),
                    building_part: link_building_part.clone(),
                    flags: com_flags.to_model_flags_opt(),
                });
            }
        }

        let (configuration, configuration_entries) = extract_device_configuration(&device_node, app);

        devices.push(DeviceInfo {
            instance_id: device_id.to_string(),
            individual_address,
            name,
            manufacturer: manufacturer_name,
            product: product_name,
            product_reference,
            description,
            comment,
            serial_number,
            app_program_name,
            app_program_version,
            app_program_number,
            app_program_type,
            app_mask_version,
            medium_type,
            segment_id,
            segment_number,
            segment_domain_address,
            segment_medium_type,
            ip_assignment,
            ip_address,
            ip_subnet_mask,
            ip_default_gateway,
            mac_address,
            last_modified,
            last_download,
            group_links,
            configuration,
            configuration_entries,
        });
    }

    Ok(devices)
}

fn parse_links_attribute(link_attr: &str) -> Vec<String> {
    // `Links` is a whitespace-separated list of GroupAddressRefId values.
    // We also accept commas for robustness (some exports/tools may add them).
    link_attr
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .collect()
}

fn extract_connector_links(com_ref: &roxmltree::Node) -> Vec<String> {
    let mut ids = Vec::new();
    let connectors = com_ref
        .children()
        .find(|node| node.is_element() && node.tag_name().name() == xml_tags::CONNECTORS);
    if let Some(connectors) = connectors {
        for node in connectors
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == xml_tags::SEND)
        {
            if let Some(ref_id) = node.attribute("GroupAddressRefId") {
                let trimmed = ref_id.trim();
                if !trimmed.is_empty() {
                    ids.push(short_id(trimmed));
                }
            }
        }
        for node in connectors
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == xml_tags::RECEIVE)
        {
            if let Some(ref_id) = node.attribute("GroupAddressRefId") {
                let trimmed = ref_id.trim();
                if !trimmed.is_empty() {
                    ids.push(short_id(trimmed));
                }
            }
        }
    }
    ids
}

#[cfg(test)]
mod tests {
    use super::parse_links_attribute;

    #[test]
    fn parse_links_attribute_preserves_order_and_splits_whitespace() {
        let input = " G-1\nG-2\tG-3  G-4 ";
        let out = parse_links_attribute(input);
        assert_eq!(out, vec!["G-1", "G-2", "G-3", "G-4"]);
    }

    #[test]
    fn parse_links_attribute_accepts_commas_without_reordering() {
        let input = "G-1,G-2, G-3";
        let out = parse_links_attribute(input);
        assert_eq!(out, vec!["G-1", "G-2", "G-3"]);
    }
}

fn manufacturer_id_from_ref(value: &str) -> Option<String> {
    let id = value.split('_').next().unwrap_or("");
    if id.starts_with("M-") {
        Some(id.to_string())
    } else {
        None
    }
}

fn ensure_app_program<R: Read + Seek>(
    zip: &mut ZipArchive<R>,
    hardware2program: &str,
    hardware_data: Option<&HardwareData>,
    app_cache: &mut HashMap<String, AppProgram>,
    preferred_language: Option<&str>,
) -> Result<Option<String>> {
    let app_id = hardware_data
        .and_then(|data| data.hardware2program.get(hardware2program))
        .cloned();
    let app_id = match app_id {
        Some(id) => id,
        None => return Ok(None),
    };

    if !app_cache.contains_key(&app_id) {
        let program = match load_app_program(zip, &app_id, preferred_language) {
            Ok(program) => program,
            Err(err) => {
                log::warn!("Missing app program {} ({})", app_id, err);
                return Ok(None);
            }
        };
        app_cache.insert(app_id.clone(), program);
    }

    Ok(Some(app_id))
}

fn ensure_hardware_data<'a, R: Read + Seek>(
    zip: &mut ZipArchive<R>,
    manufacturer: &str,
    hardware_cache: &'a mut HashMap<String, HardwareData>,
) -> Result<Option<&'a HardwareData>> {
    if manufacturer.trim().is_empty() {
        return Ok(None);
    }

    if !hardware_cache.contains_key(manufacturer) {
        let data = match load_hardware_data(zip, manufacturer) {
            Ok(map) => map,
            Err(err) => {
                log::warn!(
                    "Missing hardware data for {} ({}), skipping details",
                    manufacturer,
                    err
                );
                return Ok(None);
            }
        };
        hardware_cache.insert(manufacturer.to_string(), data);
    }

    Ok(hardware_cache.get(manufacturer))
}

fn load_hardware_data<R: Read + Seek>(
    zip: &mut ZipArchive<R>,
    manufacturer: &str,
) -> Result<HardwareData> {
    let path = format!("{}/Hardware.xml", manufacturer);
    let xml = read_zip_entry(zip, &path)?;
    let doc =
        Document::parse(strip_bom(&xml)).with_context(|| format!("Failed to parse {}", path))?;

    let mut hardware2program = HashMap::new();
    let mut products = HashMap::new();
    let mut flags_by_ref = HashMap::new();

    for hardware in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::HARDWARE)
    {
        let is_coupler = parse_hardware_flag(hardware.attribute("IsCoupler"));
        let flags = HardwareFlags { is_coupler };

        for hw in hardware
            .descendants()
            .filter(|n| n.is_element() && n.tag_name().name() == xml_tags::HARDWARE2PROGRAM)
        {
            let id = match hw.attribute("Id") {
                Some(id) => id.to_string(),
                None => continue,
            };
            let app_ref = hw
                .descendants()
                .find(|n| n.is_element() && n.tag_name().name() == xml_tags::APPLICATION_PROGRAM_REF)
                .and_then(|n| n.attribute("RefId"))
                .map(|s| s.to_string());
            if let Some(app_ref) = app_ref {
                hardware2program.insert(id.clone(), app_ref);
            }
            flags_by_ref.insert(id, flags);
        }

        for product in hardware
            .descendants()
            .filter(|n| n.is_element() && n.tag_name().name() == xml_tags::PRODUCT)
        {
            let id = match product.attribute("Id") {
                Some(id) => id.to_string(),
                None => continue,
            };
            let name = attr_value(&product, "Text");
            let order_number = attr_value(&product, "OrderNumber");
            products
                .entry(id.clone())
                .or_insert(ProductInfo { name, order_number });
            flags_by_ref.insert(id, flags);
        }
    }

    Ok(HardwareData {
        hardware2program,
        products,
        flags_by_ref,
    })
}

fn parse_hardware_flag(value: Option<&str>) -> bool {
    matches!(value, Some("1") | Some("true") | Some("True"))
}

struct HardwareData {
    hardware2program: HashMap<String, String>,
    products: HashMap<String, ProductInfo>,
    flags_by_ref: HashMap<String, HardwareFlags>,
}

#[derive(Clone, Copy)]
struct HardwareFlags {
    is_coupler: bool,
}

#[derive(Clone)]
struct ProductInfo {
    name: Option<String>,
    order_number: Option<String>,
}
