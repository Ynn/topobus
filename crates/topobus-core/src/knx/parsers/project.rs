use roxmltree::Document;

use crate::knx::model::{ProjectAttachment, ProjectHistoryEntry, ProjectInfo, ProjectTag};
use crate::knx::xml_tags;
use crate::knx::xml_utils::{attr_value, find_child_element};

pub fn extract_project_name(doc: &Document) -> String {
    doc.descendants()
        .find(|node| node.tag_name().name() == xml_tags::PROJECT_INFORMATION)
        .and_then(|node| node.attribute("Name"))
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("TopoBus Project")
        .to_string()
}

pub fn extract_project_info(doc: &Document) -> Option<ProjectInfo> {
    let mut info = ProjectInfo::default();
    let mut has_any = false;

    if let Some(node) = doc
        .descendants()
        .find(|node| node.tag_name().name() == xml_tags::PROJECT_INFORMATION)
    {
        info.name = attr_value(&node, "Name");
        info.project_type = attr_value(&node, "ProjectType");
        info.project_number = attr_value(&node, "ProjectNumber");
        info.contract_number = attr_value(&node, "ContractNumber");
        info.description = attr_value(&node, "Comment");
        info.completion_status = attr_value(&node, "CompletionStatus");
        info.archived_version = attr_value(&node, "ArchivedVersion");
        info.project_tracing_password = attr_value(&node, "ProjectTracingPassword");
        info.security_mode = attr_value(&node, "Security");
        info.codepage = attr_value(&node, "CodePage").or_else(|| attr_value(&node, "Codepage"));
        info.last_modified = attr_value(&node, "LastModified");
        info.project_size = attr_value(&node, "ProjectSize");
        info.group_address_style = attr_value(&node, "GroupAddressStyle");

        if info.name.is_some()
            || info.project_type.is_some()
            || info.project_number.is_some()
            || info.contract_number.is_some()
            || info.description.is_some()
            || info.completion_status.is_some()
            || info.archived_version.is_some()
            || info.project_tracing_password.is_some()
            || info.security_mode.is_some()
            || info.codepage.is_some()
            || info.last_modified.is_some()
            || info.project_size.is_some()
            || info.group_address_style.is_some()
        {
            has_any = true;
        }

        if let Some(tags_node) = find_child_element(&node, xml_tags::TAGS) {
            for tag in tags_node
                .children()
                .filter(|child| child.is_element() && child.tag_name().name() == xml_tags::TAG)
            {
                if let Some(text) = attr_value(&tag, "Text") {
                    let color = attr_value(&tag, "Color");
                    info.tags.push(ProjectTag { text, color });
                }
            }
        }

        if !info.tags.is_empty() {
            has_any = true;
        }

        for entry in node
            .descendants()
            .filter(|child| child.is_element() && child.tag_name().name() == xml_tags::HISTORY_ENTRY)
        {
            let date = attr_value(&entry, "Date");
            let user = attr_value(&entry, "User");
            let text = attr_value(&entry, "Text");
            let detail = attr_value(&entry, "Detail");
            if date.is_some() || user.is_some() || text.is_some() || detail.is_some() {
                info.history.push(ProjectHistoryEntry {
                    date,
                    user,
                    text,
                    detail,
                });
            }
        }

        if !info.history.is_empty() {
            has_any = true;
        }
    }

    if info.group_address_style.is_none() {
        if let Some(project_node) = doc.descendants().find(|node| node.tag_name().name() == "Project") {
            info.group_address_style = attr_value(&project_node, "GroupAddressStyle");
            if info.group_address_style.is_some() {
                has_any = true;
            }
        }
    }

    if let Some(installation) = doc
        .descendants()
        .find(|node| node.tag_name().name() == xml_tags::INSTALLATION)
    {
        info.bcu_key = attr_value(&installation, "BCUKey");
        if info.bcu_key.is_some() {
            has_any = true;
        }
    }

    for file in doc
        .descendants()
        .filter(|node| node.tag_name().name() == xml_tags::USER_FILE)
    {
        if let Some(filename) = attr_value(&file, "Filename") {
            let comment = attr_value(&file, "Comment");
            info.attachments.push(ProjectAttachment { filename, comment });
        }
    }

    if !info.attachments.is_empty() {
        has_any = true;
    }

    if has_any { Some(info) } else { None }
}
