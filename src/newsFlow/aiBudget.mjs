// ai_usage remains the only usage ledger. Task metadata stores an authorization
// ceiling and a baseline; every background/manual reservation shares this tx.
export function reserveNewsAiReview(state,{maxCalls,budgetUSD,taskBudgetId=null,now=Date.now(),reservationUSD=.05}){
 if(!Number.isSafeInteger(maxCalls)||maxCalls<1||!Number.isFinite(budgetUSD)||budgetUSD<=0||reservationUSD!==.05)throw Error('NEWS_AI_BUDGET_INVALID');
 return state.tx(()=>{
  const day=new Date(now).toISOString().slice(0,10),db=state.db;
  db.prepare('INSERT OR IGNORE INTO ai_usage(day) VALUES(?)').run(day);
  const usage=db.prepare('SELECT * FROM ai_usage WHERE day=?').get(day);
  if(usage.calls>=maxCalls)return null;
  if(taskBudgetId){
   const raw=db.prepare('SELECT value FROM flow_meta WHERE key=?').get('ai_task_budget:'+taskBudgetId);
   if(!raw)throw Error('NEWS_AI_TASK_BUDGET_NOT_AUTHORIZED');
   const task=JSON.parse(raw.value);
   if(task.policy!=='authorized_task_api_budget_v1'||task.closed||!Number.isFinite(task.limitUSD)||task.limitUSD<=0||!Number.isFinite(task.baselineUsageUSD)||!Number.isSafeInteger(task.maxDailyCalls)||usage.calls>=task.maxDailyCalls)return null;
   const total=db.prepare('SELECT coalesce(sum(usd),0) usd FROM ai_usage').get().usd,spent=total-task.baselineUsageUSD;
   if(spent<-.000000001)throw Error('NEWS_AI_TASK_USAGE_REGRESSED');
   if(Math.max(0,spent)+reservationUSD>task.limitUSD+.000000001)return null;
  }
  if(usage.usd+reservationUSD>budgetUSD+.000000001)return null;
  db.prepare('UPDATE ai_usage SET calls=calls+1,usd=usd+? WHERE day=?').run(reservationUSD,day);
  return day;
 });
}
