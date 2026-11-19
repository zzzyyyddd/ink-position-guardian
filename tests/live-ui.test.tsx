import React from 'react';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveSnapshotView } from '../app/live-position';
import { lookupPosition, toLiveSnapshot, type LiveSnapshot, type PositionResult } from '../lib/live-api';
const address='0x0000000000000000000000000000000000000001';
const fixture:LiveSnapshot={mode:'live',wallet:address,blockNumber:'123',blockHash:'0x123',blockTimestamp:1000,emode:5,collateralBitmap:'1',emodeLiquidationThreshold:'9200',baseUnit:'100000000',oracleFreshness:'unknown',protocol:{collateral:'100000000',debt:'50000000',liquidationThreshold:'9200',healthFactor:'1840000000000000000'},positions:[{id:0,borrowed:true,liquidationThreshold:'8000',address,symbol:'TEST',decimals:6,supply:'1000000',variableDebt:'500000',stableDebt:'0',collateral:true,price:'100000000'}]};
test('live view is separate from synthetic controls and reports unknown feed freshness',()=>{const html=renderToStaticMarkup(<LiveSnapshotView snapshot={fixture} now={1001}/>);assert.match(html,/data-mode="live"/);assert.match(html,/Protocol health factor/);assert.match(html,/E-mode category 5/);assert.match(html,/Oracle feed freshness: unknown/);assert.doesNotMatch(html,/synthetic demo mode only[\s\S]*simulated health factor/i);assert.match(html,/Simulate this snapshot/);assert.match(html,/SIMULATED HEALTH FACTOR/);assert.doesNotMatch(html,/SYNTHETIC EXAMPLE/)});
test('live account values use the oracle base unit and truncate to cents',()=>{
 const snapshot={...fixture,protocol:{...fixture.protocol,collateral:'6690279291869647',debt:'6018466356640547'}};
 const html=renderToStaticMarkup(<LiveSnapshotView snapshot={snapshot} now={1001}/>);
 assert.match(html,/\$66,902,792\.91/);assert.match(html,/\$60,184,663\.56/);
 const other=renderToStaticMarkup(<LiveSnapshotView snapshot={{...snapshot,baseUnit:'1000',protocol:{...snapshot.protocol,collateral:'12345',debt:'1'}}} now={1001}/>);
 assert.match(other,/\$12\.34/);assert.match(other,/&lt;\$0\.01/);
 const large=renderToStaticMarkup(<LiveSnapshotView snapshot={{...snapshot,protocol:{...snapshot.protocol,collateral:'900719925474099312345678'}}} now={1001}/>);
 assert.match(large,/\$9,007,199,254,740,993\.12/);
});
test('live asset balances use each reserve’s token decimals',()=>{
 const snapshot={...fixture,positions:[{...fixture.positions[0],symbol:'SIX',supply:'1234567',variableDebt:'200000',stableDebt:'300000'}, {...fixture.positions[0],address:'0x0000000000000000000000000000000000000002',symbol:'EIGHTEEN',decimals:18,supply:'1234567890000000000',variableDebt:'100000000000000000',stableDebt:'0'}]};
 const html=renderToStaticMarkup(<LiveSnapshotView snapshot={snapshot} now={1001}/>);
 assert.match(html,/SIX[\s\S]*?Supplied<\/span><strong>1\.234567<\/strong>[\s\S]*?Debt<\/span><strong>0\.5<\/strong>/);
 assert.match(html,/EIGHTEEN[\s\S]*?Supplied<\/span><strong>1\.234567<\/strong>[\s\S]*?Debt<\/span><strong>0\.1<\/strong>/);
});
test('stale or future live snapshot hides balances',()=>{for(const now of [1121,999]){const html=renderToStaticMarkup(<LiveSnapshotView snapshot={fixture} now={now}/>);assert.match(html,/Position data is stale/);assert.doesNotMatch(html,/TEST|1\.84|1,000/);}});
test('lookup rejects invalid inputs and masks RPC errors without data',async()=>{let called=false;const read=async()=>{called=true;throw Error('secret-rpc-url')};const bad=await lookupPosition('not-an-address',read);assert.equal(bad.status,400);assert.equal(called,false);const failed=await lookupPosition(address,read);assert.equal(failed.status,503);assert.equal('positions' in failed.body,false);assert.doesNotMatch(JSON.stringify(failed.body),/secret-rpc-url/)});
test('serialized live result only contains active reserves and is explicitly live',()=>{const account={collateral:0n,debt:0n,liquidationThreshold:0n,healthFactor:(1n<<256n)-1n};const raw:PositionResult={wallet:address,blockNumber:123n,blockHash:'0x123',blockTimestamp:1000n,baseCurrency:'0x0000000000000000000000000000000000000000',emode:0,baseUnit:100000000n,collateralBitmap:0n,emodeLiquidationThreshold:0n,protocol:account,computed:account,oracleFreshness:'unknown',positions:[{id:0,address,symbol:'EMPTY',decimals:6,supply:0n,variableDebt:0n,stableDebt:0n,collateral:false,borrowed:false,liquidationThreshold:0n,price:0n}]};const result=toLiveSnapshot(raw);assert.equal(result.mode,'live');assert.deepEqual(result.positions,[]);assert.equal(result.oracleFreshness,'unknown');});

test('zero-input E-mode scenario displays the Pool baseline at identical precision and zero delta',()=>{
 const s:LiveSnapshot={...fixture,protocol:{collateral:'102257400',debt:'92000000',liquidationThreshold:'9200',healthFactor:'1022574000000000000'},positions:[{...fixture.positions[0],supply:'1022574',variableDebt:'920000'}]};
 const html=renderToStaticMarkup(<LiveSnapshotView snapshot={s} now={1001}/>);
 assert.match(html,/Protocol health factor<\/div><strong>1\.022574<\/strong>/);
 assert.match(html,/SIMULATED HEALTH FACTOR<\/span><strong>1\.022574<\/strong>/);
 assert.match(html,/Baseline Pool health factor: 1\.022574/);
 assert.match(html,/delta from baseline: 0\.000000/);
 assert.match(html,/Simulated interpretation: Critical/);
 assert.match(html,/not official Tydro classifications or guarantees/);
});
