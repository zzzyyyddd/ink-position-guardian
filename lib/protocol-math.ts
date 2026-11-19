/** Arithmetic from the explorer-verified Tydro L2Pool implementation's GenericLogic. */
export type ProtocolAsset = { id: number; decimals: number; price: bigint; supply: bigint; variableDebt: bigint; stableDebt: bigint; collateral: boolean; borrowed: boolean; liquidationThreshold: bigint };
export type EMode = { id: number; collateralBitmap: bigint; liquidationThreshold: bigint };
const WAD = 10n ** 18n;
export const MAX_UINT256 = (1n << 256n) - 1n;
export function calculateProtocolAccount(assets: ProtocolAsset[], emode: EMode) {
 let collateral = 0n, debt = 0n, weighted = 0n;
 for (const a of assets) {
  if (a.id < 0 || a.id > 127 || !Number.isInteger(a.id) || a.decimals < 0 || a.decimals > 36 || !Number.isInteger(a.decimals) || a.price < 0n || a.supply < 0n || a.variableDebt < 0n || a.stableDebt !== 0n || a.liquidationThreshold < 0n || a.liquidationThreshold > 10000n) throw Error('Unsupported reserve data');
  if ((a.collateral || a.borrowed) && a.price === 0n) throw Error('Missing price for active reserve');
  const scale = 10n ** BigInt(a.decimals);
  if (a.collateral) {
   const value = a.supply * a.price / scale;
   const eligible = emode.id !== 0 && (emode.collateralBitmap & (1n << BigInt(a.id))) !== 0n;
   const threshold = eligible ? emode.liquidationThreshold : a.liquidationThreshold;
   if (threshold < 0n || threshold > 10000n) throw Error('Invalid e-mode threshold');
   collateral += value; weighted += value * threshold;
  }
  if (a.borrowed && a.variableDebt > 0n) debt += (a.variableDebt * a.price + scale - 1n) / scale;
 }
 return { collateral, debt, liquidationThreshold: collateral === 0n ? 0n : weighted / collateral, healthFactor: debt === 0n ? MAX_UINT256 : ((weighted * WAD + debt / 2n) / debt) / 10000n };
}
