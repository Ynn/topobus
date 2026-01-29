use super::model::*;
use crate::knx::parsers::device::extract_devices;
use crate::knx::parsers::group_addresses::extract_group_addresses;
use crate::knx::parsers::project::extract_project_name;
use crate::knx::parsers::topology::extract_topology_metadata;
use crate::knx::xml_tags;
use crate::knx::xml_utils::attr_value;
use crate::knx::zip_utils::{read_zip_entry, strip_bom};
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
    load_knxproj_reader(file, password, None)
}

pub fn load_knxproj_bytes(data: &[u8], password: Option<&str>) -> Result<KnxProjectData> {
    log::info!("Loading KNX project from bytes ({} bytes)", data.len());
    let cursor = Cursor::new(data);
    load_knxproj_reader(cursor, password, None)
}

pub fn load_knxproj_with_language(
    path: &str,
    password: Option<&str>,
    preferred_language: Option<&str>,
) -> Result<KnxProjectData> {
    log::info!("Loading KNX project from: {}", path);
    let file = File::open(path).context("Failed to open .knxproj file")?;
    load_knxproj_reader(file, password, preferred_language)
}

pub fn load_knxproj_bytes_with_language(
    data: &[u8],
    password: Option<&str>,
    preferred_language: Option<&str>,
) -> Result<KnxProjectData> {
    log::info!("Loading KNX project from bytes ({} bytes)", data.len());
    let cursor = Cursor::new(data);
    load_knxproj_reader(cursor, password, preferred_language)
}

fn load_knxproj_reader<R: Read + Seek>(
    reader: R,
    password: Option<&str>,
    preferred_language: Option<&str>,
) -> Result<KnxProjectData> {
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
    let (areas, lines) = extract_topology_metadata(&data_doc)?;
    let (mut group_addresses, group_address_by_id) = extract_group_addresses(&data_doc)?;

    let devices = extract_devices(
        &data_doc,
        &mut zip,
        &group_address_by_id,
        &manufacturer_names,
        preferred_language,
    )?;

    let mut inferred_dpts: HashMap<String, String> = HashMap::new();
    for device in &devices {
        for link in &device.group_links {
            if let Some(dpt) = &link.datapoint_type {
                inferred_dpts
                    .entry(link.group_address.clone())
                    .or_insert_with(|| dpt.clone());
            }
        }
    }
    for ga in &mut group_addresses {
        if ga.datapoint_type.is_none() {
            if let Some(dpt) = inferred_dpts.get(&ga.address) {
                ga.datapoint_type = Some(dpt.clone());
            }
        }
    }
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
        .filter(|n| n.tag_name().name() == xml_tags::MANUFACTURER)
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
            xml_tags::PROJECT_INFORMATION => has_project_info = true,
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

fn extract_locations(
    doc: &Document,
    device_index: &HashMap<String, (String, String)>,
) -> Vec<BuildingSpace> {
    let mut roots = Vec::new();
    for locations in doc
        .descendants()
        .filter(|n| n.tag_name().name() == xml_tags::LOCATIONS)
    {
        for space in locations
            .children()
            .filter(|n| n.is_element() && n.tag_name().name() == xml_tags::SPACE)
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
        .filter(|n| n.is_element() && n.tag_name().name() == xml_tags::DEVICE_INSTANCE_REF)
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
        .filter(|n| n.is_element() && n.tag_name().name() == xml_tags::SPACE)
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
