use anchor_lang::prelude::{AccountInfo, Pubkey};
use solana_program::pubkey;

use crate::state::Pool;

const PAYMENT_PROXY_PROGRAM_ID: Pubkey = pubkey!("mpxdRTRiAzvxz8dgW6LQYzDATtKQBx2f1VJ6qsU28hn");
const PAYMENT_PROXY_DISCRIMINATOR: [u8; 8] = [0xee, 0x4a, 0x13, 0x79, 0x5e, 0x99, 0xac, 0x48];
const PAYMENT_PROXY_MIN_LEN: usize = 512;

pub fn verify_referral(pool: &Pool, referral: &AccountInfo<'_>) -> bool {
    // Check if the referral account is the one defined in the pool
    if referral.key == &pool.referral {
        // early return true since the referral is the one expected
        return true;
    }

    // From now on we assume that the referral account is a payment proxy account with the referral
    // as the authority.

    // Check if the account is owned by expected program and that it has expected data length
    if referral.owner != &PAYMENT_PROXY_PROGRAM_ID || referral.data_len() < PAYMENT_PROXY_MIN_LEN {
        return false;
    }

    let data = referral.try_borrow_data().unwrap();
    // Check if proxy account has correct discriminator
    if data[0..8] != PAYMENT_PROXY_DISCRIMINATOR {
        return false;
    }
    // Check if proxy account has correct authority
    if &data[8..40] != pool.referral.as_ref() {
        return false;
    }
    true
}
