const {publicViewerTiming}=require('./publicViewerTiming');
const {buildPublicDetailLookups}=require('./publicDetailLookups');
const publicTranslations=require('./publicViewerTranslations');
const {spatialSql,CONDITIONAL_FIELDS}=require('./publicViewerFilters');
const express = require('express');
// Minimum longest bounding-box dimension, measured in CSS pixels at the requested zoom.
const MIN_GEOMETRY_PIXELS = 8;
const {TYPES,RS,localPreview,publicationAllowed,maxZoom,parseFilters,parseBbox,recordKey} = require('./publicViewerPolicy');
function publicRecord(r) {
  return {record_type:r.record_type,source_row_id:r.source_row_id,caal_id:r.caal_id,
    display_label:r.display_label,...(r.details_json?{details_json:r.details_json}:{})};
}
// Shared list/count predicate so group totals always use the same public filters.
function catalogueFilter(query,type,after=null) {
      const f=parseFilters({...query,types:type});const values=[...f.values,type];
      let where=f.where+` AND c.record_type=$${values.length}`;
      if(after){values.push(after);where+=` AND c.source_row_id>$${values.length}::text`;}
      const spatial=[];
      if(f.spatialPolygon)spatial.push(spatialSql(f.spatialPolygon,values,'m.geom_4326'));
      else if(query.bbox!==undefined){const box=parseBbox(query.bbox);const n=values.length;values.push(...box);
        spatial.push(`m.geom_4326 && ST_MakeEnvelope($${n+1},$${n+2},$${n+3},$${n+4},4326) AND ST_Intersects(m.geom_4326,ST_MakeEnvelope($${n+1},$${n+2},$${n+3},$${n+4},4326))`);}
      if(spatial.length)where+=` AND EXISTS(SELECT 1 FROM viewer_public.v_resource_map_geometry m WHERE m.record_type=c.record_type
        AND m.source_row_id=c.source_row_id AND ${spatial.join(' AND ')})`;
  return {values,where};
}
function createPublicRouter(db, env=process.env) {
  const router=express.Router();const clients=new Map();let policyCache=null;let policyTime=0;let policyPromise=null;let detailLookupCache=null;let detailLookupTime=0;let detailLookupPromise=null;
  const smallCaches=new Map();
  async function cachedSmall(key,sql,stage){
    let entry=smallCaches.get(key);
    if(!entry||Date.now()-entry.time>300000){
      entry={time:Date.now()};entry.promise=db.query(sql,[],{signal:null,stage}).then(r=>r.rows).catch(error=>{if(smallCaches.get(key)===entry)smallCaches.delete(key);throw error;});smallCaches.set(key,entry);
    }
    return entry.promise;
  }
  router.use(publicViewerTiming);
  const wrap=fn=>async(req,res)=>{
    try {await fn(req,res);} catch(error) {
      if(error.code==='PUBLIC_ABORTED'||res.destroyed)return;
      if(['invalid_types','filter_too_long','invalid_record','invalid_bbox','invalid_zoom','invalid_filters','invalid_cursor'].includes(error.message)) {
        return res.status(400).json({ok:false,error:error.message});
      }
      console.error('Public Viewer request failed', {method:req.method,route:req.route?.path || req.path,stage:error.map_stage,code:error.code || 'PUBLIC_ERROR',message:env.NODE_ENV==='production'?undefined:error.message});
      return res.status(503).json({ok:false,error:error.code==='57014'?'public_viewer_query_timeout':'public_viewer_temporarily_unavailable'});
    }
  };
  router.use((req,res,next)=>{
    res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');
    const now=Date.now();const ip=req.ip || req.socket?.remoteAddress || 'unknown';
    if(clients.size>1000)for(const [key,value] of clients)if(value.until<now)clients.delete(key);
    let entry=clients.get(ip);
    if(!entry || entry.until<now){if(clients.size>=10000)return res.status(429).json({ok:false,error:'request_limit'});
      entry={count:0,until:now+60000};clients.set(ip,entry);}
    if(++entry.count>120){res.set('Retry-After',String(Math.ceil((entry.until-now)/1000)));return res.status(429).json({ok:false,error:'request_limit'});}
    next();
  });
  router.use(async(req,res,next)=>{
    try{
      if(!policyCache || Date.now()-policyTime>1000){
        if(!policyPromise)policyPromise=db.query('SELECT * FROM viewer_public.v_policy',[],{signal:null,stage:'policy'}).then(result=>{policyCache=result.rows[0];policyTime=Date.now();}).finally(()=>{policyPromise=null;});
        await policyPromise;
      }
      if(!publicationAllowed(req,policyCache,env))return res.status(403).json({ok:false,error:'public_viewer_not_enabled'});
      if(policyCache.exact_map_positions!==true)return res.status(503).json({ok:false,error:'location_policy_not_supported'});
      req.publicPolicy=policyCache;next();
    }catch(error){if(res.destroyed)return;console.error('Public Viewer policy unavailable',{code:error.code,message:env.NODE_ENV==='production'?undefined:error.message});res.status(503).json({ok:false,error:'public_viewer_temporarily_unavailable'});}
  });
  router.get('/policy',wrap(async(req,res)=>res.json({ok:true,policy:{
    visibility:'public',preview:localPreview(req,env),can_export_data:false,can_edit_records:false,
    max_zoom:maxZoom(),record_types:TYPES,
    exact_map_positions:true
  }})));
  // Explicitly reject exports and writes even if a future handler is added beneath this middleware.
  router.use((req,res,next)=>{
    if(req.method!=='GET' || /^\/(export|download)(\/|$)/.test(req.path))return res.status(403).json({ok:false,error:'public_view_only'});
    next();
  });
  router.get('/countries',wrap(async(req,res)=>{
    const [rows,labels]=await Promise.all([
      cachedSmall('countries','SELECT filter_country FROM viewer_public.v_countries ORDER BY filter_country LIMIT 100','countries'),
      cachedSmall('country_labels',"SELECT item FROM viewer_public.v_detail_lookups WHERE family='monuments' AND lookup_name='country'",'country_labels')]);
    const lang=publicTranslations.language(req.query.lang);
    res.json({ok:true,countries:rows.map(r=>r.filter_country),options:rows.map(r=>{const value=r.filter_country,needle=String(value).trim().toLowerCase();const raw=labels.map(row=>row.item||{}).find(row=>[row.canonical_value,row.label_en,row.display_en,row.en_label,row.value].some(v=>String(v??'').trim().toLowerCase()===needle));return {value,label:publicTranslations.resolve(raw,lang,value)};})});
  }));
  router.get('/lookups',wrap(async(req,res)=>{
    const rows=await cachedSmall('site_types','SELECT concept_id,parent_id,label_en,display_en,sort_order,translations FROM viewer_public.v_site_type_translations ORDER BY sort_order NULLS LAST,concept_id','site_type_translations');
    const lang=publicTranslations.language(req.query.lang);
    res.json({ok:true,language:lang,site_types:rows.map(row=>({...row,label:publicTranslations.resolve({...row,...row.translations},lang,row.concept_id),display_label:publicTranslations.resolve({...row,...row.translations},lang,row.concept_id)})),field_applicability:CONDITIONAL_FIELDS});
  }));
  router.get('/translations',wrap(async(req,res)=>{
    const rows=await cachedSmall('translations','SELECT scope,label_key,display_en,display_ru,display_zh,display_kk,display_ky,display_tg,display_tk,display_uz FROM viewer_public.v_translations','ui_translations');
    res.json({ok:true,languages:publicTranslations.LANGUAGES,rows});
  }));
  router.get('/detail-lookups',wrap(async(req,res)=>{
    if(!detailLookupCache||Date.now()-detailLookupTime>300000){
      if(!detailLookupPromise)detailLookupPromise=db.query('SELECT family,lookup_name,item FROM viewer_public.v_detail_lookups',[],{signal:null,stage:'detail_lookups'}).then(result=>{detailLookupCache=result.rows;detailLookupTime=Date.now();}).finally(()=>{detailLookupPromise=null;});
      await detailLookupPromise;
    }
    res.json({ok:true,lookups:buildPublicDetailLookups(detailLookupCache,req.query.lang)});
  }));
  router.get('/counts',wrap(async(req,res)=>{
    const f=parseFilters(req.query);const types=[...new Set(f.values[0])];
    if(types.length!==1)throw Error('invalid_types');
    const type=types[0];const {values,where}=catalogueFilter(req.query,type);
    const row=(await db.query(`SELECT count(*)::integer AS count FROM viewer_public.v_resource_count_catalogue c WHERE ${where}`,values,{stage:'catalogue_count'})).rows[0];
    res.json({ok:true,record_type:type,count:Number(row?.count||0)});
  }));
  router.get('/bounds',wrap(async(req,res)=>{
    const f=parseFilters(req.query),values=[...f.values];
    let where=f.where+' AND footprint_4326 IS NOT NULL AND NOT ST_IsEmpty(footprint_4326) AND anchor_4326 IS NOT NULL';
    // Same spatial predicates as the filtered catalogue/list. Bounds include every
    // matching mapped record, with no pagination and no full geometry serialization.
    if(f.spatialPolygon)where+=' AND '+spatialSql(f.spatialPolygon,values,'footprint_4326');
    else if(req.query.bbox!==undefined){
      const box=parseBbox(req.query.bbox),n=values.length;values.push(...box);
      const envelope=`ST_MakeEnvelope($${n+1},$${n+2},$${n+3},$${n+4},4326)`;
      where+=` AND footprint_4326 && ${envelope} AND ST_Intersects(footprint_4326,${envelope})`;
    }
    const row=(await db.query(`WITH extent AS (
      SELECT count(*)::integer AS mapped_records,ST_Extent(footprint_4326) AS box
      FROM viewer_public.v_resource_map_anchors WHERE ${where}
    ) SELECT mapped_records,ST_XMin(box) AS west,ST_YMin(box) AS south,
      ST_XMax(box) AS east,ST_YMax(box) AS north FROM extent`,values,{stage:'results_bounds'})).rows[0];
    const count=Number(row?.mapped_records||0);
    if(!count)return res.json({ok:true,mapped_records:0,bbox:null});
    const bbox=[row.west,row.south,row.east,row.north].map(Number);
    if([row.west,row.south,row.east,row.north].some(v=>v===null||v===undefined)||
      !bbox.every(Number.isFinite)||bbox[0]>bbox[2]||bbox[1]>bbox[3])throw Error('invalid_results_bounds');
    const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
    res.json({ok:true,mapped_records:count,bbox:[clamp(bbox[0],-180,180),clamp(bbox[1],-85.0511,85.0511),clamp(bbox[2],-180,180),clamp(bbox[3],-85.0511,85.0511)]});
  }));
  router.get('/records',wrap(async(req,res)=>{
    // Read ordered, bounded pages from one type at a time. No cross-type global sort or OFFSET scan.
    const all=parseFilters(req.query);const types=[...new Set(all.values[0])].sort();
    let startType=types[0],after=null;
    if(req.query.cursor!==undefined){
      const match=/^([a-z0-9_]+):([0-9]{1,18})$/.exec(String(req.query.cursor));
      if(!match||!types.includes(match[1]))throw Error('invalid_cursor');[startType,after]=match.slice(1);
    }
    if(Number(req.query.offset||0)!==0&&!req.query.cursor)return res.status(400).json({ok:false,error:'invalid_cursor'});
    const records=[];const deadline=Date.now()+12000;
    for(const type of types.slice(types.indexOf(startType))){
      if(Date.now()>deadline)throw Object.assign(new Error('Public page query budget exceeded'),{code:'57014'});
      const {values,where}=catalogueFilter(req.query,type,type===startType?after:null);
      values.push(51-records.length);
      const rows=(await db.query(`SELECT record_type,source_row_id,caal_id,
        CASE WHEN record_type IN ('rs3_poly','rs3_line','rs3_group') THEN caal_id ELSE left(display_label,1000) END AS display_label
        FROM viewer_public.v_resource_catalogue c WHERE ${where}
        ORDER BY source_row_id LIMIT $${values.length}`,values)).rows;
      records.push(...rows);if(records.length>50)break;
    }
    const page=records.slice(0,50);const last=page[page.length-1];
    res.json({ok:true,records:page.map(publicRecord),has_more:records.length>50,
      next_cursor:records.length>50?last.record_type+':'+last.source_row_id:null});
  }));
  router.get('/records/:type/:id',wrap(async(req,res)=>{
    const key=recordKey(req.params);const r=(await db.query(`SELECT record_type,source_row_id,caal_id,
      CASE WHEN record_type IN ('rs3_poly','rs3_line','rs3_group') THEN caal_id ELSE display_label END AS display_label,
      details_json FROM viewer_public.v_resource_details_full WHERE record_type=$1 AND source_row_id=$2 LIMIT 1`,key,{stage:'record_details'})).rows[0];
    if(!r)return res.status(404).json({ok:false,error:'not_found'});
    res.json({ok:true,record:publicRecord(r)});
  }));
  router.get('/relationships/:type/:id',wrap(async(req,res)=>{
    const key=recordKey(req.params);const rows=(await db.query(`SELECT DISTINCT relation_type,relation_type_norm,relation_direction,
      related_record_type AS record_type,related_source_row_id AS source_row_id,related_caal_id AS caal_id,
      CASE WHEN related_record_type IN ('rs3_poly','rs3_line','rs3_group') THEN related_caal_id
       ELSE left(related_display_label,1000) END AS display_label
      FROM viewer_public.v_relationships WHERE returned_record_type=$1 AND returned_source_row_id=$2
      LIMIT 101`,key,{stage:'relationships'})).rows;
    res.json({ok:true,relationships:rows.slice(0,100),has_more:rows.length>100});
  }));
  router.get('/geometry/:type/:id',wrap(async(req,res)=>{
    const key=recordKey(req.params);const r=(await db.query(`SELECT ST_AsGeoJSON(geom_4326,8)::json AS geometry
      FROM viewer_public.v_resource_map_geometry WHERE record_type=$1 AND source_row_id=$2 LIMIT 1`,key,{stage:'record_geometry'})).rows[0];
    if(!r)return res.status(404).json({ok:false,error:'no_map_geometry'});
    res.json({ok:true,geometry:r.geometry});
  }));
  router.get('/shape/:type/:id',wrap(async(req,res)=>{
    const key=recordKey(req.params);if(!RS.has(key[0]))return res.status(404).end();
    const r=(await db.query('SELECT preview_svg FROM viewer_public.v_rs_shape_previews WHERE record_type=$1 AND source_row_id=$2 LIMIT 1',key)).rows[0];
    if(!r?.preview_svg)return res.status(404).end();
    res.set('Content-Security-Policy',"default-src 'none'; sandbox");
    res.type('image/svg+xml').send(r.preview_svg);
  }));
  router.get('/map',wrap(async(req,res)=>{
    async function mapQuery(stage,sql,params){try{return await db.query(sql,params,{stage});}catch(error){error.map_stage=stage;throw error;}}
    const f=parseFilters(req.query),bbox=parseBbox(req.query.bbox),zoom=Number(req.query.zoom),cap=maxZoom();
    if(!Number.isFinite(zoom)||zoom<0||zoom>cap+0.05)throw Error('invalid_zoom');
    const values=[...f.values,...bbox],k=f.values.length;
    let where=`${f.where} AND footprint_4326 && ST_MakeEnvelope($${k+1},$${k+2},$${k+3},$${k+4},4326) AND anchor_4326 IS NOT NULL`;
    if(f.spatialPolygon)where+=' AND '+spatialSql(f.spatialPolygon,values,'footprint_4326');
    const metresPerPixel=40075016.68557849/(512*Math.pow(2,zoom));
    const atMaximum=zoom>=cap-0.05;
    let rows;
    if(atMaximum){
      rows=(await mapQuery('individual_anchors',`SELECT record_type,source_row_id,caal_id,source_geometry_type,
        CASE WHEN record_type IN ('rs3_poly','rs3_line','rs3_group') THEN caal_id ELSE left(display_label,200) END AS display_label,
        1::integer AS count,ST_AsGeoJSON(anchor_4326,8)::json AS geometry
        FROM viewer_public.v_resource_map_anchors WHERE ${where}`,values)).rows;
    }else{
      const n=values.length+1;
      // Reuse each projected anchor for both grid coordinates and the average.
      // Without this boundary PostgreSQL can inline the expressions repeatedly.
      rows=(await mapQuery('cluster_anchors',`WITH anchors AS MATERIALIZED (
        SELECT record_type,source_row_id,caal_id,display_label,source_geometry_type,ST_Transform(anchor_4326,3857) AS p
        FROM viewer_public.v_resource_map_anchors WHERE ${where}
      ), cells AS (
        SELECT *,floor(ST_X(p)/$${n}) AS gx,floor(ST_Y(p)/$${n}) AS gy FROM anchors
      ) SELECT record_type,count(*)::integer AS count,
        CASE WHEN count(*)=1 THEN min(source_row_id) END AS source_row_id,
        CASE WHEN count(*)=1 THEN min(source_geometry_type) END AS source_geometry_type,
        CASE WHEN count(*)=1 THEN min(caal_id) END AS caal_id,
        CASE WHEN count(*)=1 THEN left(min(display_label),200) END AS display_label,
        record_type||':'||gx::text||':'||gy::text AS cluster_id,
        ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_MakePoint(avg(ST_X(p)),avg(ST_Y(p))),3857),4326),8)::json AS geometry
      FROM cells GROUP BY record_type,gx,gy`,[...values,metresPerPixel*48])).rows;
    }
    // Fetch shapes only for individually represented non-point records. Do not carry
    // original geometries through the grouping query or join the cells to themselves.
    const geometries=new Map();
    const wanted=rows.filter(r=>Number(r.count)===1&&(RS.has(r.record_type)||(r.source_geometry_type&&r.source_geometry_type!=='POINT')))
      .map(r=>({record_type:r.record_type,source_row_id:r.source_row_id}));
    // Group by type so PostgreSQL can prune the other public source branches.
    // Bound each query without dropping any records from the final response.
    const shapeBatchSize=500;
    const byType=new Map();
    for(const item of wanted){
      if(!byType.has(item.record_type))byType.set(item.record_type,new Set());
      byType.get(item.record_type).add(item.source_row_id);
    }
    for(const [type,idSet] of byType){
      const ids=[...idSet];
      for(let offset=0;offset<ids.length;offset+=shapeBatchSize){
        const batch=ids.slice(offset,offset+shapeBatchSize);
        const shapes=(await mapQuery('individual_shapes:'+type+':'+(1+offset/shapeBatchSize),
          `WITH sized AS MATERIALIZED (
            SELECT g.record_type,g.source_row_id,g.geom_4326,
              box2d(ST_Transform(ST_Envelope(g.geom_4326),3857)) AS bounds_3857
            FROM viewer_public.v_resource_map_geometry_fast g
            WHERE g.record_type=$1::text AND g.source_row_id=ANY($2::text[])
          )
          SELECT record_type,source_row_id,
            CASE WHEN greatest(
              ST_XMax(bounds_3857)-ST_XMin(bounds_3857),
              ST_YMax(bounds_3857)-ST_YMin(bounds_3857)
            ) >= $3::double precision THEN ST_AsGeoJSON(geom_4326,8)::json ELSE NULL END AS geometry
          FROM sized`,[type,batch,metresPerPixel*MIN_GEOMETRY_PIXELS])).rows;
        for(const shape of shapes)if(shape.geometry)geometries.set(shape.record_type+'/'+shape.source_row_id,shape.geometry);
      }
    }
    res.json({ok:true,clustered:rows.some(r=>Number(r.count)>1),geometry_min_pixels:MIN_GEOMETRY_PIXELS,
      features:rows.map(r=>({type:'Feature',geometry:geometries.get(r.record_type+'/'+r.source_row_id)||r.geometry,properties:{
        record_type:r.record_type,count:r.count,cluster_id:r.cluster_id,source_row_id:r.source_row_id,caal_id:r.caal_id,
        display_label:RS.has(r.record_type)?r.caal_id:r.display_label}}))});
  }));
  return router;
}
module.exports={createPublicRouter};
