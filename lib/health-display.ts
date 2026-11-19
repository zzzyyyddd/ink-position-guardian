import { MAX_UINT256 } from './protocol-math';

const WAD = 10n ** 18n;
const DISPLAY_UNIT = 10n ** 12n;

/** Truncate to six decimal places without converting the protocol value to a float. */
export function formatHealthFactor(value: bigint): string {
 if (value === MAX_UINT256) return '∞';
 const truncated = value / DISPLAY_UNIT;
 return `${truncated / 1000000n}.${String(truncated % 1000000n).padStart(6, '0')}`;
}

export function formatHealthDelta(baseline: bigint, simulated: bigint): string {
 if (baseline === MAX_UINT256 && simulated === MAX_UINT256) return 'No change (no debt)';
 if (baseline === MAX_UINT256 || simulated === MAX_UINT256) return 'Not finite (no debt in one scenario)';
 const delta = simulated - baseline;
 if (delta === 0n) return '0.000000';
 const magnitude = delta < 0n ? -delta : delta;
 const sign = delta < 0n ? '−' : '+';
 if (magnitude < DISPLAY_UNIT) return `${sign}less than 0.000001`;
 return `${sign}${formatHealthFactor(magnitude)}`;
}

export function healthRiskBand(value: bigint): string {
 if (value === MAX_UINT256) return 'No debt';
 if (value < WAD) return 'Liquidation threshold crossed';
 if (value <= 105n * WAD / 100n) return 'Critical';
 if (value <= 120n * WAD / 100n) return 'Elevated risk';
 return 'Lower immediate liquidation risk';
}
