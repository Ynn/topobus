use std::fmt;

#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum GroupAddressStyle {
    ThreeLevel, // Main/Middle/Sub (5/3/8)
    TwoLevel,   // Main/Sub (5/11)
    Free,       // 16-bit identifier
}

#[allow(dead_code)]
pub fn parse_group_address_style(value: &str) -> GroupAddressStyle {
    let raw = value.trim().to_lowercase();
    if raw.contains("two") || raw.contains("2") {
        return GroupAddressStyle::TwoLevel;
    }
    if raw.contains("free") || raw.contains("16") {
        return GroupAddressStyle::Free;
    }
    GroupAddressStyle::ThreeLevel
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct GroupAddress {
    pub value: u16,
    pub style: GroupAddressStyle,
}

impl GroupAddress {
    /// Creates a new GroupAddress with the default 3-level style.
    pub fn new(value: u16) -> Self {
        Self {
            value,
            style: GroupAddressStyle::ThreeLevel,
        }
    }

    /// Creates a new GroupAddress with a specific style.
    #[allow(dead_code)]
    pub fn with_style(value: u16, style: GroupAddressStyle) -> Self {
        Self { value, style }
    }

    /// Returns the raw 16-bit value.
    #[allow(dead_code)]
    pub fn as_u16(&self) -> u16 {
        self.value
    }
}

impl fmt::Display for GroupAddress {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.style {
            GroupAddressStyle::ThreeLevel => {
                // 5 bits / 3 bits / 8 bits
                let main = (self.value >> 11) & 0x1F;
                let middle = (self.value >> 8) & 0x07;
                let sub = self.value & 0xFF;
                write!(f, "{}/{}/{}", main, middle, sub)
            }
            GroupAddressStyle::TwoLevel => {
                // 5 bits / 11 bits
                let main = (self.value >> 11) & 0x1F;
                let sub = self.value & 0x07FF;
                write!(f, "{}/{}", main, sub)
            }
            GroupAddressStyle::Free => {
                // Decimal value
                write!(f, "{}", self.value)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_three_level() {
        // 1/1/1 = (1<<11) | (1<<8) | 1 = 2048 + 256 + 1 = 2305
        let addr = GroupAddress::new(2305);
        assert_eq!(addr.to_string(), "1/1/1");

        // 0/0/0
        let addr = GroupAddress::new(0);
        assert_eq!(addr.to_string(), "0/0/0");

        // Max: 31/7/255 = 0xFFFF = 65535
        let addr = GroupAddress::new(65535);
        assert_eq!(addr.to_string(), "31/7/255");
    }

    #[test]
    fn test_two_level() {
        // 1/1 = (1<<11) | 1 = 2049
        let addr = GroupAddress::with_style(2049, GroupAddressStyle::TwoLevel);
        assert_eq!(addr.to_string(), "1/1");

        // 31/2047 = 0xFFFF
        let addr = GroupAddress::with_style(65535, GroupAddressStyle::TwoLevel);
        assert_eq!(addr.to_string(), "31/2047");
    }

    #[test]
    fn test_free() {
        let addr = GroupAddress::with_style(12345, GroupAddressStyle::Free);
        assert_eq!(addr.to_string(), "12345");
    }
}
