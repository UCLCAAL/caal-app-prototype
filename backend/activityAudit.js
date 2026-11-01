const {getDefaultIpLocation}=require('./ipLocation');
const {createAuditIdentity,canonicalIp,proxyIp}=require('./auditIdentity');
const {isPublicIp}=require('./ipLocation');
function classify(value){const ip=canonicalIp(value);return !ip?'invalid':proxyIp(ip)?'cloudflare':isPublicIp(ip)?'public':'private';}
function createActivityAudit(pool,{flushMs=1000,maxQueue=1000,batchSize=100,logger=console,
 ipLocation=getDefaultIpLocation(),secret=process.env.AUDIT_ID_SECRET,identityFactory=createAuditIdentity}={}){
 const identify=identityFactory({secret,ipLocation});
 let queue=[],flushing=false,pending=0,dropped=0,failed=0,diagnostics=0;
 const jobs=new Set();
 function enqueue(req,event){
  if(queue.length+pending>=maxQueue){dropped++;return false;}
  pending++;
  // Capture request identity before session teardown; raw IP exists only during the in-memory lookup.
  const captured={ip:req.ip,socket:{remoteAddress:req.socket?.remoteAddress},
   session:{appSession:{user:{...req.session?.appSession?.user}}},get:()=>req.get?.('user-agent')};
  const job=Promise.resolve().then(()=>identify(captured)).then(identity=>queue.push({...event,...identity}))
   .catch(error=>{failed++;logger.error('Audit identity failed',{code:error.code||'IDENTITY_ERROR'});})
   .finally(()=>{pending--;jobs.delete(job);});jobs.add(job);return true;
 }
 async function flush(){
  if(flushing)return;flushing=true;
  try{const batch=queue.splice(0,Math.min(100,batchSize));if(batch.length)
   await pool.query('SELECT app_audit.record_private_events($1::jsonb)',[JSON.stringify(batch)]);
  }catch(error){failed++;logger.error('Private activity audit batch failed',{code:error.code});}
  finally{flushing=false;}
 }
 const timer=setInterval(()=>void flush(),flushMs);timer.unref?.();
 function middleware(req,res,next){
  if(process.env.AUDIT_PROXY_DIAGNOSTIC==='true'&&diagnostics<5){
   diagnostics++;logger.info('Audit proxy diagnostic',{express_ip_kind:classify(req.ip),
    socket_kind:classify(req.socket?.remoteAddress),
    forwarded_chain_left_to_right:String(req.get?.('x-forwarded-for')||'').split(',').filter(Boolean).slice(0,10).map(x=>classify(x.trim())),
    cf_connecting_ip_present:Boolean(req.get?.('cf-connecting-ip'))});
  }
  req.recordPublicSearch=event=>enqueue(req,{search_text:event.search_text,filters:event.filters,
   trigger:event.trigger,language:event.language,event_kind:'public_search',occurred_at:new Date().toISOString()});
  const path=String(req.originalUrl||req.url||'').split('?')[0];
  const page=['/','/index.html','/home.html','/monuments.html','/archive.html','/viewer.html',
   '/public-viewer.html','/about.html','/feedback.html'].includes(path);
  const api=path.startsWith('/api/')&&!['/api/health','/api/test'].includes(path);
  if(page||api){const start=process.hrtime.bigint();res.once('finish',()=>enqueue(req,{
   occurred_at:new Date().toISOString(),event_kind:page?'page_request':'api_request',
   http_method:String(req.method||'GET').slice(0,10),path:path.slice(0,512),status_code:res.statusCode,
   duration_ms:Math.max(0,Math.round(Number(process.hrtime.bigint()-start)/1e6))}));}
  next();
 }
 async function successfulLogin(req,session){
  const copy={ip:req.ip,socket:req.socket,get: name=>req.get?.(name),session:{appSession:session}};
  enqueue(copy,{event_kind:'login',occurred_at:new Date().toISOString()});
 }
 return {middleware,successfulLogin,flush,stats:()=>({queued:queue.length,pending,dropped,failed}),
  close:async()=>{clearInterval(timer);await Promise.all([...jobs]);while(flushing)await new Promise(r=>setTimeout(r,10));
   while(queue.length)await flush();}};
}
module.exports={createActivityAudit};
