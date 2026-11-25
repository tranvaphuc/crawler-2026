// V8 heap flags belong to the parent process; worker heaps use resourceLimits.
export function workerExecArgv(args=process.execArgv){const out=[];for(let i=0;i<args.length;i++){const a=args[i];if(/^--(?:max[-_]old[-_]space[-_]size|max[-_]semi[-_]space[-_]size|input-type)(?:=|$)/.test(a)){if(!a.includes('='))i++;continue;}out.push(a);}return out;}
