use anyhow::Result;
use roxmltree::Document;
use std::collections::HashMap;

use crate::knx::address::GroupAddress;
use crate::knx::model::GroupAddressInfo;
use crate::knx::xml_tags;
use crate::knx::xml_utils::{attr_value, find_elements_by_tag, required_attribute, ParseError, short_id};

pub fn extract_group_addresses(
    doc: &Document,
) -> Result<(Vec<GroupAddressInfo>, HashMap<String, GroupAddressInfo>)> {
    let mut group_addresses = Vec::new();
    let mut by_id = HashMap::new();

    for group in find_elements_by_tag(doc, xml_tags::GROUP_ADDRESS) {
        let mut ranges: Vec<_> = group
            .ancestors()
            .filter(|n| n.tag_name().name() == xml_tags::GROUP_RANGE)
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

        let id = match required_attribute(&group, "Id") {
            Ok(value) => value,
            Err(error) => {
                log::warn!("Skipping GroupAddress without Id: {}", error);
                continue;
            }
        };
        let short = short_id(&id);
        let address_raw = match required_attribute(&group, "Address") {
            Ok(value) => value,
            Err(error) => {
                log::warn!("Skipping GroupAddress without Address: {}", error);
                continue;
            }
        };
        let address_value = match address_raw.parse::<u16>() {
            Ok(value) => value,
            Err(_) => {
                let error = ParseError::InvalidAttribute {
                    element: xml_tags::GROUP_ADDRESS.to_string(),
                    attribute: "Address".to_string(),
                    value: address_raw,
                    expected: "u16".to_string(),
                    context: format!("line {}", group.range().start),
                };
                log::warn!("Skipping GroupAddress with invalid Address: {}", error);
                continue;
            }
        };
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

        by_id.insert(short, info.clone());
        group_addresses.push(info);
    }

    Ok((group_addresses, by_id))
}

#[cfg(test)]
mod tests {
    use super::extract_group_addresses;

    #[test]
    fn skips_malformed_group_addresses() -> anyhow::Result<()> {
        let xml = r#"
        <KNX>
          <GroupAddresses>
            <GroupAddress Id="GA-1" Address="1" Name="Valid" />
            <GroupAddress Id="GA-2" Address="bad" Name="Invalid" />
            <GroupAddress Id="GA-3" Address="70000" Name="TooLarge" />
          </GroupAddresses>
        </KNX>
        "#;
        let doc = roxmltree::Document::parse(xml)?;
        let (groups, by_id) = extract_group_addresses(&doc)?;
        assert_eq!(groups.len(), 1);
        assert_eq!(by_id.len(), 1);
        assert_eq!(groups[0].name, "Valid");
        Ok(())
    }
}
