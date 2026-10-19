const {advanced,polygon}=require('./publicViewerFilters');

const TYPES = Object.freeze(['monument','archive','rs3_poly','rs3_line','rs3_group',
  'vernacular','institution','cartography','dataset']);

const RS = new Set(['rs3_poly','rs3_line','rs3_group']);

function loopback(req) {
  const ip = req.socket?.remoteAddress || '';
  return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1';
}

function localPreview(req, env=process.env) {
  // No reverse-proxy headers or user-controlled query parameters can enable preview.
  // A proxy listening on loopback is NOT sufficient: the HTTP Host must also be localhost.
  const host = String(req.headers?.host || '').toLowerCase();
  return env.NODE_ENV !== 'production' && env.PUBLIC_VIEWER_LOCAL_PREVIEW === 'true'
    && loopback(req) && (!req.ip || loopback({socket:{remoteAddress:req.ip}})) && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

function publicationAllowed(req, row, env=process.env) {
  return Boolean(row && (localPreview(req,env) ||
    (env.PUBLIC_VIEWER_ENABLED === 'true' && row.public_access_enabled === true)));
}

// Fixed public zoom limit in MapLibre's 512 CSS-pixel world convention.
// 10=54m/px, 11=27m/px, 12=13.5m/px, 13=6.8m/px, 14=3.4m/px, 15=1.7m/px
function maxZoom() { return 13; }

function parseFilters(query) {
  const types = query.types === undefined ? [...TYPES] : String(query.types).split(',').filter(Boolean);
  if (!types.length || types.length>9 || types.some(t=>!TYPES.includes(t))) throw new Error('invalid_types');
  const q = String(query.q || '').trim(); const country = String(query.country || '').trim();
  if(q.length>150 || country.length>100) throw new Error('filter_too_long');
  const values=[types];const clauses=['record_type=ANY($1::text[])'];
  if(q){values.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');clauses.push(`(caal_id ILIKE $${values.length} OR display_label ILIKE $${values.length})`);}
  if(country){values.push(country);clauses.push(`filter_country=$${values.length}`);}
  advanced(query,values,clauses);
  return {values,where:clauses.join(' AND '),spatialPolygon:polygon(query.spatialPolygon)};
}

function parseBbox(value) {
  const box=String(value || '').split(',').map(Number);
  if(box.length!==4||box.some(x=>!Number.isFinite(x))||box[0]<-180||box[2]>180||box[1]<-85.0511||box[3]>85.0511||box[0]>=box[2]||box[1]>=box[3])throw Error('invalid_bbox');
  return box;
}

function recordKey(params) {
  if(!TYPES.includes(params.type) || !/^\d{1,18}$/.test(params.id || '')) throw new Error('invalid_record');
  return [params.type,params.id];
}

module.exports={
  TYPES,
  RS,
  localPreview,
  publicationAllowed,
  maxZoom,
  parseFilters,
  parseBbox,
  recordKey};
