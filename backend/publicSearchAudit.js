'use strict';
const {parseFilters,parseBbox}=require('./publicViewerPolicy');
const KEYS=new Set(['types','q','country','countries','caalId','monumentTypes','condition','deteriorationCause','riskType','riskMin','spatialPolygon','bbox','locationConfidence']);
function validateSearch(body){
  if(!body||typeof body.query!=='object'||Array.isArray(body.query)||!body.query)throw Error('invalid_search');
  if(!['submit','settled_input'].includes(body.trigger))throw Error('invalid_search');
  const query={};
  for(const [key,value] of Object.entries(body.query)){
    if(!KEYS.has(key)||typeof value!=='string')throw Error('invalid_search');
    query[key]=value;
  }
  parseFilters(query);if(query.bbox!==undefined)parseBbox(query.bbox);
  const text=String(query.q||'').trim();if(!text||text.length>150)throw Error('invalid_search');
  delete query.q;
  return {search_text:text,filters:query,trigger:body.trigger,
    language:['en','ru','zh','kk','ky','tg','tk','uz'].includes(body.language)?body.language:null};
}
function mountPublicSearchAudit(router){
  // Mounted after public rate/policy checks, before the inventory write prohibition.
  router.post('/search-events',(req,res)=>{
    let event;try{event=validateSearch(req.body);}catch{return res.status(400).json({ok:false,error:'invalid_search'});}
    if(!req.recordPublicSearch?.(event))return res.status(503).json({ok:false,error:'audit_unavailable'});
    return res.status(202).json({ok:true});
  });
}
module.exports={validateSearch,mountPublicSearchAudit};
