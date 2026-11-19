/** All values are integer cents; thresholds and shocks are basis points. */
export type Asset = { symbol: string; value: bigint; threshold: bigint; collateral: boolean; debt: bigint };
export const BPS = 10000n;
export function parseMoney(input: string): bigint | null {
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{0,2})?$/.test(input)) return null;
  const [whole, fraction = ''] = input.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function metrics(assets: Asset[], shocks: Record<string, bigint> = {}, repay = 0n, add = 0n, addSymbol = '') {
  if (repay < 0n || add < 0n) throw new Error('Amounts must be non-negative');
  let collateral = 0n, adjusted = 0n, debt = 0n, supplied = 0n;
  for (const a of assets) {
    const shock = shocks[a.symbol] ?? 0n;
    if (shock < -BPS || shock > 0n || a.threshold < 0n || a.threshold > BPS || a.value < 0n || a.debt < 0n) throw new Error('Invalid asset or shock');
    const extra = a.symbol === addSymbol && a.collateral ? add : 0n;
    const value = (a.value + extra) * (BPS + shock) / BPS;
    supplied += value;
    if (a.collateral) { collateral += value; adjusted += value * a.threshold / BPS; }
    debt += a.debt * (BPS + shock) / BPS;
  }
  debt = repay >= debt ? 0n : debt - repay;
  return { supplied, collateral, adjusted, debt, health: debt === 0n ? null : adjusted * BPS / debt, weightedThreshold: collateral === 0n ? 0n : adjusted * BPS / collateral };
}
export function risk(h: bigint | null) { return h === null ? 'No debt' : h < 10000n ? 'Liquidatable' : h < 12000n ? 'Critical' : h < 15000n ? 'At risk' : 'Healthy'; }
