import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatHealthDelta, formatHealthFactor, healthRiskBand } from '../lib/health-display';
import { MAX_UINT256 } from '../lib/protocol-math';

const WAD=10n**18n;
test('health factor display truncates consistently, without floating point rounding',()=>{
 assert.equal(formatHealthFactor(1022574999999999999n),'1.022574');
 assert.equal(formatHealthFactor(1022574000000000000n),'1.022574');
 assert.equal(formatHealthFactor(MAX_UINT256),'∞');
});
test('delta uses full precision, preserves direction and handles no debt',()=>{
 assert.equal(formatHealthDelta(WAD,WAD),'0.000000');
 assert.equal(formatHealthDelta(WAD,WAD+1234567890123n),'+0.000001');
 assert.equal(formatHealthDelta(WAD,WAD-1234567890123n),'−0.000001');
 assert.equal(formatHealthDelta(WAD,WAD+1n),'+less than 0.000001');
 assert.equal(formatHealthDelta(MAX_UINT256,MAX_UINT256),'No change (no debt)');
 assert.equal(formatHealthDelta(WAD,MAX_UINT256),'Not finite (no debt in one scenario)');
});
test('product-defined bands use exact values at every boundary',()=>{
 for(const [value,label] of [[WAD-1n,'Liquidation threshold crossed'],[WAD,'Critical'],[105n*WAD/100n,'Critical'],[105n*WAD/100n+1n,'Elevated risk'],[12n*WAD/10n,'Elevated risk'],[12n*WAD/10n+1n,'Lower immediate liquidation risk'],[MAX_UINT256,'No debt']] as const) assert.equal(healthRiskBand(value),label);
});
