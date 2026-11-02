'use strict';
const CONDITIONAL_FIELDS=Object.freeze({...require('./viewerFieldMap').CONDITIONAL_FIELDS,location_confidence:Object.freeze(['monument'])});
function csv(value){
 if(value===undefined||value==='')return [];
 if(typeof value!=='string'||value.length>6000)throw Error('invalid_filters');
 const list=[...new Set(value.split(',').map(s=>s.trim()).filter(Boolean))];
 if(list.length>50||list.some(s=>s.length>150))throw Error('invalid_filters');return list;
}
function advanced(query,values,clauses){
 const add=v=>{values.push(v);return '$'+values.length;};
 // Public searches include only record types that support every active filter.
 const scoped=(field,sql)=>{
  const supported=CONDITIONAL_FIELDS[field];
  if(!supported)throw Error('invalid_filters');
  const guard=add(supported);clauses.push(`(record_type=ANY(${guard}::text[]) AND (${sql}))`);
 };
 const caalId=String(query.caalId||'').trim();if(caalId.length>150)throw Error('invalid_filters');
 if(caalId)clauses.push(`caal_id ILIKE ${add('%'+caalId.replace(/[\\%_]/g,'\\$&')+'%')}`);
 const confidence=csv(query.locationConfidence);
 if(confidence.length)scoped('location_confidence',`source_row_id IN (SELECT lc.source_row_id FROM viewer_public.v_monument_location_confidence lc WHERE coalesce(lc.location_confidence,'__missing__')=ANY(${add(confidence)}::text[]))`);
 const countries=csv(query.countries);
 if(countries.length)scoped('country',`filter_country=ANY(${add(countries)}::text[])`);
 const types=csv(query.monumentTypes);
 if(types.length){const p=add(types);scoped('monument_types',`filter_monument_types && ${p}::text[] OR filter_monument_type_concept_ids::text[] && (
 WITH RECURSIVE selected_tree AS (
  SELECT concept_id FROM viewer_public.v_site_type_context WHERE concept_id=ANY(${p}::text[])
  UNION SELECT c.concept_id FROM viewer_public.v_site_type_context c JOIN selected_tree p ON c.parent_id=p.concept_id
 ) SELECT coalesce(array_agg(concept_id::text),ARRAY[]::text[]) FROM selected_tree)`);}
 const levels=csv(query.condition).map(Number);
 if(levels.some(n=>!Number.isInteger(n)||n<1||n>5))throw Error('invalid_filters');
 if(levels.length)scoped('condition_levels',`filter_condition_levels && ${add(levels)}::int[]`);
 const deterioration=csv(query.deteriorationCause);
 if(deterioration.length)scoped('deterioration_causes',`filter_deterioration_causes && ${add(deterioration)}::text[]`);
 const risks=csv(query.riskType);const min=query.riskMin===undefined||query.riskMin===''?null:Number(query.riskMin);
 if(min!==null&&(!Number.isInteger(min)||min<1||min>5))throw Error('invalid_filters');
 if(risks.length||min!==null){const keys=risks.length?add(risks):null;const threshold=add(min??2);
  scoped('risk_levels',`EXISTS(SELECT 1 FROM jsonb_each_text(filter_risk_levels) risk(key,value)
   WHERE ${keys?`risk.key=ANY(${keys}::text[]) AND `:''}
    CASE WHEN btrim(risk.value) ~ '^-?[0-9]+$' THEN btrim(risk.value)::int ELSE NULL END >= ${threshold}::int)`);}
}
function polygon(value){
 if(value===undefined||value==='')return null;if(typeof value!=='string'||value.length>30000)throw Error('invalid_filters');
 let g;try{g=JSON.parse(value);}catch{throw Error('invalid_filters');}
 if(g?.type!=='Polygon'||!Array.isArray(g.coordinates)||!g.coordinates.length)throw Error('invalid_filters');
 let count=0;
 for(const ring of g.coordinates){
  if(!Array.isArray(ring)||ring.length<4)throw Error('invalid_filters');
  for(const p of ring){if(!Array.isArray(p)||p.length!==2||p.some(v=>typeof v!=='number'||!Number.isFinite(v))||Math.abs(p[0])>180||Math.abs(p[1])>85.0511||++count>200)throw Error('invalid_filters');}
  if(ring[0][0]!==ring[ring.length-1][0]||ring[0][1]!==ring[ring.length-1][1])throw Error('invalid_filters');
 }
 return g;
}
function spatialSql(g,values,column){
 values.push(JSON.stringify(g));const p=`ST_SetSRID(ST_GeomFromGeoJSON($${values.length}),4326)`;
 return `ST_IsValid(${p}) AND NOT ST_IsEmpty(${p}) AND ${column} && ${p} AND ST_Intersects(${column},${p})`;
}
module.exports={advanced,polygon,spatialSql,CONDITIONAL_FIELDS};
