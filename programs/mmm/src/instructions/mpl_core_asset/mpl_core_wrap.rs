use anchor_lang::{accounts::unchecked_account::UncheckedAccount, error::Error};
use mpl_core::{
    types::{Plugin, PluginType, Royalties},
    ID,
};
use mpl_token_metadata::types::Creator;
use solana_program::pubkey::Pubkey;
use std::ops::Deref;

use crate::errors::MMMErrorCode;

pub const CORE_ALLOW_LIST: [PluginType; 4] = [
    PluginType::Royalties,
    PluginType::Attributes,
    PluginType::Edition,
    PluginType::MasterEdition,
];

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

pub fn deserialize_collection_asset(
    collection_account: &UncheckedAccount,
) -> Result<Option<IndexableAsset>, Error> {
    if collection_account.key == &Pubkey::default() {
        return Ok(None);
    }
    let data = &collection_account.try_borrow_data()?;
    if let Ok(collection_asset) =
        mpl_core::IndexableAsset::fetch(mpl_core::types::Key::CollectionV1, data)
            .map(IndexableAsset)
    {
        return Ok(Some(collection_asset));
    }
    Err(MMMErrorCode::InvalidAssetCollection.into())
}

pub fn get_creators_from_royalties(royalties: &Royalties) -> Vec<Creator> {
    royalties
        .creators
        .iter()
        .map(|creator| Creator {
            address: creator.address,
            verified: true,
            share: creator.percentage,
        })
        .collect()
}

pub fn get_royalties_from_plugin(
    asset: &IndexableAsset,
    collection: Option<&IndexableAsset>,
) -> Option<Royalties> {
    let asset_royalty_plugin = asset.plugins.get(&PluginType::Royalties);
    let collection_royalty_plugin = if let Some(collection_asset) = collection {
        collection_asset
            .plugins
            .get(&PluginType::Royalties)
            .cloned()
    } else {
        None
    };

    if let Some(plugin) = asset_royalty_plugin {
        if let Plugin::Royalties(royalties) = &plugin.data {
            return Some(royalties.clone());
        }
    } else if let Some(plugin) = collection_royalty_plugin {
        if let Plugin::Royalties(royalties) = &plugin.data {
            return Some(royalties.clone());
        }
    }
    None
}

pub fn assert_valid_core_plugins(asset: &IndexableAsset) -> Result<(), Error> {
    for plugin in asset.plugins.keys() {
        if !CORE_ALLOW_LIST.contains(plugin) {
            return Err(MMMErrorCode::UnsupportedAssetPlugin.into());
        }
    }
    Ok(())
}
