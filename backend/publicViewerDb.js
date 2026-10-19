const {Pool}=require('pg');
const {performance}=require('node:perf_hooks');
const {currentTrace}=require('./publicViewerTiming');
require('dotenv').config();
const pool=new Pool({
 host:process.env.PUBLIC_VIEWER_DB_HOST||process.env.DB_HOST,
 port:Number(process.env.PUBLIC_VIEWER_DB_PORT||process.env.DB_PORT),
 database:process.env.PUBLIC_VIEWER_DB_NAME||process.env.DB_NAME,
 user:process.env.PUBLIC_VIEWER_DB_USER||process.env.DB_USER,
 password:process.env.PUBLIC_VIEWER_DB_PASSWORD||process.env.DB_PASSWORD,
 ssl:(process.env.PUBLIC_VIEWER_DB_SSL||process.env.DB_SSL)==='true'?{rejectUnauthorized:false}:false,
 max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:30000
});
// One constant, unparameterised setup command instead of six network round trips.
// The actual data query always runs afterwards, under the restricted read-only role.
const SETUP="BEGIN READ ONLY; SET LOCAL statement_timeout='8s'; SET LOCAL lock_timeout='2s'; SET LOCAL max_parallel_workers_per_gather=0; SET LOCAL jit=off; SET LOCAL ROLE viewer_public_reader; SELECT pg_catalog.set_config(name,CASE WHEN setting::integer BETWEEN 1 AND 250 THEN setting ELSE '250' END,true) FROM pg_catalog.pg_settings WHERE name='client_connection_check_interval' AND context='user' AND pg_catalog.version() ~* '(linux|darwin|bsd|illumos)'";
const aborted=()=>Object.assign(new Error('Public request cancelled'),{code:'PUBLIC_ABORTED'});
function createPublicQuery(dbPool){
 let pending=0;
 return async function query(sql,values=[],options={}){
  const trace=currentTrace(),signal=Object.hasOwn(options,'signal')?options.signal:trace?.signal;
  if(signal?.aborted)throw aborted();
  if(pending>=12)throw Object.assign(new Error('Public query queue full'),{code:'PUBLIC_BUSY'});
  pending++;
  const timing={stage:options.stage||'query',queue_ms:0,setup_ms:0,sql_ms:0};
  const started=performance.now();let client,released=false,discard,listener,sqlStarted,setupSent=false;
  const release=bad=>{if(client&&!released){released=true;client.release(bad);}};
  try{
   client=await dbPool.connect();timing.queue_ms=performance.now()-started;
   if(signal?.aborted)throw aborted();
   listener=()=>release(true);signal?.addEventListener('abort',listener,{once:true});
   const setup=performance.now();setupSent=true;await client.query(SETUP);timing.setup_ms=performance.now()-setup;
   if(signal?.aborted)throw aborted();
   sqlStarted=performance.now();const result=await client.query(sql,values);timing.sql_ms=performance.now()-sqlStarted;sqlStarted=undefined;
   if(signal?.aborted)throw aborted();
   await client.query('COMMIT');return result;
  }catch(error){
   if(!client)timing.queue_ms=performance.now()-started;
   if(sqlStarted!==undefined)timing.sql_ms=performance.now()-sqlStarted;
   if(client&&!released&&setupSent){try{await client.query('ROLLBACK');}catch(rollbackError){discard=rollbackError;}}
   if(signal?.aborted)throw aborted();throw error;
  }finally{
   if(listener)signal?.removeEventListener('abort',listener);release(discard);pending--;
   trace?.queries.push(timing);options.onTiming?.(timing);
  }
 };
}
module.exports={query:createPublicQuery(pool),createPublicQuery,SETUP};
