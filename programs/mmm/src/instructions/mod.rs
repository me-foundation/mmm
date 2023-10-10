#![allow(missing_docs)]
#![allow(ambiguous_glob_reexports)]

pub mod admin;
pub mod mip1;
pub mod ocp;
pub mod vanilla;

pub use admin::*;
pub use mip1::*;
pub use ocp::*;
pub use vanilla::*;

use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::{
    constants::*,
    errors::MMMErrorCode,
    state::{Allowlist, Pool},
    util::*,
};
