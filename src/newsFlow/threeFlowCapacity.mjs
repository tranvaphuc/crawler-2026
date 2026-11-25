export function newsThreeFlowCapacity(env={}){
 const n1=Number(env.NEWS_N1||64),n2=Number(env.NEWS_N2||32);
 if(!Number.isInteger(n1)||!Number.isInteger(n2)||n1<1||n2<1||n1>256||n2>256)throw Error('NEWS_INVALID_WORKER_CAPACITY');
 const parserWorkers=Number(env.NEWS_PARSER_CPU_WORKERS||Math.min(12,Math.ceil(n2/8)));
 if(!Number.isInteger(parserWorkers)||parserWorkers<1||parserWorkers>32||parserWorkers>n2)throw Error('NEWS_INVALID_PARSER_CAPACITY');
 return {n1,n2,seedNetworkWorkers:Math.ceil(n1/16),articleNetworkWorkers:Math.ceil(n2/16),seedHtmlWorkers:Math.min(4,Math.ceil(n1/16)),articleHtmlWorkers:Math.min(6,Math.ceil(n2/16)),parserWorkers};
}
