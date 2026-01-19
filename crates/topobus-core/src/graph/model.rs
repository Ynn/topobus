use crate::knx::{DeviceInfo, KnxProjectData};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Graph model for visualization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphModel {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
}

/// Node in the graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
    pub properties: HashMap<String, String>,
}

/// Type of node
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Device,
    GroupObject,
    GroupAddress,
    Area,
    Line,
}

/// Edge in the graph
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
    pub kind: EdgeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub properties: HashMap<String, String>,
}

/// Type of edge
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EdgeKind {
    Links,     // GroupObject links to GroupAddress
    Transmits, // Device transmits on GroupAddress
    Receives,  // Device receives from GroupAddress
}

fn device_properties(device: &DeviceInfo) -> HashMap<String, String> {
    let mut properties = HashMap::new();
    properties.insert("address".to_string(), device.individual_address.clone());
    properties.insert("name".to_string(), device.name.clone());
    let (area, line) = area_line_from_address(&device.individual_address);
    properties.insert(
        "area".to_string(),
        area.unwrap_or_else(|| "unknown".to_string()),
    );
    properties.insert(
        "line".to_string(),
        line.unwrap_or_else(|| "unknown".to_string()),
    );
    if let Some(manufacturer) = &device.manufacturer {
        properties.insert("manufacturer".to_string(), manufacturer.clone());
    }
    if let Some(product) = &device.product {
        properties.insert("product".to_string(), product.clone());
    }
    if let Some(reference) = &device.product_reference {
        properties.insert("product_reference".to_string(), reference.clone());
    }
    if let Some(description) = &device.description {
        properties.insert("description".to_string(), description.clone());
    }
    if let Some(comment) = &device.comment {
        properties.insert("comment".to_string(), comment.clone());
    }
    if let Some(serial) = &device.serial_number {
        properties.insert("serial_number".to_string(), serial.clone());
    }
    if let Some(app_name) = &device.app_program_name {
        properties.insert("app_program_name".to_string(), app_name.clone());
    }
    if let Some(app_version) = &device.app_program_version {
        properties.insert("app_program_version".to_string(), app_version.clone());
    }
    if let Some(app_number) = &device.app_program_number {
        properties.insert("app_program_number".to_string(), app_number.clone());
    }
    if let Some(app_type) = &device.app_program_type {
        properties.insert("app_program_type".to_string(), app_type.clone());
    }
    if let Some(mask_version) = &device.app_mask_version {
        properties.insert("app_mask_version".to_string(), mask_version.clone());
    }
    if let Some(medium) = &device.medium_type {
        properties.insert("medium".to_string(), medium.clone());
    }
    if let Some(segment_id) = &device.segment_id {
        properties.insert("segment_id".to_string(), segment_id.clone());
    }
    if let Some(segment_number) = &device.segment_number {
        properties.insert("segment_number".to_string(), segment_number.clone());
    }
    if let Some(segment_domain) = &device.segment_domain_address {
        properties.insert("segment_domain_address".to_string(), segment_domain.clone());
    }
    if let Some(segment_medium) = &device.segment_medium_type {
        properties.insert("segment_medium".to_string(), segment_medium.clone());
    }
    if let Some(assign) = &device.ip_assignment {
        properties.insert("ip_assignment".to_string(), assign.clone());
    }
    if let Some(ip) = &device.ip_address {
        properties.insert("ip_address".to_string(), ip.clone());
    }
    if let Some(mask) = &device.ip_subnet_mask {
        properties.insert("ip_subnet_mask".to_string(), mask.clone());
    }
    if let Some(gateway) = &device.ip_default_gateway {
        properties.insert("ip_default_gateway".to_string(), gateway.clone());
    }
    if let Some(mac) = &device.mac_address {
        properties.insert("mac_address".to_string(), mac.clone());
    }
    if let Some(last_modified) = &device.last_modified {
        properties.insert("last_modified".to_string(), last_modified.clone());
    }
    if let Some(last_download) = &device.last_download {
        properties.insert("last_download".to_string(), last_download.clone());
    }
    if let Some(kind) = coupler_kind_from_address(&device.individual_address) {
        properties.insert("is_coupler".to_string(), "true".to_string());
        properties.insert("coupler_kind".to_string(), kind.to_string());
    }
    properties
}

fn area_line_from_address(address: &str) -> (Option<String>, Option<String>) {
    let trimmed = address.trim();
    let mut parts = trimmed.split('.');
    let area = parts.next().and_then(parse_address_part);
    let line = parts.next().and_then(parse_address_part);
    (area, line)
}

fn parse_address_part(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.chars().all(|c| c.is_ascii_digit()) {
        return Some(trimmed.to_string());
    }
    None
}

fn parse_address_number(value: Option<&str>) -> Option<u16> {
    let trimmed = value?.trim();
    if trimmed.is_empty() {
        return None;
    }
    let digits: String = trimmed.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return None;
    }
    digits.parse().ok()
}

fn parse_individual_address(address: &str) -> (Option<u16>, Option<u16>, Option<u16>) {
    let mut parts = address.split('.');
    let area = parse_address_number(parts.next());
    let line = parse_address_number(parts.next());
    let device = parse_address_number(parts.next());
    (area, line, device)
}

fn coupler_kind_from_address(address: &str) -> Option<&'static str> {
    let (area, line, device) = parse_individual_address(address);
    if device != Some(0) {
        return None;
    }
    if area.is_none() || line.is_none() {
        return None;
    }
    if line == Some(0) {
        if area == Some(0) {
            return Some("backbone");
        }
        return Some("area");
    }
    Some("line")
}

/// Generate topology graph from KNX project data
pub fn generate_topology_graph(project: &KnxProjectData) -> GraphModel {
    let mut nodes = Vec::new();
    let edges = Vec::new();

    let mut area_nodes: HashMap<String, String> = HashMap::new();
    let mut line_nodes: HashMap<String, String> = HashMap::new();
    let area_info: HashMap<String, _> = project
        .areas
        .iter()
        .cloned()
        .map(|area| (area.address.clone(), area))
        .collect();
    let line_info: HashMap<String, _> = project
        .lines
        .iter()
        .cloned()
        .map(|line| (format!("{}.{}", line.area, line.line), line))
        .collect();

    for device in &project.devices {
        let address = device.individual_address.clone();
        let device_id = format!("device_{}", address.replace('.', "_"));
        let properties = device_properties(device);

        let (area_opt, line_opt) = area_line_from_address(&address);
        let area_key = area_opt.unwrap_or_else(|| "unknown".to_string());
        let line_key = line_opt.unwrap_or_else(|| "unknown".to_string());

        let area_id = if let Some(id) = area_nodes.get(&area_key) {
            id.clone()
        } else {
            let id = format!("area_{}", area_key);
            let mut properties = HashMap::new();
            properties.insert("area".to_string(), area_key.clone());
            properties.insert("address".to_string(), area_key.clone());

            if area_key == "unknown" {
                properties.insert("name".to_string(), "Unknown".to_string());
            }
            if let Some(info) = area_info.get(&area_key) {
                if let Some(name) = &info.name {
                    properties.insert("name".to_string(), name.clone());
                }
                if let Some(description) = &info.description {
                    properties.insert("description".to_string(), description.clone());
                }
                if let Some(comment) = &info.comment {
                    properties.insert("comment".to_string(), comment.clone());
                }
            }

            let area_label = if area_key == "unknown" {
                "Area Unknown".to_string()
            } else {
                format!("Area {}", area_key)
            };

            nodes.push(Node {
                id: id.clone(),
                kind: NodeKind::Area,
                label: area_label,
                parent_id: None,
                properties,
            });
            area_nodes.insert(area_key.clone(), id.clone());
            id
        };

        let line_map_key = format!("{}.{}", area_key, line_key);
        let line_id = if let Some(id) = line_nodes.get(&line_map_key) {
            id.clone()
        } else {
            let id = format!("line_{}_{}", area_key, line_key);
            let mut properties = HashMap::new();
            properties.insert("area".to_string(), area_key.clone());
            properties.insert("line".to_string(), line_key.clone());
            properties.insert("address".to_string(), line_map_key.clone());

            if line_key == "unknown" {
                properties.insert("name".to_string(), "Unknown".to_string());
            }
            if let Some(info) = line_info.get(&line_map_key) {
                if let Some(name) = &info.name {
                    properties.insert("name".to_string(), name.clone());
                }
                if let Some(description) = &info.description {
                    properties.insert("description".to_string(), description.clone());
                }
                if let Some(comment) = &info.comment {
                    properties.insert("comment".to_string(), comment.clone());
                }
                if let Some(medium) = &info.medium_type {
                    properties.insert("medium".to_string(), medium.clone());
                }
            }

            let line_label = if line_key == "unknown" {
                "Line Unknown".to_string()
            } else {
                format!("Line {}.{}", area_key, line_key)
            };

            nodes.push(Node {
                id: id.clone(),
                kind: NodeKind::Line,
                label: line_label,
                parent_id: Some(area_id.clone()),
                properties,
            });
            line_nodes.insert(line_map_key, id.clone());
            id
        };

        nodes.push(Node {
            id: device_id,
            kind: NodeKind::Device,
            label: format!("{}\n{}", address, device.name),
            parent_id: Some(line_id),
            properties,
        });
    }

    GraphModel { nodes, edges }
}

/// Generate group address graph from KNX project data
pub fn generate_group_address_graph(project: &KnxProjectData) -> GraphModel {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut ga_links: HashMap<String, Vec<GroupObjectLink>> = HashMap::new();

    // Create device nodes
    for device in &project.devices {
        let device_id = format!("device_{}", device.individual_address.replace('.', "_"));

        let properties = device_properties(device);

        nodes.push(Node {
            id: device_id.clone(),
            kind: NodeKind::Device,
            label: format!("{}\n{}", device.individual_address, device.name),
            parent_id: None,
            properties,
        });

        let mut sorted_links: Vec<&crate::knx::GroupLink> = device.group_links.iter().collect();
        sorted_links.sort_by(|a, b| {
            a.group_address
                .cmp(&b.group_address)
                .then_with(|| a.object_name.cmp(&b.object_name))
        });

        // Create group object nodes and link edges
        for (idx, link) in sorted_links.iter().enumerate() {
            let obj_id = format!("{}_obj_{}", device_id, idx);
            let mut obj_properties = HashMap::new();
            obj_properties.insert("group_address".to_string(), link.group_address.clone());
            obj_properties.insert("object_name".to_string(), link.object_name.clone());
            if let Some(name) = &link.object_name_raw {
                obj_properties.insert("object_name_raw".to_string(), name.clone());
            }
            if let Some(text) = &link.object_text {
                obj_properties.insert("object_text".to_string(), text.clone());
            }
            if let Some(text) = &link.object_function_text {
                obj_properties.insert("object_function_text".to_string(), text.clone());
            }
            obj_properties.insert(
                "is_transmitter".to_string(),
                link.is_transmitter.to_string(),
            );
            obj_properties.insert("is_receiver".to_string(), link.is_receiver.to_string());

            if let Some(dpt) = &link.datapoint_type {
                obj_properties.insert("datapoint_type".to_string(), dpt.clone());
            }
            if let Some(num) = link.number {
                obj_properties.insert("number".to_string(), num.to_string());
            }
            if let Some(desc) = &link.description {
                obj_properties.insert("description".to_string(), desc.clone());
            }
            if let Some(flags) = &link.flags {
                let mut flags_str = Vec::new();
                if flags.communication {
                    flags_str.push("C");
                }
                if flags.read {
                    flags_str.push("R");
                }
                if flags.write {
                    flags_str.push("W");
                }
                if flags.transmit {
                    flags_str.push("T");
                }
                if flags.update {
                    flags_str.push("U");
                }
                if flags.read_on_init {
                    flags_str.push("I");
                }
                obj_properties.insert("flags".to_string(), flags_str.join(" "));
            }

            let label = link.object_name.clone();

            nodes.push(Node {
                id: obj_id.clone(),
                kind: NodeKind::GroupObject,
                label,
                parent_id: Some(device_id.clone()),
                properties: obj_properties,
            });

            ga_links
                .entry(link.group_address.clone())
                .or_default()
                .push(GroupObjectLink {
                    id: obj_id,
                    is_transmitter: link.is_transmitter,
                    is_receiver: link.is_receiver,
                });
        }
    }

    // Create group address nodes
    for ga in &project.group_addresses {
        let ga_id = format!("ga_{}", ga.address.replace('/', "_"));

        let mut properties = HashMap::new();
        properties.insert("address".to_string(), ga.address.clone());
        if !ga.name.trim().is_empty() {
            properties.insert("name".to_string(), ga.name.clone());
        }
        if let Some(dpt) = &ga.datapoint_type {
            properties.insert("datapoint_type".to_string(), dpt.clone());
        }
        if let Some(main) = &ga.main_group_name {
            properties.insert("main_name".to_string(), main.clone());
        }
        if let Some(main_desc) = &ga.main_group_description {
            properties.insert("main_description".to_string(), main_desc.clone());
        }
        if let Some(main_comment) = &ga.main_group_comment {
            properties.insert("main_comment".to_string(), main_comment.clone());
        }
        if let Some(middle) = &ga.middle_group_name {
            properties.insert("middle_name".to_string(), middle.clone());
        }
        if let Some(middle_desc) = &ga.middle_group_description {
            properties.insert("middle_description".to_string(), middle_desc.clone());
        }
        if let Some(middle_comment) = &ga.middle_group_comment {
            properties.insert("middle_comment".to_string(), middle_comment.clone());
        }
        if let Some(desc) = &ga.description {
            properties.insert("description".to_string(), desc.clone());
        }
        if let Some(comment) = &ga.comment {
            properties.insert("comment".to_string(), comment.clone());
        }

        nodes.push(Node {
            id: ga_id,
            kind: NodeKind::GroupAddress,
            label: format!("{}\n{}", ga.address, ga.name),
            parent_id: None,
            properties,
        });
    }

    for (ga_address, mut objects) in ga_links {
        if objects.len() < 2 {
            continue;
        }
        objects.sort_by(|a, b| a.id.cmp(&b.id));

        let transmitters: Vec<&GroupObjectLink> =
            objects.iter().filter(|obj| obj.is_transmitter).collect();
        let receivers: Vec<&GroupObjectLink> =
            objects.iter().filter(|obj| obj.is_receiver).collect();

        let directed = transmitters.len() == 1 && !receivers.is_empty();
        if directed {
            let source = transmitters[0];
            for obj in objects.iter() {
                if obj.id == source.id {
                    continue;
                }
                let mut properties = HashMap::new();
                properties.insert("direction".to_string(), "directed".to_string());
                properties.insert("group_address".to_string(), ga_address.clone());

                edges.push(Edge {
                    id: format!("{}_to_{}", source.id, obj.id),
                    source: source.id.clone(),
                    target: obj.id.clone(),
                    kind: EdgeKind::Links,
                    label: None,
                    properties,
                });
            }
        } else {
            let hub = &objects[0];
            for obj in objects.iter().skip(1) {
                let mut properties = HashMap::new();
                properties.insert("direction".to_string(), "undirected".to_string());
                properties.insert("group_address".to_string(), ga_address.clone());

                edges.push(Edge {
                    id: format!("{}_to_{}", hub.id, obj.id),
                    source: hub.id.clone(),
                    target: obj.id.clone(),
                    kind: EdgeKind::Links,
                    label: None,
                    properties,
                });
            }
        }
    }

    GraphModel { nodes, edges }
}

#[derive(Clone)]
struct GroupObjectLink {
    id: String,
    is_transmitter: bool,
    is_receiver: bool,
}
