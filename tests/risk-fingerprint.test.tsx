import React from 'react';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { calculateProtocolAccount, type ProtocolAsset } from '../lib/protocol-math';
import { createRiskFingerprint, TYDRO_STABLES } from '../lib/risk-fingerprint';
import { simulateLive } from '../lib/live-simulation';
import type { LiveSnapshot } from '../lib/live-api';
import { LiveSnapshotView } from '../app/live-position';

const other='0x0000000000000000000000000000000000000001';
const disabled='0x0000000000000000000000000000000000000002';
const reserve=(overrides:Partial<LiveSnapshot['positions'][number]>={}):LiveSnapshot['positions'][number]=>({id:10,address:TYDRO_STABLES[0].address,symbol:'not-USDe',decimals:2,price:'100000001',supply:'10001',variableDebt:'3001',stableDebt:'0',collateral:true,borrowed:true,liquidationThreshold:'0',...overrides});
function snapshot(positions:LiveSnapshot['positions'],emode=5,bitmap='1024'):LiveSnapshot {
 const assets:ProtocolAsset[]=positions.map(p=>({...p,price:BigInt(p.price),supply:BigInt(p.supply),variableDebt:BigInt(p.variableDebt),stableDebt:BigInt(p.stableDebt),liquidationThreshold:BigInt(p.liquidationThreshold)}));
 const m=calculateProtocolAccount(assets,{id:emode,collateralBitmap:BigInt(bitmap),liquidationThreshold:9200n});
 return {mode:'live',wallet:other,blockNumber:'123',blockHash:'0x123',blockTimestamp:1000,emode,collateralBitmap:bitmap,emodeLiquidationThreshold:'9200',baseUnit:'100000000',oracleFreshness:'unknown',protocol:{collateral:String(m.collateral),debt:String(m.debt),liquidationThreshold:String(m.liquidationThreshold),healthFactor:String(m.healthFactor)},positions};
}
test('address identity, concentration, debt rounding, E-mode and unknown disabled reserve',()=>{
 const s=snapshot([reserve(),reserve({id:2,address:TYDRO_STABLES[1].address,symbol:'wrong',supply:'5000',variableDebt:'2001',liquidationThreshold:'7800'}),reserve({id:3,address:other,symbol:'USDe',supply:'2000',variableDebt:'0',borrowed:false,liquidationThreshold:'7000'}),reserve({id:4,address:disabled,symbol:'OFF',supply:'9999',variableDebt:'0',borrowed:false,collateral:false})]);
 const f=createRiskFingerprint(s);assert.deepEqual(f.assets.map(a=>a.identity),['USDe','USD₮0',null,null]);
 assert.equal(f.assets[0].collateralValue,10001000100n);assert.equal(f.assets[0].debtValue,3001000031n);
 assert.equal(f.assets[0].collateralShareBps,5882n);assert.equal(f.assets[3].collateralValue,0n);assert.equal(f.assets[3].collateralShareBps,null);
 assert.equal(f.assets[0].emodeEligible,true);assert.equal(f.assets[0].effectiveThreshold,9200n);assert.equal(f.assets[1].emodeEligible,false);assert.equal(f.assets[1].effectiveThreshold,7800n);
 assert.equal(f.debt,5002000052n);
});
test('scenario reprices collateral and debt together using simulator and exact oracle rounding',()=>{
 const s=snapshot([reserve(),reserve({id:2,address:TYDRO_STABLES[1].address,supply:'0',variableDebt:'1000',collateral:false,liquidationThreshold:'7800'})]);
 const scenario=createRiskFingerprint(s).scenarios[0];assert.equal(scenario.status,'available');
 if(scenario.status==='available') {assert.equal(scenario.observedPrice,100000001n);assert.equal(scenario.hypotheticalPrice,95000000n);assert.equal(scenario.healthFactor,simulateLive(s,{[s.positions[0].address]:{shock:'-5',repay:'0',add:'0'}}).simulated.healthFactor);}
 const both=simulateLive(s,{[s.positions[0].address]:{shock:'-5',repay:'0',add:'0'}});assert.ok(both.simulated.collateral<both.baseline.collateral);assert.ok(both.simulated.debt<both.baseline.debt);
 const debtScenario=createRiskFingerprint(s).scenarios[2];assert.equal(debtScenario.status,'available');if(debtScenario.status==='available') assert.equal(debtScenario.healthFactor,simulateLive(s,{[s.positions[1].address]:{shock:'-5',repay:'0',add:'0'}}).simulated.healthFactor);
});
test('E-mode off uses reserve threshold even when the bitmap contains the reserve',()=>{
 const f=createRiskFingerprint(snapshot([reserve({liquidationThreshold:'8000'})],0));assert.equal(f.assets[0].emodeEligible,false);assert.equal(f.assets[0].effectiveThreshold,8000n);
});
test('small positive concentration does not display as zero percent',()=>{
 const s=snapshot([reserve({supply:'100000000',variableDebt:'0',borrowed:false}),reserve({id:3,address:other,symbol:'TINY',supply:'1',variableDebt:'0',borrowed:false,liquidationThreshold:'7000'})]);
 assert.equal(createRiskFingerprint(s).assets[1].collateralShareBps,0n);
 assert.match(renderToStaticMarkup(<LiveSnapshotView snapshot={s} now={1001}/>),/&lt;0\.01% of enabled collateral/);
});
test('empty, absent, disabled-only and no debt show unavailable or empty values',()=>{
 const empty=createRiskFingerprint(snapshot([]));assert.equal(empty.assets.length,0);assert.ok(empty.scenarios.every(s=>s.status==='unavailable'));
 const off=snapshot([reserve({collateral:false,borrowed:false,variableDebt:'0'})]);const f=createRiskFingerprint(off);assert.equal(f.assets[0].collateralShareBps,null);assert.ok(f.scenarios.every(s=>s.status==='unavailable'));
 const html=renderToStaticMarkup(<LiveSnapshotView snapshot={off} now={1001}/>);assert.match(html,/No enabled collateral/);assert.match(html,/No variable debt/);assert.match(html,/Excluded from concentration/);assert.match(html,/Unavailable:/);
});
test('unreconciled or unsupported snapshots fail closed',()=>{
 const s=snapshot([reserve()]);
 assert.throws(()=>createRiskFingerprint({...s,protocol:{...s.protocol,debt:'1'}}),/does not match/);
 assert.throws(()=>createRiskFingerprint({...s,positions:[{...s.positions[0],stableDebt:'1'}]}),/Unsupported debt/);
 assert.throws(()=>createRiskFingerprint({...s,positions:[s.positions[0],s.positions[0]]}),/identity/);
 assert.throws(()=>createRiskFingerprint({...s,collateralBitmap:'-1'}),/configuration/);
 const html=renderToStaticMarkup(<LiveSnapshotView snapshot={{...s,protocol:{...s.protocol,debt:'1'}}} now={1001}/>);assert.match(html,/Fingerprint unavailable/);
});
test('UI identifies observed and hypothetical values and hides fingerprint when stale',()=>{
 const s=snapshot([reserve(),reserve({id:2,address:TYDRO_STABLES[1].address,symbol:'x',supply:'0',variableDebt:'1000',collateral:false,liquidationThreshold:'7800'})]);
 const html=renderToStaticMarkup(<LiveSnapshotView snapshot={s} now={1001}/>);
 for(const text of ['Tydro Risk Fingerprint','OBSERVED · BLOCK 123','Observed oracle:','Hypothetical oracle:','Hypothetical health factor:','market depeg does not automatically','Oracle feed freshness is unknown','E-mode eligible']) assert.ok(html.includes(text),text);
 const stale=renderToStaticMarkup(<LiveSnapshotView snapshot={s} now={1121}/>);assert.doesNotMatch(stale,/Tydro Risk Fingerprint|Hypothetical oracle/);
});
