'use strict';
const crypto=require('node:crypto');
const TYPES=Object.freeze({general:'General',data_correction:'Data correction',supporting_information:'Supporting information',data_request:'Data request',technical_issue:'Technical issue',other:'Other'});
const PREFIX='[CAAL Web Viewer Feedback] ';
function validate(body){
 const text=(key,max,required=false)=>{const value=body?.[key];if(typeof value!=='string'||value.length>max||(required&&!value.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))throw Error('invalid_feedback');return value.trim();};
 const id=text('submission_id',36,true),type=text('feedback_type',40,true),name=text('name',150,true),email=text('email',254,true),caalId=text('caal_id',150),message=text('message',10000,true);
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||!Object.hasOwn(TYPES,type)||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||/[\r\n]/.test(name+email+caalId)||message.length<10)throw Error('invalid_feedback');
 return {submission_id:id,feedback_type:type,name,email,caal_id:caalId,message,subject:PREFIX+TYPES[type].toLowerCase()};
}
function relayConfig(env){
 if(!env.FEEDBACK_RELAY_URL||!env.FEEDBACK_RELAY_SECRET)return null;
 const url=new URL(env.FEEDBACK_RELAY_URL);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Feedback relay requires a plain HTTPS endpoint URL');
 if(!/^[a-f0-9]{64}$/i.test(env.FEEDBACK_RELAY_SECRET))throw Error('FEEDBACK_RELAY_SECRET requires 32 random bytes encoded as 64 hex characters');
 return {url:url.href,secret:env.FEEDBACK_RELAY_SECRET};
}
function createPublicFeedbackRouter(pool,{express=require('express'),env=process.env,fetchImpl=globalThis.fetch,logger=console,now=()=>Date.now()}={}){
 const router=express.Router(),config=relayConfig(env),buckets=new Map(),rateKey=crypto.randomBytes(32);
 let total={start:now(),count:0};
 router.post('/',async(req,res)=>{
  res.set('Cache-Control','no-store');
  if(req.get('origin')){try{if(new URL(req.get('origin')).host!==req.get('host'))return res.status(403).json({ok:false,error:'origin_not_allowed'});}catch{return res.status(403).json({ok:false,error:'origin_not_allowed'});}}
  const time=now();if(time-total.start>3600000)total={start:time,count:0};
  const key=crypto.createHmac('sha256',rateKey).update(String(req.ip||req.socket?.remoteAddress||'unknown')).digest('hex');
  let bucket=buckets.get(key);if(!bucket||time-bucket.start>3600000){bucket={start:time,count:0};buckets.set(key,bucket);}
  if(buckets.size>10000){for(const [k,b] of buckets)if(time-b.start>3600000)buckets.delete(k);if(buckets.size>10000)buckets.delete(buckets.keys().next().value);}
  if(++bucket.count>10||++total.count>200)return res.status(429).json({ok:false,error:'too_many_submissions'});
  if(typeof req.body?.website==='string'&&req.body.website)return res.status(200).json({ok:true,saved:true});
  let event;try{event=validate(req.body);}catch{return res.status(400).json({ok:false,error:'invalid_feedback'});}
  try{
   // Commit storage before attempting email. No raw IP, user-agent or inventory mutation.
   await pool.query('SELECT app_audit.save_public_feedback($1::uuid,$2,$3,$4,$5,$6)',[event.submission_id,event.feedback_type,event.name,event.email,event.caal_id,event.message]);
  }catch(error){logger.error('Feedback could not be stored',{code:error.code});return res.status(error.code==='22023'?409:503).json({ok:false,error:error.code==='22023'?'submission_conflict':'feedback_storage_unavailable'});}
  let accepted=false;
  if(config){
   try{
    const claim=await pool.query('SELECT app_audit.claim_feedback_notification($1::uuid) AS claimed',[event.submission_id]);
    if(claim.rows[0]?.claimed){
     let status='failed',failure='relay_unavailable';
     try{
      const timestamp=String(Math.floor(now()/1000)),body=JSON.stringify(event);
      const signature=crypto.createHmac('sha256',config.secret).update(timestamp+'.'+body).digest('hex');
      const response=await fetchImpl(config.url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','X-CAAL-Timestamp':timestamp,'X-CAAL-Signature':signature},body});
      const result=await response.json();
      accepted=response.ok&&result.accepted===true;
      status=accepted?'accepted':'failed';failure=accepted?null:'relay_rejected';
     }catch{ /* Deliberately exclude recipient, message and response body from logs. */ }
     await pool.query('SELECT app_audit.finish_feedback_notification($1::uuid,$2,$3)',[event.submission_id,status,failure]);
    }
   }catch(error){logger.error('Feedback notification needs review',{code:error.code||'NOTIFICATION_ERROR',submission_id:event.submission_id});}
  }
  return res.status(201).json({ok:true,saved:true,notification_accepted:accepted,submission_id:event.submission_id});
 });return router;
}
module.exports={TYPES,PREFIX,validate,relayConfig,createPublicFeedbackRouter};
