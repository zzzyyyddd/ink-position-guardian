'use client';
import React, { createContext, useContext, useMemo, useState } from 'react';
import type { LiveSnapshot } from '../lib/live-api';
import { createRiskActionPlan, parseTarget } from '../lib/risk-action-plan';

function usePlan(snapshot:LiveSnapshot) {
 const [choice,setChoice]=useState('1.20'), [custom,setCustom]=useState('');
 const target=parseTarget(choice==='custom'?custom:choice);
 const state=useMemo(()=>{
  if(target===null) return {plan:null,error:'Enter a target above 0 and at most 1000, with up to 18 decimal places.'};
  try{return {plan:createRiskActionPlan(snapshot,target),error:''};}catch{return {plan:null,error:'Unable to verify this snapshot or calculate an action plan. Refresh and try again.'};}
 },[snapshot,target]);
 return {choice,setChoice,custom,setCustom,target,...state};
}
const Context=createContext<ReturnType<typeof usePlan>|null>(null);
export function PlanProvider({snapshot,children}:{snapshot:LiveSnapshot;children:React.ReactNode}) {
 const value=usePlan(snapshot);return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSharedPlan() {const value=useContext(Context);if(!value)throw Error('Missing plan provider');return value;}
