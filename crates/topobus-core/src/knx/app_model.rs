use std::collections::HashMap;

use crate::knx::model::ObjectFlags;

#[derive(Clone, Default)]
pub(crate) struct Flags {
    communication: Option<bool>,
    read: Option<bool>,
    write: Option<bool>,
    transmit: Option<bool>,
    update: Option<bool>,
    read_on_init: Option<bool>,
}

impl Flags {
    pub(crate) fn from_node(node: &roxmltree::Node) -> Self {
        Self {
            communication: parse_flag(node.attribute("CommunicationFlag")),
            read: parse_flag(node.attribute("ReadFlag")),
            write: parse_flag(node.attribute("WriteFlag")),
            transmit: parse_flag(node.attribute("TransmitFlag")),
            update: parse_flag(node.attribute("UpdateFlag")),
            read_on_init: parse_flag(node.attribute("ReadOnInitFlag")),
        }
    }

    pub(crate) fn with_fallback(self, fallback: Flags) -> Flags {
        Flags {
            communication: self.communication.or(fallback.communication),
            read: self.read.or(fallback.read),
            write: self.write.or(fallback.write),
            transmit: self.transmit.or(fallback.transmit),
            update: self.update.or(fallback.update),
            read_on_init: self.read_on_init.or(fallback.read_on_init),
        }
    }

    pub(crate) fn to_model_flags(&self) -> ObjectFlags {
        ObjectFlags {
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

pub(crate) struct AppProgram {
    pub(crate) prefix: String,
    pub(crate) name: Option<String>,
    pub(crate) version: Option<String>,
    pub(crate) number: Option<String>,
    pub(crate) program_type: Option<String>,
    pub(crate) mask_version: Option<String>,
    pub(crate) arguments: HashMap<String, String>,
    pub(crate) com_object_refs: HashMap<String, ComObjectRefDef>,
    pub(crate) com_objects: HashMap<String, ComObjectDef>,
    pub(crate) parameters: HashMap<String, ParameterDef>,
    pub(crate) parameter_types: HashMap<String, ParameterTypeDef>,
    pub(crate) parameter_refs: HashMap<String, ParameterRefDef>,
    pub(crate) parameter_ref_context: HashMap<String, String>,
    pub(crate) allocators: HashMap<String, AllocatorDef>,
    pub(crate) module_def_arguments: HashMap<String, ModuleArgumentInfo>,
    pub(crate) numeric_args: HashMap<String, NumericArgDef>,
}

#[derive(Clone)]
pub(crate) struct ComObjectRefDef {
    pub(crate) ref_id: Option<String>,
    pub(crate) name: Option<String>,
    pub(crate) text: Option<String>,
    pub(crate) function_text: Option<String>,
    pub(crate) datapoint_type: Option<String>,
    pub(crate) object_size: Option<String>,
    pub(crate) flags: Flags,
    pub(crate) channel: Option<String>,
    pub(crate) number: Option<u32>,
    pub(crate) description: Option<String>,
}

#[derive(Clone)]
pub(crate) struct ComObjectDef {
    pub(crate) flags: Flags,
    pub(crate) datapoint_type: Option<String>,
    pub(crate) number: Option<u32>,
    pub(crate) object_size: Option<String>,
    pub(crate) base_number_argument_ref: Option<String>,
    pub(crate) description: Option<String>,
    pub(crate) name: Option<String>,
    pub(crate) text: Option<String>,
    pub(crate) function_text: Option<String>,
}

#[derive(Clone)]
pub(crate) struct AllocatorDef {
    pub(crate) start: u32,
    #[allow(dead_code)]
    pub(crate) end: Option<u32>,
}

#[derive(Clone, Default)]
pub(crate) struct ModuleArgumentInfo {
    #[allow(dead_code)]
    pub(crate) name: Option<String>,
    pub(crate) allocates: Option<u32>,
}

#[derive(Clone)]
pub(crate) struct NumericArgDef {
    pub(crate) allocator_ref_id: Option<String>,
    pub(crate) base_value: Option<String>,
    pub(crate) value: Option<u32>,
}

#[derive(Clone)]
pub(crate) struct ParameterDef {
    pub(crate) name: Option<String>,
    pub(crate) text: Option<String>,
    pub(crate) parameter_type_ref: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub(crate) enum ParameterTypeKind {
    Enum,
    Number,
    #[default]
    Unknown,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct ParameterTypeDef {
    pub(crate) name: Option<String>,
    pub(crate) kind: ParameterTypeKind,
    pub(crate) enum_values: HashMap<String, String>,
    pub(crate) min: Option<i64>,
    pub(crate) max: Option<i64>,
    pub(crate) size_bits: Option<u32>,
    pub(crate) base: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct ParameterRefDef {
    pub(crate) parameter_id: String,
    pub(crate) name: Option<String>,
    pub(crate) text: Option<String>,
    #[allow(dead_code)]
    pub(crate) value: Option<String>,
    #[allow(dead_code)]
    pub(crate) tag: Option<String>,
    #[allow(dead_code)]
    pub(crate) display_order: Option<u32>,
}
