pub mod graph;
pub mod knx;

pub use graph::{
    generate_group_address_graph, generate_topology_graph, Edge, EdgeKind, GraphModel, Node,
    NodeKind,
};
pub use knx::{
    load_knxproj,
    load_knxproj_bytes,
    load_knxproj_bytes_with_language,
    load_knxproj_with_language,
    InvalidPasswordError,
    KnxProjectData,
    PasswordRequiredError,
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectGraphs {
    pub project_name: String,
    pub topology_graph: GraphModel,
    pub group_address_graph: GraphModel,
    pub devices: Vec<knx::DeviceInfo>,
    pub group_addresses: Vec<knx::GroupAddressInfo>,
    pub locations: Vec<knx::BuildingSpace>,
}

pub fn build_project_graphs(project: &KnxProjectData) -> ProjectGraphs {
    ProjectGraphs {
        project_name: project.project_name.clone(),
        topology_graph: generate_topology_graph(project),
        group_address_graph: generate_group_address_graph(project),
        devices: project.devices.clone(),
        group_addresses: project.group_addresses.clone(),
        locations: project.locations.clone(),
    }
}
