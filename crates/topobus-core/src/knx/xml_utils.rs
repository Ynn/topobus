use roxmltree::{Document, Node};
use std::fmt;

#[derive(Debug)]
pub enum ParseError {
    MissingRequiredAttribute {
        element: String,
        attribute: String,
        context: String,
    },
    InvalidAttribute {
        element: String,
        attribute: String,
        value: String,
        expected: String,
        context: String,
    },
    MissingAncestor {
        element: String,
        ancestor: String,
        context: String,
    },
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ParseError::MissingRequiredAttribute { element, attribute, context } => {
                write!(f, "Missing required attribute '{}' on {} ({})", attribute, element, context)
            }
            ParseError::InvalidAttribute { element, attribute, value, expected, context } => {
                write!(f, "Invalid attribute '{}' on {}: '{}' (expected {}) ({})", attribute, element, value, expected, context)
            }
            ParseError::MissingAncestor { element, ancestor, context } => {
                write!(f, "Missing ancestor '{}' for {} ({})", ancestor, element, context)
            }
        }
    }
}

impl std::error::Error for ParseError {}

pub fn attr_value(node: &Node<'_, '_>, name: &str) -> Option<String> {
    node.attribute(name)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
}

pub fn required_attribute(node: &Node<'_, '_>, name: &str) -> Result<String, ParseError> {
    let value = node.attribute(name).map(str::trim).unwrap_or("");
    if value.is_empty() {
        return Err(ParseError::MissingRequiredAttribute {
            element: node.tag_name().name().to_string(),
            attribute: name.to_string(),
            context: format!("line {}", node.range().start),
        });
    }
    Ok(value.to_string())
}

pub fn required_ancestor_address(node: &Node<'_, '_>, ancestor_tag: &str) -> Result<String, ParseError> {
    let ancestor = node
        .ancestors()
        .find(|item| item.tag_name().name() == ancestor_tag);
    let address = ancestor.and_then(|item| item.attribute("Address"));
    match address {
        Some(value) if !value.trim().is_empty() => Ok(value.trim().to_string()),
        _ => Err(ParseError::MissingAncestor {
            element: node.tag_name().name().to_string(),
            ancestor: ancestor_tag.to_string(),
            context: format!("line {}", node.range().start),
        }),
    }
}

pub fn find_ancestor_address(node: &Node<'_, '_>, tag: &str) -> Option<String> {
    node.ancestors()
        .find(|ancestor| ancestor.tag_name().name() == tag)
        .and_then(|ancestor| ancestor.attribute("Address"))
        .map(|value| value.to_string())
}

pub fn short_id(full_id: &str) -> String {
    full_id.rsplit('_').next().unwrap_or(full_id).to_string()
}

pub fn medium_name(medium_ref: &str) -> String {
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

pub fn format_individual_address(
    area: Option<&str>,
    line: Option<&str>,
    device: Option<&str>,
    instance_id: &str,
) -> String {
    let device_trim = device.map(str::trim).filter(|value| !value.is_empty());
    if let Some(value) = device_trim {
        if value.contains('.') {
            return value.to_string();
        }
    }

    let area_trim = area.map(str::trim).filter(|value| !value.is_empty());
    let line_trim = line.map(str::trim).filter(|value| !value.is_empty());

    match (area_trim, line_trim, device_trim) {
        (Some(a), Some(l), Some(d)) => format!("{}.{}.{}", a, l, d),
        (Some(a), Some(l), None) => format!("{}.{}.- ({})", a, l, short_id(instance_id)),
        (Some(a), None, Some(d)) => format!("{}.-.{}", a, d),
        (None, Some(l), Some(d)) => format!("-.{}.{}", l, d),
        (Some(a), None, None) => format!("{}.-.- ({})", a, short_id(instance_id)),
        (None, Some(l), None) => format!("-.{}.- ({})", l, short_id(instance_id)),
        (None, None, Some(d)) => d.to_string(),
        (None, None, None) => short_id(instance_id),
    }
}

#[cfg(test)]
mod tests {
    use super::format_individual_address;

    #[test]
    fn format_individual_address_with_full_parts() {
        let value = format_individual_address(Some("1"), Some("1"), Some("5"), "DI-1");
        assert_eq!(value, "1.1.5");
    }

    #[test]
    fn format_individual_address_with_parked_device() {
        let value = format_individual_address(Some("1"), Some("1"), Some("-"), "DI-269");
        assert_eq!(value, "1.1.-");
    }

    #[test]
    fn format_individual_address_with_missing_device() {
        let value = format_individual_address(Some("1"), Some("1"), None, "DI-269");
        assert_eq!(value, "1.1.- (DI-269)");
    }

    #[test]
    fn format_individual_address_with_full_value() {
        let value = format_individual_address(None, None, Some("2.3.-"), "DI-2");
        assert_eq!(value, "2.3.-");
    }

    #[test]
    fn format_individual_address_with_missing_area() {
        let value = format_individual_address(None, Some("1"), Some("2"), "DI-3");
        assert_eq!(value, "-.1.2");
    }

    #[test]
    fn format_individual_address_with_missing_line() {
        let value = format_individual_address(Some("1"), None, Some("2"), "DI-4");
        assert_eq!(value, "1.-.2");
    }
}

pub fn find_elements_by_tag<'a>(doc: &'a Document, tag: &str) -> impl Iterator<Item = Node<'a, 'a>> {
    let tag_name = tag.to_string();
    doc.descendants()
        .filter(move |node| node.tag_name().name() == tag_name.as_str())
}

pub fn find_child_element<'a>(node: &Node<'a, 'a>, tag: &str) -> Option<Node<'a, 'a>> {
    node.children()
        .find(|child| child.is_element() && child.tag_name().name() == tag)
}
