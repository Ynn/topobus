use serde::{Deserialize, Serialize};

/// Data extracted from a KNX project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnxProjectData {
    pub project_name: String,
    pub areas: Vec<AreaInfo>,
    pub lines: Vec<LineInfo>,
    pub devices: Vec<DeviceInfo>,
    pub group_addresses: Vec<GroupAddressInfo>,
    pub locations: Vec<BuildingSpace>,
}

/// Information about a KNX area
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AreaInfo {
    /// Area address number as string
    pub address: String,
    /// Area name (if available)
    pub name: Option<String>,
    /// Area description (if available)
    pub description: Option<String>,
    /// Area comment (if available)
    pub comment: Option<String>,
    /// Area completion status (if available)
    pub completion_status: Option<String>,
}

/// Information about a KNX line
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LineInfo {
    /// Area address number as string
    pub area: String,
    /// Line address number as string
    pub line: String,
    /// Line name (if available)
    pub name: Option<String>,
    /// Line description (if available)
    pub description: Option<String>,
    /// Line comment (if available)
    pub comment: Option<String>,
    /// Line medium type (TP/IP/RF/etc.) if available
    pub medium_type: Option<String>,
    /// Line completion status (if available)
    pub completion_status: Option<String>,
}

/// Information about a KNX device
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceInfo {
    /// Unique identifier for the device instance in the KNX project
    pub instance_id: String,
    /// Individual address in format "A.L.D" (Area.Line.Device)
    pub individual_address: String,
    /// Device name
    pub name: String,
    /// Manufacturer name (if available)
    pub manufacturer: Option<String>,
    /// Product name (if available)
    pub product: Option<String>,
    /// Product reference/order number (if available)
    pub product_reference: Option<String>,
    /// Device description (if available)
    pub description: Option<String>,
    /// Device comment (if available)
    pub comment: Option<String>,
    /// Device serial number (if available)
    pub serial_number: Option<String>,
    /// Application program name (if available)
    pub app_program_name: Option<String>,
    /// Application program version (if available)
    pub app_program_version: Option<String>,
    /// Application program number (if available)
    pub app_program_number: Option<String>,
    /// Application program type (if available)
    pub app_program_type: Option<String>,
    /// Application program mask version (if available)
    pub app_mask_version: Option<String>,
    /// Device medium type (TP/IP/RF/etc.) if available
    pub medium_type: Option<String>,
    /// Segment identifier (if available)
    pub segment_id: Option<String>,
    /// Segment number (if available)
    pub segment_number: Option<String>,
    /// Segment domain address (if available)
    pub segment_domain_address: Option<String>,
    /// Segment medium type (TP/IP/RF/etc.) if available
    pub segment_medium_type: Option<String>,
    /// IP assignment mode (Auto/Fixed) for KNX/IP devices
    pub ip_assignment: Option<String>,
    /// IPv4 address (if available)
    pub ip_address: Option<String>,
    /// IPv4 subnet mask (if available)
    pub ip_subnet_mask: Option<String>,
    /// IPv4 default gateway (if available)
    pub ip_default_gateway: Option<String>,
    /// MAC address (if available)
    pub mac_address: Option<String>,
    /// Last modification timestamp (if available)
    pub last_modified: Option<String>,
    /// Last download timestamp (if available)
    pub last_download: Option<String>,
    /// Links to group addresses
    pub group_links: Vec<GroupLink>,
    /// Device configuration parameters
    pub configuration: std::collections::HashMap<String, String>,
    /// Device configuration entries with optional reference metadata
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub configuration_entries: Vec<DeviceConfigEntry>,
}

/// Link between a device communication object and a group address
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupLink {
    /// Communication object name
    pub object_name: String,
    /// Raw ComObject Name (if available)
    pub object_name_raw: Option<String>,
    /// ComObject Text (if available)
    pub object_text: Option<String>,
    /// ComObject FunctionText (if available)
    pub object_function_text: Option<String>,
    /// Group address in format "M/S/A" or "M/A"
    pub group_address: String,
    /// Whether this object transmits on this group address
    pub is_transmitter: bool,
    /// Whether this object receives from this group address
    /// Whether this object receives from this group address
    pub is_receiver: bool,
    /// Channel name (if available)
    pub channel: Option<String>,
    /// Datapoint type (e.g., "DPST-1-1")
    pub datapoint_type: Option<String>,
    /// Communication object number (e.g., 114)
    pub number: Option<u32>,
    /// Communication object description
    pub description: Option<String>,
    /// Communication object size (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub object_size: Option<String>,
    /// Communication object security (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub security: Option<String>,
    /// Building function (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub building_function: Option<String>,
    /// Building part (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub building_part: Option<String>,
    /// Communication object flags
    pub flags: Option<ObjectFlags>,
}

/// Communication object flags
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectFlags {
    /// Communication flag (C) - connection to bus
    pub communication: bool,
    /// Read flag (R) - respond to read requests
    pub read: bool,
    /// Write flag (W) - accept write requests
    pub write: bool,
    /// Transmit flag (T) - send value on change
    pub transmit: bool,
    /// Update flag (U) - update value from bus
    pub update: bool,
    /// Read On Init flag (I) - read value on bus reset
    pub read_on_init: bool,
}

/// Configuration parameter entry for a device
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceConfigEntry {
    /// Display name for the parameter
    pub name: String,
    /// Raw value
    pub value: String,
    /// Optional raw value before formatting
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_raw: Option<String>,
    /// Optional human-readable label for the value
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value_label: Option<String>,
    /// Optional parameter type label
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parameter_type: Option<String>,
    /// Optional context path (channel/block/module)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    /// Optional reference id or code
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ref_id: Option<String>,
    /// Optional source label (Parameter/Property/etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

/// Information about a KNX group address
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupAddressInfo {
    /// Group address in format "M/S/A"
    pub address: String,
    /// User-defined name
    pub name: String,
    /// Main group name (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub main_group_name: Option<String>,
    /// Main group description (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub main_group_description: Option<String>,
    /// Main group comment (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub main_group_comment: Option<String>,
    /// Middle group name (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub middle_group_name: Option<String>,
    /// Middle group description (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub middle_group_description: Option<String>,
    /// Middle group comment (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub middle_group_comment: Option<String>,
    /// Group address description (if available)
    pub description: Option<String>,
    /// Group address comment (if available)
    pub comment: Option<String>,
    /// Datapoint type (e.g., "DPST-1-1" for switching)
    pub datapoint_type: Option<String>,
    /// List of device individual addresses linked to this group address
    pub linked_devices: Vec<String>,
}

/// A device reference inside a building space
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildingDeviceRef {
    /// DeviceInstance Id reference
    pub instance_id: String,
    /// Individual address (if resolved)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    /// Device name (if resolved)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Building structure node (location space)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuildingSpace {
    /// Unique identifier of the space in the KNX project
    pub id: String,
    /// Space name (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Space type (Building, Floor, Room, etc.)
    pub space_type: String,
    /// Space number (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub number: Option<String>,
    /// Default line reference (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_line: Option<String>,
    /// Description (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Completion status (if available)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completion_status: Option<String>,
    /// Devices directly assigned to this space
    pub devices: Vec<BuildingDeviceRef>,
    /// Child spaces
    pub children: Vec<BuildingSpace>,
}
