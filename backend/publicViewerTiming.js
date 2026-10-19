'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {performance}=require('node:perf_hooks');
const storage=new AsyncLocalStorage();
function publicViewerTiming(req,res,next){
 const controller=new AbortController(),trace={signal:controller.signal,queries:[],started:performance.now()};
 const abort=()=>{if(!res.writableEnded)controller.abort();};req.once('aborted',abort);res.once('close',abort);
 const original=res.json;
 res.json=function(body){
  const sum=key=>trace.queries.reduce((n,t)=>n+t[key],0);
  const total=performance.now()-trace.started;
  if(!res.headersSent)res.set('Server-Timing',`total;dur=${total.toFixed(1)},db_queue;dur=${sum('queue_ms').toFixed(1)},db_setup;dur=${sum('setup_ms').toFixed(1)},db_sql;dur=${sum('sql_ms').toFixed(1)},db_queries;desc="${trace.queries.length}"`);
  if(total>=1500)console.info('Public Viewer slow request',{method:req.method,route:req.route?.path||req.path,status:res.statusCode,total_ms:Math.round(total),queue_ms:Math.round(sum('queue_ms')),setup_ms:Math.round(sum('setup_ms')),sql_ms:Math.round(sum('sql_ms')),queries:trace.queries.length,stages:trace.queries.map(t=>({stage:t.stage,sql_ms:Math.round(t.sql_ms),queue_ms:Math.round(t.queue_ms)}))});
  return original.call(this,body);
 };
 storage.run(trace,next);
}
module.exports={publicViewerTiming,currentTrace:()=>storage.getStore()};
