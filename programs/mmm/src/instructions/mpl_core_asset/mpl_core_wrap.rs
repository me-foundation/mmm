use mpl_core::ID;
use solana_program::pubkey::Pubkey;
use std::ops::Deref;

#[derive(Clone)]
pub struct AssetInterface;

impl anchor_lang::Ids for AssetInterface {
    fn ids() -> &'static [Pubkey] {
        &[ID]
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IndexableAsset(mpl_core::IndexableAsset);

impl anchor_lang::AccountDeserialize for IndexableAsset {
    fn try_deserialize_unchecked(buf: &mut &[u8]) -> anchor_lang::Result<Self> {
        mpl_core::IndexableAsset::fetch(mpl_core::types::Key::AssetV1, buf)
            .map(IndexableAsset)
            .map_err(Into::into)
    }
}

impl anchor_lang::AccountSerialize for IndexableAsset {}

impl anchor_lang::Owner for IndexableAsset {
    fn owner() -> Pubkey {
        ID
    }
}

impl Deref for IndexableAsset {
    type Target = mpl_core::IndexableAsset;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
