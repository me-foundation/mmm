import { BN } from '@coral-xyz/anchor';

export interface GetFulfillBuyPricesParams {
  totalPriceLamports: number;
  lpFeeBp: number;
  metadataRoyaltyBp: number;
  buysideCreatorRoyaltyBp: number;
  takerFeeBp: number;
  makerFeeBp: number;
}

export const getSolFulfillBuyPrices = (args: GetFulfillBuyPricesParams) => {
  const {
    totalPriceLamports,
    lpFeeBp,
    metadataRoyaltyBp,
    buysideCreatorRoyaltyBp,
    takerFeeBp,
    makerFeeBp,
  } = args;
  const bpValue = new BN(10000);
  const feeDivisor = bpValue
    .mul(bpValue)
    .add(new BN(lpFeeBp).mul(bpValue))
    .add(new BN(metadataRoyaltyBp).mul(new BN(buysideCreatorRoyaltyBp)));
  const sellerReceives = new BN(totalPriceLamports)
    .mul(bpValue.mul(bpValue))
    .div(feeDivisor);

  const lpFeePaid = sellerReceives.muln(lpFeeBp).divn(10000);
  const royaltyPaid = sellerReceives
    .muln(metadataRoyaltyBp)
    .divn(10000)
    .muln(buysideCreatorRoyaltyBp)
    .divn(10000);
  const takerFeePaid = sellerReceives.muln(takerFeeBp).divn(10000);
  const makerFeePaid = sellerReceives.muln(makerFeeBp).divn(10000);
  const effectiveSellerReceives = new BN(totalPriceLamports)
    .sub(lpFeePaid)
    .sub(royaltyPaid)
    .sub(takerFeePaid);
  return {
    sellerReceives: effectiveSellerReceives,
    lpFeePaid,
    royaltyPaid,
    takerFeePaid,
    makerFeePaid,
  };
};
