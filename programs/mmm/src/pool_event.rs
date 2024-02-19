use anchor_lang::prelude::*;

/// Event for logging pool event in various handlers.
#[event]
pub struct PoolEvent {
    pub prefix: String,
    pub pool_state: Vec<u8>,
}
