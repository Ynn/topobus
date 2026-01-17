use super::model::*;
use crate::knx::address::GroupAddress;
use anyhow::{anyhow, Context, Result};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use pbkdf2::pbkdf2_hmac;
use roxmltree::Document;
use sha2::Sha256;
use std::collections::HashMap;
use std::fs::File;
use std::io::{Cursor, Read, Seek};
use zip::result::{InvalidPassword, ZipError};
use zip::ZipArchive;

#[derive(Debug)]
pub struct PasswordRequiredError;

impl std::fmt::Display for PasswordRequiredError {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(fmt, "Encrypted KNX project: password required")
    }
}

impl std::error::Error for PasswordRequiredError {}

#[derive(Debug)]
pub struct InvalidPasswordError;

impl std::fmt::Display for InvalidPasswordError {
    fn fmt(&self, fmt: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(fmt, "Invalid password for KNX project")
    }
}

impl std::error::Error for InvalidPasswordError {}

const ZIP_PASSWORD_SALT: &str = "21.project.ets.knx.org";
const ZIP_PASSWORD_ITERATIONS: u32 = 65_536;
const ZIP_PASSWORD_KEY_LEN: usize = 32;

pub fn load_knxproj(path: &str, password: Option<&str>) -> Result<KnxProjectData> {
    log::info!("Loading KNX project from: {}", path);
    let file = File::open(path).context("Failed to open .knxproj file")?;
    load_knxproj_reader(file, password)
}

pub fn load_knxproj_bytes(data: &[u8], password: Option<&str>) -> Result<KnxProjectData> {
    log::info!("Loading KNX project from bytes ({} bytes)", data.len());
    let cursor = Cursor::new(data);
    load_knxproj_reader(cursor, password)
}

fn load_knxproj_reader<R: Read + Seek>(reader: R, password: Option<&str>) -> Result<KnxProjectData> {
    let mut zip = ZipArchive::new(reader).context("Failed to read .knxproj archive")?;

    let zip_password = password.map(derive_zip_password);
    if zip_password.is_some() {
        log::info!("Derived zip password for encrypted project");
    }

    let (project_xml, data_xml) = read_project_docs_any(&mut zip, zip_password.as_deref())?;

    let project_doc =
        Document::parse(strip_bom(&project_xml)).context("Failed to parse project.xml")?;
    let data_doc = Document::parse(strip_bom(&data_xml)).context("Failed to parse 0.xml")?;

    let manufacturer_names = read_manufacturer_names(&mut zip)?;

    let project_name = extract_project_name(&project_doc);
    let (areas, lines) = extract_topology_metadata(&data_doc);
    let (mut group_addresses, group_address_by_id) = extract_group_addresses(&data_doc)?;

    let devices = extract_devices(
        &data_doc,
        &mut zip,
        &group_address_by_id,
        &manufacturer_names,
    )?;
    let device_index: HashMap<String, (String, String)> = devices
        .iter()
        .map(|device| (device.instance_id.clone(), (device.individual_address.clone(), device.name.clone())))
        .collect();

    let locations = extract_locations(&data_doc, &device_index);

    let mut linked_devices: HashMap<String, Vec<String>> = HashMap::new();
    for device in &devices {
        for link in &device.group_links {
            linked_devices
                .entry(link.group_address.clone())
                .or_default()
                .push(device.individual_address.clone());
        }
    }

    for ga in &mut group_addresses {
        if let Some(list) = linked_devices.remove(&ga.address) {
            ga.linked_devices = list;
        }
    }

    Ok(KnxProjectData {
        project_name,
        areas,
        lines,
        devices,
        group_addresses,
        locations,
    })
}

fn strip_bom(input: &str) -> &str {
    input.strip_prefix('\u{feff}').unwrap_or(input)
}

fn read_manufacturer_names<R: Read + Seek>(
    zip: &mut ZipArchive<R>,
) -> Result<HashMap<String, String>> {
    match read_zip_entry(zip, "knx_master.xml") {
        Ok(xml) => {
            let doc = Document::parse(strip_bom(&xml)).context("Failed to parse knx_master.xml")?;
            Ok(extract_manufacturer_names(&doc))
        }
        Err(err) => {
            if let Some(zip_err) = err.downcast_ref::<ZipError>() {
                if matches!(*zip_err, ZipError::FileNotFound) {
                    log::warn!("knx_master.xml not found in project");
                    return Ok(HashMap::new());
                }
            }
            Err(err)
        }
    }
}

fn extract_manufacturer_names(doc: &Document) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for node in doc
        .descendants()
        .filter(|n| n.tag_name().name() == "Manufacturer")
    {
        let id = match node.attribute("Id") {
            Some(id) => id,
            None => continue,
        };
        let name = node.attribute("Name").unwrap_or("").trim();
        if !name.is_empty() {
            map.insert(id.to_string(), name.to_string());
        }
    }
    map
}

fn derive_zip_password(project_password: &str) -> String {
    let mut password_bytes = Vec::with_capacity(project_password.len() * 2);
    for unit in project_password.encode_utf16() {
        password_bytes.extend_from_slice(&unit.to_le_bytes());
    }

    let mut derived = [0u8; ZIP_PASSWORD_KEY_LEN];
    pbkdf2_hmac::<Sha256>(
        &password_bytes,
        ZIP_PASSWORD_SALT.as_bytes(),
        ZIP_PASSWORD_ITERATIONS,
        &mut derived,
    );
    BASE64_STANDARD.encode(derived)
}

#[derive(Copy, Clone)]
enum ProjectDocKind {
    Project,
    Data,
}

fn classify_project_doc(doc: &Document) -> Option<ProjectDocKind> {
    let mut has_project_info = false;
    let mut has_installations = false;
    let mut has_group_addresses = false;

    for node in doc.descendants() {
        match node.tag_name().name() {
            "ProjectInformation" => has_project_info = true,
            "Installations" | "Topology" => has_installations = true,
            "GroupAddresses" => has_group_addresses = true,
            _ => {}
        }
    }

    if has_installations || has_group_addresses {
        return Some(ProjectDocKind::Data);
    }
    if has_project_info {
        return Some(ProjectDocKind::Project);
    }
    None
}

fn numeric_xml_index(name: &str) -> Option<u32> {
    let file = name.rsplit('/').next().unwrap_or(name);
    let base = file.strip_suffix(".xml")?;
    if base.is_empty() || !base.chars().all(|ch| ch.is_ascii_digit()) {
        return None;
    }
    base.parse().ok()
}

fn find_project_paths<R: Read + Seek>(zip: &ZipArchive<R>) -> Result<(String, String)> {
    let mut project_xml = None;
    let mut data_xml = None;
    let mut data_candidate: Option<(u32, String)> = None;

    for name in zip.file_names() {
        if name.starts_with("P-") && name.ends_with("/project.xml") {
            project_xml = Some(name.to_string());
        } else if name.starts_with("P-") && name.ends_with("/0.xml") {
            data_xml = Some(name.to_string());
        } else if data_xml.is_none() {
            if let Some(index) = numeric_xml_index(name) {
                if data_candidate
                    .as_ref()
                    .map(|(best, _)| index < *best)
                    .unwrap_or(true)
                {
                    data_candidate = Some((index, name.to_string()));
                }
            }
        }
    }

    if project_xml.is_none() || data_xml.is_none() {
        for name in zip.file_names() {
            if project_xml.is_none() && name.ends_with("project.xml") {
                project_xml = Some(name.to_string());
            }
            if data_xml.is_none() && name.ends_with("0.xml") {
                data_xml = Some(name.to_string());
            } else if data_xml.is_none() {
                if let Some(index) = numeric_xml_index(name) {
                    if data_candidate
                        .as_ref()
                        .map(|(best, _)| index < *best)
                        .unwrap_or(true)
                    {
                        data_candidate = Some((index, name.to_string()));
                    }
                }
            }
        }
    }

    if data_xml.is_none() {
        if let Some((_, name)) = data_candidate {
            data_xml = Some(name);
        }
    }

    let project_xml = project_xml.context("Unable to locate project.xml in .knxproj")?;
    let data_xml = data_xml.context("Unable to locate project data in .knxproj")?;

    Ok((project_xml, data_xml))
}

fn find_project_paths_by_content<R: Read + Seek>(
    zip: &mut ZipArchive<R>,
    password: Option<&str>,
) -> Result<(String, String)> {
    let names: Vec<String> = zip.file_names().map(|name| name.to_string()).collect();
    let mut project_xml = None;
    let mut data_xml = None;

    for name in names {
        if !name.ends_with(".xml") {
            continue;
        }
        if name.ends_with("knx_master.xml") || name.starts_with("M-") {
            continue;
        }

        let xml = match read_zip_entry_with_password(zip, &name, password) {
            Ok(xml) => xml,
            Err(err) => {
                if err.downcast_ref::<PasswordRequiredError>().is_some()
                    || err.downcast_ref::<InvalidPasswordError>().is_some()
                {
                    return Err(err);
                }
                log::warn!("Unable to read xml {} ({})", name, err);
                continue;
            }
        };

        let doc = match Document::parse(strip_bom(&xml)) {
            Ok(doc) => doc,
            Err(err) => {
                log::warn!("Skipping xml {} ({})", name, err);
                continue;
            }
        };

        match classify_project_doc(&doc) {
            Some(ProjectDocKind::Project) => {
                if project_xml.is_none() {
                    project_xml = Some(name.clone());
                }
            }
            Some(ProjectDocKind::Data) => {
                if data_xml.is_none() {
                    data_xml = Some(name.clone());
                }
            }
            None => {}
        }

        if project_xml.is_some() && data_xml.is_some() {
            break;
        }
    }

    let project_xml = project_xml.context("Unable to locate project.xml in .knxproj")?;
    let data_xml = data_xml.context("Unable to locate project data in .knxproj")?;

    Ok((project_xml, data_xml))
}

fn read_zip_entry<R: Read + Seek>(zip: &mut ZipArchive<R>, path: &str) -> Result<String> {
    let mut file = zip
        .by_name(path)
        .with_context(|| format!("Missing file in .knxproj: {}", path))?;
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .with_context(|| format!("Failed to read {}", path))?;
    Ok(contents)
}

fn read_zip_entry_with_password<R: Read + Seek>(
    zip: &mut ZipArchive<R>,
    path: &str,
    password: Option<&str>,
) -> Result<String> {
    log::debug!(
        "Reading entry {} (password: {})",
        path,
        if password.is_some() { "yes" } else { "no" }
    );
    let mut file = if let Some(password) = password {
        match zip.by_name_decrypt(path, password.as_bytes()) {
            Ok(Ok(file)) => file,
            Ok(Err(InvalidPassword)) => {
                log::warn!("Invalid password for {}", path);
                return Err(InvalidPasswordError.into());
            }
            Err(ZipError::UnsupportedArchive(msg)) if msg == ZipError::PASSWORD_REQUIRED => {
                log::warn!("Password required for {}", path);
                return Err(PasswordRequiredError.into());
            }
            Err(err) => return Err(err.into()),
        }
    } else {
        match zip.by_name(path) {
            Ok(file) => file,
            Err(ZipError::UnsupportedArchive(msg)) if msg == ZipError::PASSWORD_REQUIRED => {
                log::warn!("Password required for {}", path);
                return Err(PasswordRequiredError.into());
            }
            Err(err) => return Err(err.into()),
        }
    };

    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .with_context(|| format!("Failed to read {}", path))?;
    Ok(contents)
}

fn read_zip_bytes_with_password<R: Read + Seek>(
    zip: &mut ZipArchive<R>,
    path: &str,
    password: Option<&str>,
) -> Result<Vec<u8>> {
    log::debug!(
        "Reading zip bytes {} (password: {})",
        path,
        if password.is_some() { "yes" } else { "no" }
    );
    let mut file = if let Some(password) = password {
        match zip.by_name_decrypt(path, password.as_bytes()) {
            Ok(Ok(file)) => file,
            Ok(Err(InvalidPassword)) => {
                log::warn!("Invalid password for {}", path);
                return Err(InvalidPasswordError.into());
            }
            Err(ZipError::UnsupportedArchive(msg)) if msg == ZipError::PASSWORD_REQUIRED => {
                log::warn!("Password required for {}", path);
                return Err(PasswordRequiredError.into());
            }
            Err(err) => return Err(err.into()),
        }
    } else {
        match zip.by_name(path) {
            Ok(file) => file,
            Err(ZipError::UnsupportedArchive(msg)) if msg == ZipError::PASSWORD_REQUIRED => {
                log::warn!("Password required for {}", path);
                return Err(PasswordRequiredError.into());
            }
            Err(err) => return Err(err.into()),
        }
    };

    let mut contents = Vec::new();
    file.read_to_end(&mut contents)
        .with_context(|| format!("Failed to read {}", path))?;
    Ok(contents)
}

fn read_project_docs<R: Read + Seek>(
    zip: &mut ZipArchive<R>,
    password: Option<&str>,
) -> Result<(String, String)> {
    let (project_xml_path, data_xml_path) = match find_project_paths(zip) {
        Ok(paths) => paths,
        Err(_) => find_project_paths_by_content(zip, password)?,
    };
    log::info!(
        "Project docs: project={}, data={}",
        project_xml_path,
        data_xml_path
    );
    let project_xml = read_zip_entry_with_password(zip, &project_xml_path, password)?;
    let data_xml = read_zip_entry_with_password(zip, &data_xml_path, password)?;
    Ok((project_xml, data_xml))
}

fn read_project_docs_any<R: Read + Seek>(
    zip: &mut ZipArchive<R>,
    password: Option<&str>,
) -> Result<(String, String)> {
    match read_project_docs(zip, password) {
        Ok(docs) => return Ok(docs),
        Err(err) => {
            if err.downcast_ref::<PasswordRequiredError>().is_some()
                || err.downcast_ref::<InvalidPasswordError>().is_some()
            {
                return Err(err);
            }
        }
    }

    let names: Vec<String> = zip.file_names().map(|name| name.to_string()).collect();
    for name in names {
        if !name.ends_with(".zip") {
            continue;
        }
        log::debug!("Scanning nested archive {}", name);
        let nested_bytes = match read_zip_bytes_with_password(zip, &name, password) {
            Ok(bytes) => bytes,
            Err(err) => {
                if err.downcast_ref::<PasswordRequiredError>().is_some()
                    || err.downcast_ref::<InvalidPasswordError>().is_some()
                {
                    return Err(err);
                }
                log::warn!("Unable to read nested zip {} ({})", name, err);
                continue;
            }
        };
        let mut nested_zip = match ZipArchive::new(Cursor::new(nested_bytes)) {
            Ok(zip) => zip,
            Err(err) => {
                log::warn!("Unable to open nested zip {} ({})", name, err);
                continue;
            }
        };
        match read_project_docs(&mut nested_zip, password) {
            Ok(docs) => {
                log::info!("Project docs found in nested archive {}", name);
                return Ok(docs);
            }
            Err(err) => {
                if err.downcast_ref::<PasswordRequiredError>().is_some()
                    || err.downcast_ref::<InvalidPasswordError>().is_some()
                {
                    return Err(err);
                }
            }
        }
    }

    Err(anyhow!("Unable to locate project data in .knxproj"))
}

fn extract_project_name(doc: &Document) -> String {
    doc.descendants()
        .find(|node| node.tag_name().name() == "ProjectInformation")
        .and_then(|node| node.attribute("Name"))
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("TopoBus Project")
        .to_string()
}

fn extract_topology_metadata(doc: &Document) -> (Vec<AreaInfo>, Vec<LineInfo>) {
    let mut areas = Vec::new();
    let mut lines = Vec::new();

    for area in doc
        .descendants()
        .filter(|node| node.tag_name().name() == "Area")
    {
        let address = match area.attribute("Address") {
            Some(address) => address.to_string(),
            None => continue,
        };
        areas.push(AreaInfo {
            address,
            name: attr_value(&area, "Name"),
            description: attr_value(&area, "Description"),
            comment: attr_value(&area, "Comment"),
        });
    }

    for line in doc
        .descendants()
        .filter(|node| node.tag_name().name() == "Line")
    {
        let address = match line.attribute("Address") {
            Some(address) => address.to_string(),
            None => continue,
        };
        let area = match find_ancestor_address(&line, "Area") {
            Some(area) => area,
            None => continue,
        };
        let medium_type = line
            .children()
            .find(|node| node.is_element() && node.tag_name().name() == "Segment")
            .and_then(|node| node.attribute("MediumTypeRefId"))
            .map(medium_name);

        lines.push(LineInfo {
            area,
            line: address,
            name: attr_value(&line, "Name"),
            description: attr_value(&line, "Description"),
            comment: attr_value(&line, "Comment"),
            medium_type,
        });
    }

    (areas, lines)
}

fn extract_group_addresses(
    doc: &Document,
) -> Result<(Vec<GroupAddressInfo>, HashMap<String, GroupAddressInfo>)> {
    let mut group_addresses = Vec::new();
    let mut by_id = HashMap::new();

    for group in doc
        .descendants()
        .filter(|n| n.tag_name().name() == "GroupAddress")
    {
        let mut ranges: Vec<_> = group
            .ancestors()
            .filter(|n| n.tag_name().name() == "GroupRange")
            .collect();
        ranges.reverse();
        let main_group_name = ranges
            .first()
            .and_then(|node| node.attribute("Name"))
            .map(|name| name.trim().to_string())
            .filter(|name| !name.is_empty());
        let main_group_description = ranges
            .first()
            .and_then(|node| attr_value(node, "Description"));
        let main_group_comment = ranges
            .first()
            .and_then(|node| attr_value(node, "Comment"));
        let middle_group_name = ranges
            .get(1)
            .and_then(|node| node.attribute("Name"))
            .map(|name| name.trim().to_string())
            .filter(|name| !name.is_empty());
        let middle_group_description = ranges
            .get(1)
            .and_then(|node| attr_value(node, "Description"));
        let middle_group_comment = ranges
            .get(1)
            .and_then(|node| attr_value(node, "Comment"));

        let id = group.attribute("Id").unwrap_or("").to_string();
        let short_id = short_id(&id);
        let address_value = group
            .attribute("Address")
            .unwrap_or("0")
            .parse::<u16>()
            .unwrap_or(0);
        let address = GroupAddress::new(address_value).to_string();
        let name = group.attribute("Name").unwrap_or("").to_string();
        let datapoint_type = group.attribute("DatapointType").map(|s| s.to_string());
        let description = attr_value(&group, "Description");
        let comment = attr_value(&group, "Comment");

        let info = GroupAddressInfo {
            address,
            name,
            main_group_name,
            main_group_description,
            main_group_comment,
            middle_group_name,
            middle_group_description,
            middle_group_comment,
            description,
            comment,
            datapoint_type,
            linked_devices: Vec::new(),
        };

        by_id.insert(short_id, info.clone());
        group_addresses.push(info);
    }

    Ok((group_addresses, by_id))
}

fn extract_devices<R: Read + Seek>(
    doc: &Document,
    zip: &mut ZipArchive<R>,
    group_address_by_id: &HashMap<String, GroupAddressInfo>,
    manufacturer_names: &HashMap<String, String>,
) -> Result<Vec<DeviceInfo>> {
    let mut devices = Vec::new();
    let mut hardware_cache: HashMap<String, HardwareData> = HashMap::new();
    let mut app_cache: HashMap<String, AppProgram> = HashMap::new();

    for device_node in doc
        .descendants()
        .filter(|n| n.tag_name().name() == "DeviceInstance")
    {
        let device_id = device_node.attribute("Id").unwrap_or("");
        let device_addr_attr = device_node.attribute("Address");
        let area = find_ancestor_address(&device_node, "Area");
        let line = find_ancestor_address(&device_node, "Line");

        let individual_address = match (area, line, device_addr_attr) {
            (Some(a), Some(l), Some(d)) if d != "0" => format!("{}.{}.{}", a, l, d),
            (Some(a), Some(l), _) => format!("{}.{}. - ({})", a, l, short_id(device_id)),
            (_, _, Some(d)) => d.to_string(),
            (_, _, None) => format!(" - ({})", short_id(device_id)),
        };

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
            .find(|node| node.tag_name().name() == "Segment");
        let segment_id = segment_node
            .and_then(|node| node.attribute("Id"))
            .map(|value| value.to_string());
        let segment_number = segment_node.and_then(|node| attr_value(&node, "Number"));
        let segment_domain_address = segment_node.and_then(|node| attr_value(&node, "DomainAddress"));
        let segment_medium_type = segment_node
            .and_then(|node| node.attribute("MediumTypeRefId"))
            .map(medium_name);
        let medium_type = segment_medium_type.clone();
        let ip_config = device_node
            .children()
            .find(|node| node.is_element() && node.tag_name().name() == "IPConfig")
            .or_else(|| {
                device_node
                    .descendants()
                    .find(|node| node.tag_name().name() == "IPConfig")
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

        let (product_name, product_reference) = product_ref_id
            .as_ref()
            .and_then(|id| hardware_data.and_then(|data| data.products.get(id)))
            .map(|info| (info.name.clone(), info.order_number.clone()))
            .unwrap_or((None, None));

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
            .filter(|n| n.tag_name().name() == "ModuleInstance")
        {
            let module_id = module.attribute("Id").unwrap_or("").to_string();
            if module_id.is_empty() {
                continue;
            }
            let mut args = HashMap::new();
            for arg in module
                .descendants()
                .filter(|n| n.tag_name().name() == "Argument")
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
            ensure_app_program(zip, hw, hardware_data, &mut app_cache)?
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
            .filter(|n| n.tag_name().name() == "ComObjectInstanceRef")
        {
            let ref_id = com_ref.attribute("RefId").unwrap_or("");
            if ref_id.is_empty() {
                continue;
            }

            let link_attr = com_ref.attribute("Links").unwrap_or("");
            let link_ids: Vec<&str> = link_attr
                .split([' ', ','])
                .filter(|value| !value.is_empty())
                .collect();
            if link_ids.is_empty() {
                continue;
            }

            let module_id = ref_id.split("_O-").next().unwrap_or("");
            let arg_values = resolve_module_arguments(module_args.get(module_id), app);

            let com_key = com_object_key(ref_id);
            let com_def = app.and_then(|program| program.com_object_refs.get(&com_key));
            let com_obj = com_def
                .and_then(|def| def.ref_id.as_ref())
                .and_then(|ref_id| app.and_then(|program| program.com_objects.get(ref_id)));
            let com_data = resolve_com_data(com_def, app);
            let com_flags = com_data.flags;
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

            for link_id in link_ids {
                let info = group_address_by_id.get(link_id);
                let address = info
                    .map(|ga| ga.address.clone())
                    .unwrap_or_else(|| link_id.to_string());
                let fallback = info
                    .map(|ga| ga.name.clone())
                    .filter(|name| !name.trim().is_empty())
                    .unwrap_or_else(|| ref_id.to_string());
                let mut parts = Vec::new();
                if let Some(num) = com_data.number {
                    parts.push(format!("[#{}]", num));
                }

                let name_part = object_name_raw
                    .clone()
                    .or_else(|| object_text.clone())
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

                group_links.push(GroupLink {
                    object_name,
                    object_name_raw: object_name_raw.clone(),
                    object_text: object_text.clone(),
                    object_function_text: object_function_text.clone(),
                    group_address: address,
                    is_transmitter: com_flags.is_transmitter(),
                    is_receiver: com_flags.is_receiver(),
                    channel: com_data.channel.clone(),
                    datapoint_type: com_data.datapoint_type.clone(),
                    number: com_data.number,
                    description: com_data.description.clone(),
                    flags: Some(com_flags.to_model_flags()),
                });
            }
        }

        let mut configuration = HashMap::new();
        let mut configuration_entries = Vec::new();

        // Extract ParameterInstanceRef
        for param_ref in device_node
            .descendants()
            .filter(|n| n.tag_name().name() == "ParameterInstanceRef")
        {
            let ref_id = param_ref.attribute("RefId").unwrap_or("");
            let value = param_ref.attribute("Value").unwrap_or("");
            if ref_id.is_empty() || value.is_empty() {
                continue;
            }

            let short_ref = ref_id.split('_').next_back().unwrap_or(ref_id);
            // Try to resolve name from AppProgram
            let param_def = app.and_then(|program| program.parameters.get(short_ref));

            let name = param_def
                .and_then(|def| def.text.as_ref().or(def.name.as_ref()))
                .cloned()
                .unwrap_or_else(|| short_ref.to_string());

            // Simple value formatting (could be improved for specific types like IP)
            configuration.insert(name.clone(), value.to_string());
            configuration_entries.push(DeviceConfigEntry {
                name,
                value: value.to_string(),
                ref_id: Some(short_ref.to_string()),
                source: Some("Parameter".to_string()),
            });
        }

        // Extract Property (often contains IP info for interfaces)
        for property in device_node
            .descendants()
            .filter(|n| n.tag_name().name() == "Property")
        {
            // Try to identify property type/name
            // Property Id is often numeric or structured
            let id = property.attribute("Id").unwrap_or("");
            let value = property.attribute("Value").unwrap_or("");

            // Common Property IDs for IP (PID_IP_ADDRESS = 51, etc.) can be checked but generic dump is safer first
            // Just use Id as key for now if we can't map it, or Name if available (rare on instance)
            if !value.is_empty() {
                let name = format!("Property {}", id);
                configuration.insert(name.clone(), value.to_string());
                configuration_entries.push(DeviceConfigEntry {
                    name,
                    value: value.to_string(),
                    ref_id: if id.is_empty() { None } else { Some(id.to_string()) },
                    source: Some("Property".to_string()),
                });
            }
        }

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

fn extract_locations(
    doc: &Document,
    device_index: &HashMap<String, (String, String)>,
) -> Vec<BuildingSpace> {
    let mut roots = Vec::new();
    for locations in doc
        .descendants()
        .filter(|n| n.tag_name().name() == "Locations")
    {
        for space in locations
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == "Space")
        {
            roots.push(parse_space(space, device_index));
        }
    }
    roots
}

fn parse_space(
    node: roxmltree::Node,
    device_index: &HashMap<String, (String, String)>,
) -> BuildingSpace {
    let id = node.attribute("Id").unwrap_or("").to_string();
    let name = attr_value(&node, "Name");
    let space_type = node.attribute("Type").unwrap_or("Space").to_string();
    let number = attr_value(&node, "Number");
    let default_line = attr_value(&node, "DefaultLine");
    let description = attr_value(&node, "Description");
    let completion_status = attr_value(&node, "CompletionStatus");

    let mut devices = Vec::new();
    for dev_ref in node
        .children()
        .filter(|n| n.is_element() && n.tag_name().name() == "DeviceInstanceRef")
    {
        if let Some(ref_id) = dev_ref.attribute("RefId") {
            let (address, name) = device_index
                .get(ref_id)
                .map(|(addr, name)| (Some(addr.clone()), Some(name.clone())))
                .unwrap_or((None, None));
            devices.push(BuildingDeviceRef {
                instance_id: ref_id.to_string(),
                address,
                name,
            });
        }
    }

    let children = node
        .children()
        .filter(|n| n.is_element() && n.tag_name().name() == "Space")
        .map(|child| parse_space(child, device_index))
        .collect();

    BuildingSpace {
        id,
        name,
        space_type,
        number,
        default_line,
        description,
        completion_status,
        devices,
        children,
    }
}

fn find_ancestor_address(node: &roxmltree::Node, tag: &str) -> Option<String> {
    node.ancestors()
        .find(|ancestor| ancestor.tag_name().name() == tag)
        .and_then(|ancestor| ancestor.attribute("Address"))
        .map(|value| value.to_string())
}

fn short_id(full_id: &str) -> String {
    full_id.rsplit('_').next().unwrap_or(full_id).to_string()
}

fn manufacturer_id_from_ref(value: &str) -> Option<String> {
    let id = value.split('_').next().unwrap_or("");
    if id.starts_with("M-") {
        Some(id.to_string())
    } else {
        None
    }
}

fn medium_name(medium_ref: &str) -> String {
    match medium_ref {
        "MT-0" => "TP",
        "MT-1" => "PL",
        "MT-2" => "RF",
        "MT-5" => "IP",
        "MT-6" => "IoT",
        _ => medium_ref,
    }
    .to_string()
}

fn com_object_key(instance_ref: &str) -> String {
    if let Some(o_index) = instance_ref.find("_O-") {
        let module = instance_ref.split('_').next().unwrap_or("");
        let suffix = &instance_ref[o_index + 1..];
        if !module.is_empty() {
            return format!("{}_{}", module, suffix);
        }
    }
    instance_ref.to_string()
}

fn ensure_app_program<R: Read + Seek>(
    zip: &mut ZipArchive<R>,
    hardware2program: &str,
    hardware_data: Option<&HardwareData>,
    app_cache: &mut HashMap<String, AppProgram>,
) -> Result<Option<String>> {
    let app_id = hardware_data
        .and_then(|data| data.hardware2program.get(hardware2program))
        .cloned();
    let app_id = match app_id {
        Some(id) => id,
        None => return Ok(None),
    };

    if !app_cache.contains_key(&app_id) {
        let program = match load_app_program(zip, &app_id) {
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
    for hw in doc
        .descendants()
        .filter(|n| n.tag_name().name() == "Hardware2Program")
    {
        let id = match hw.attribute("Id") {
            Some(id) => id.to_string(),
            None => continue,
        };
        let app_ref = hw
            .descendants()
            .find(|n| n.tag_name().name() == "ApplicationProgramRef")
            .and_then(|n| n.attribute("RefId"))
            .map(|s| s.to_string());
        if let Some(app_ref) = app_ref {
            hardware2program.insert(id, app_ref);
        }
    }

    let mut products = HashMap::new();
    for product in doc
        .descendants()
        .filter(|n| n.tag_name().name() == "Product")
    {
        let id = match product.attribute("Id") {
            Some(id) => id.to_string(),
            None => continue,
        };
        let name = attr_value(&product, "Text");
        let order_number = attr_value(&product, "OrderNumber");
        products
            .entry(id)
            .or_insert(ProductInfo { name, order_number });
    }

    Ok(HardwareData {
        hardware2program,
        products,
    })
}

fn load_app_program<R: Read + Seek>(zip: &mut ZipArchive<R>, app_id: &str) -> Result<AppProgram> {
    let manufacturer = app_id.split('_').next().unwrap_or("");
    let path = format!("{}/{}.xml", manufacturer, app_id);
    let xml = read_zip_entry(zip, &path)?;
    let doc =
        Document::parse(strip_bom(&xml)).with_context(|| format!("Failed to parse {}", path))?;
    let prefix = format!("{}_", app_id);

    let mut arguments = HashMap::new();
    for arg in doc
        .descendants()
        .filter(|n| n.tag_name().name() == "Argument")
    {
        let id = match arg.attribute("Id") {
            Some(id) => id,
            None => continue,
        };
        let name = match arg.attribute("Name") {
            Some(name) if !name.trim().is_empty() => name,
            _ => continue,
        };
        arguments.insert(strip_prefix(id, &prefix), name.to_string());
    }

    let mut com_objects = HashMap::new();
    for obj in doc
        .descendants()
        .filter(|n| n.tag_name().name() == "ComObject")
    {
        let id = match obj.attribute("Id") {
            Some(id) => id,
            None => continue,
        };
        com_objects.insert(
            strip_prefix(id, &prefix),
            ComObjectDef {
                flags: Flags::from_node(&obj),
                datapoint_type: attr_value(&obj, "DatapointType"),
                number: obj.attribute("Number").and_then(|v| v.parse().ok()),
                description: attr_value(&obj, "Description"),
                name: attr_value(&obj, "Name"),
                text: attr_value(&obj, "Text"),
                function_text: attr_value(&obj, "FunctionText"),
            },
        );
    }

    let mut com_object_refs = HashMap::new();
    for obj in doc.descendants() {
        if obj.tag_name().name() != "ComObjectRef" {
            continue;
        }
        let id = match obj.attribute("Id") {
            Some(id) => id,
            None => continue,
        };

        // Attempt to find parent channel/module name
        let channel_name = obj
            .parent()
            .filter(|n| n.tag_name().name() == "Channel" || n.tag_name().name() == "Module")
            .and_then(|n| attr_value(&n, "Text").or_else(|| attr_value(&n, "Name")));

        let def = ComObjectRefDef {
            function_text: attr_value(&obj, "FunctionText"),
            name: attr_value(&obj, "Name"),
            text: attr_value(&obj, "Text"),
            datapoint_type: attr_value(&obj, "DatapointType"),
            ref_id: obj
                .attribute("RefId")
                .map(|value| strip_prefix(value, &prefix)),
            flags: Flags::from_node(&obj),
            channel: channel_name,
            number: obj.attribute("Number").and_then(|v| v.parse().ok()),
            description: attr_value(&obj, "Description"),
        };
        com_object_refs.insert(strip_prefix(id, &prefix), def);
    }

    let mut parameters = HashMap::new();
    for param in doc
        .descendants()
        .filter(|n| n.tag_name().name() == "Parameter")
    {
        let id = match param.attribute("Id") {
            Some(id) => id,
            None => continue,
        };
        parameters.insert(
            strip_prefix(id, &prefix),
            ParameterDef {
                name: attr_value(&param, "Name"),
                text: attr_value(&param, "Text"),
            },
        );
    }

    let app_node = doc
        .descendants()
        .find(|node| node.tag_name().name() == "ApplicationProgram");
    let app_name = app_node.and_then(|node| attr_value(&node, "Name"));
    let app_version = app_node.and_then(|node| attr_value(&node, "ApplicationVersion"));
    let app_number = app_node.and_then(|node| attr_value(&node, "ApplicationNumber"));
    let app_type = app_node.and_then(|node| attr_value(&node, "ProgramType"));
    let mask_version = app_node.and_then(|node| attr_value(&node, "MaskVersion"));

    Ok(AppProgram {
        name: app_name,
        version: app_version,
        number: app_number,
        program_type: app_type,
        mask_version,
        arguments,
        com_object_refs,
        com_objects,
        parameters,
    })
}

fn strip_prefix(value: &str, prefix: &str) -> String {
    value.strip_prefix(prefix).unwrap_or(value).to_string()
}

fn attr_value(node: &roxmltree::Node, name: &str) -> Option<String> {
    node.attribute(name)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

fn resolve_module_arguments(
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

fn resolve_object_name(
    com_def: Option<&ComObjectRefDef>,
    com_obj: Option<&ComObjectDef>,
    arg_values: &HashMap<String, String>,
) -> Option<String> {
    let base = com_def
        .and_then(|def| def.function_text.as_deref())
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            com_def
                .and_then(|def| def.name.as_deref())
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| {
            com_def
                .and_then(|def| def.text.as_deref())
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| {
            com_obj
                .and_then(|def| def.function_text.as_deref())
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| {
            com_obj
                .and_then(|def| def.name.as_deref())
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| {
            com_obj
                .and_then(|def| def.text.as_deref())
                .filter(|value| !value.trim().is_empty())
        })?;
    resolve_template(Some(base), arg_values)
}

fn resolve_template(value: Option<&str>, arg_values: &HashMap<String, String>) -> Option<String> {
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

struct ComObjectData {
    flags: Flags,
    datapoint_type: Option<String>,
    channel: Option<String>,
    number: Option<u32>,
    description: Option<String>,
}

fn resolve_com_data(com_def: Option<&ComObjectRefDef>, app: Option<&AppProgram>) -> ComObjectData {
    let mut flags = com_def.map(|def| def.flags.clone()).unwrap_or_default();
    let mut dpt = com_def.and_then(|def| def.datapoint_type.clone());
    let channel = com_def.and_then(|def| def.channel.clone());
    let mut number = com_def.and_then(|def| def.number);
    let mut description = com_def.and_then(|def| def.description.clone());

    if let Some(def) = com_def {
        if let Some(ref_id) = &def.ref_id {
            if let Some(program) = app {
                if let Some(obj) = program.com_objects.get(ref_id) {
                    flags = flags.with_fallback(obj.flags.clone());
                    if dpt.is_none() {
                        dpt = obj.datapoint_type.clone();
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
    }
}

#[derive(Clone, Default)]
struct Flags {
    communication: Option<bool>,
    read: Option<bool>,
    write: Option<bool>,
    transmit: Option<bool>,
    update: Option<bool>,
    read_on_init: Option<bool>,
}

impl Flags {
    fn from_node(node: &roxmltree::Node) -> Self {
        Self {
            communication: parse_flag(node.attribute("CommunicationFlag")),
            read: parse_flag(node.attribute("ReadFlag")),
            write: parse_flag(node.attribute("WriteFlag")),
            transmit: parse_flag(node.attribute("TransmitFlag")),
            update: parse_flag(node.attribute("UpdateFlag")),
            read_on_init: parse_flag(node.attribute("ReadOnInitFlag")),
        }
    }

    fn with_fallback(self, fallback: Flags) -> Flags {
        Flags {
            communication: self.communication.or(fallback.communication),
            read: self.read.or(fallback.read),
            write: self.write.or(fallback.write),
            transmit: self.transmit.or(fallback.transmit),
            update: self.update.or(fallback.update),
            read_on_init: self.read_on_init.or(fallback.read_on_init),
        }
    }

    fn is_transmitter(&self) -> bool {
        matches!(self.transmit, Some(true)) || matches!(self.update, Some(true))
    }

    fn is_receiver(&self) -> bool {
        matches!(self.write, Some(true)) || matches!(self.read, Some(true))
    }

    fn to_model_flags(&self) -> crate::knx::model::ObjectFlags {
        crate::knx::model::ObjectFlags {
            communication: self.communication.unwrap_or(false),
            read: self.read.unwrap_or(false),
            write: self.write.unwrap_or(false),
            transmit: self.transmit.unwrap_or(false),
            update: self.update.unwrap_or(false),
            read_on_init: self.read_on_init.unwrap_or(false),
        }
    }
}

fn parse_flag(value: Option<&str>) -> Option<bool> {
    match value {
        Some("Enabled") | Some("true") | Some("True") => Some(true),
        Some("Disabled") | Some("false") | Some("False") => Some(false),
        _ => None,
    }
}

struct AppProgram {
    name: Option<String>,
    version: Option<String>,
    number: Option<String>,
    program_type: Option<String>,
    mask_version: Option<String>,
    arguments: HashMap<String, String>,
    com_object_refs: HashMap<String, ComObjectRefDef>,
    com_objects: HashMap<String, ComObjectDef>,
    parameters: HashMap<String, ParameterDef>,
}

struct HardwareData {
    hardware2program: HashMap<String, String>,
    products: HashMap<String, ProductInfo>,
}

#[derive(Clone)]
struct ProductInfo {
    name: Option<String>,
    order_number: Option<String>,
}

#[derive(Clone)]
struct ComObjectRefDef {
    ref_id: Option<String>,
    name: Option<String>,
    text: Option<String>,
    function_text: Option<String>,
    datapoint_type: Option<String>,
    flags: Flags,
    channel: Option<String>,
    number: Option<u32>,
    description: Option<String>,
}

#[derive(Clone)]
struct ComObjectDef {
    flags: Flags,
    datapoint_type: Option<String>,
    number: Option<u32>,
    description: Option<String>,
    name: Option<String>,
    text: Option<String>,
    function_text: Option<String>,
}

#[derive(Clone)]
struct ParameterDef {
    name: Option<String>,
    text: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::derive_zip_password;

    #[test]
    fn derive_zip_password_vectors() {
        assert_eq!(
            derive_zip_password("a"),
            "+FAwP4iI7/Pu4WB3HdIHbbFmteLahPAVkjJShKeozAA="
        );
        assert_eq!(
            derive_zip_password("test"),
            "2+IIP7ErCPPKxFjJXc59GFx2+w/1VTLHjJ2duc04CYQ="
        );
    }

    #[test]
    fn test_inspect_devices() -> anyhow::Result<()> {
        let _ = env_logger::builder().is_test(true).try_init();

        let path = r"tmp/Laboratoire domotique octobre2024.knxproj";
        if !std::path::Path::new(path).exists() {
            println!("Skipping test as file not found: {}", path);
            return Ok(());
        }

        let password = Some("*Domoserv1");
        let project = super::load_knxproj(path, password)?;

        println!("Project: {}", project.project_name);

        for device in &project.devices {
            if device.individual_address == "1.1.4" {
                println!(
                    "\n[DEBUG] Device 1.1.4: {} (Product: {:?})",
                    device.name, device.product
                );
                for link in &device.group_links {
                    println!("  - Object: Label=\"{}\"", link.object_name);
                    println!("    Number: {:?}", link.number);
                    println!("    Description: {:?}", link.description);
                    println!("    Channel: {:?}", link.channel);
                    println!("    DPT: {:?}", link.datapoint_type);
                    println!("    GA: {}", link.group_address);
                    if let Some(flags) = &link.flags {
                        println!("    Flags: {:?}", flags);
                    }
                }
            }

            if device.individual_address.contains("-") {
                println!(
                    "Parked device: {} ({})",
                    device.individual_address, device.name
                );
            }

            if !device.configuration.is_empty() {
                println!("    [Configuration]");
                for (key, value) in &device.configuration {
                    println!("      {}: {}", key, value);
                }
            }
        }

        Ok(())
    }
}
