pub mod graph;
pub mod knx;

pub use graph::{
    generate_group_address_graph, generate_topology_graph, Edge, EdgeKind, GraphModel, Node,
    NodeKind,
};
pub use knx::{
    load_knxproj, load_knxproj_bytes, InvalidPasswordError, KnxProjectData, PasswordRequiredError,
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectGraphs {
    pub project_name: String,
    pub topology_graph: GraphModel,
    pub group_address_graph: GraphModel,
}

pub fn build_project_graphs(project: &KnxProjectData) -> ProjectGraphs {
    ProjectGraphs {
        project_name: project.project_name.clone(),
        topology_graph: generate_topology_graph(project),
        group_address_graph: generate_group_address_graph(project),
    }
}
