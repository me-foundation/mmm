#![allow(missing_docs)]

pub mod admin;
pub mod ext_vanilla;
pub mod mip1;
pub mod mpl_core_asset;
pub mod ocp;
pub mod vanilla;
pub mod cnft;

pub use admin::*;
pub use ext_vanilla::*;
pub use mip1::*;
pub use mpl_core_asset::*;
pub use ocp::*;
pub use vanilla::*;
pub use cnft::*;

use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{
    constants::*,
    errors::MMMErrorCode,
    state::{Allowlist, Pool},
    util::*,
};
