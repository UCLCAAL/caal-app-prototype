// Shared selection for a cluster's number and its popup. Original records/counts are unchanged.
(function(root){
'use strict';
const number=f=>Math.max(1,Number(f.properties?.count)||1);
const key=f=>{const p=f.properties||{};return number(f)>1
 ?'cluster:'+p.record_type+':'+(p.cluster_id||JSON.stringify(f.geometry?.coordinates))
 :'record:'+p.record_type+':'+p.source_row_id;};
function segmentHits(a,b,box){
 let low=0,high=1;
 for(const [start,delta,min,max] of [[a.x,b.x-a.x,box[0],box[2]],[a.y,b.y-a.y,box[1],box[3]]]){
  if(delta===0){if(start<min||start>max)return false;continue;}
  const t1=(min-start)/delta,t2=(max-start)/delta;
  low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));if(low>high)return false;
 }
 return true;
}
function ringContains(ring,p){let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }return inside;
}
function projectGeometry(g,project){
 if(!g)return null;
 if(g.type==='GeometryCollection')return {type:g.type,geometries:g.geometries.map(x=>projectGeometry(x,project)).filter(Boolean)};
 const walk=c=>typeof c[0]==='number'?project(c):c.map(walk);
 return {type:g.type,coordinates:walk(g.coordinates)};
}
function geometryBounds(g,r){
 let b=[Infinity,Infinity,-Infinity,-Infinity];
 const walk=c=>{if(c&&typeof c.x==='number'){b[0]=Math.min(b[0],c.x);b[1]=Math.min(b[1],c.y);b[2]=Math.max(b[2],c.x);b[3]=Math.max(b[3],c.y);}else if(Array.isArray(c))c.forEach(walk);};
 const visit=g=>{if(g.geometries)g.geometries.forEach(visit);else walk(g.coordinates);};visit(g);
 const pad=g.type==='Point'?r:4;return [b[0]-pad,b[1]-pad,b[2]+pad,b[3]+pad];
}
function hits(g,box,r){
 const point=p=>{const dx=p.x-Math.max(box[0],Math.min(box[2],p.x)),dy=p.y-Math.max(box[1],Math.min(box[3],p.y));return dx*dx+dy*dy<=r*r;};
 const line=coords=>{const expanded=[box[0]-4,box[1]-4,box[2]+4,box[3]+4];for(let i=1;i<coords.length;i++)if(segmentHits(coords[i-1],coords[i],expanded))return true;return false;};
 const polygon=rings=>rings.some(line)||[[box[0],box[1]],[box[2],box[1]],[box[2],box[3]],[box[0],box[3]]].some(([x,y])=>ringContains(rings[0]||[],{x,y})&&!rings.slice(1).some(ring=>ringContains(ring,{x,y})));
 switch(g.type){
  case 'Point':return point(g.coordinates);
  case 'MultiPoint':return g.coordinates.some(point);
  case 'LineString':return line(g.coordinates);
  case 'MultiLineString':return g.coordinates.some(line);
  case 'Polygon':return polygon(g.coordinates);
  case 'MultiPolygon':return g.coordinates.some(polygon);
  case 'GeometryCollection':return g.geometries.some(x=>hits(x,box,r));
  default:return false;
 }
}
function create(features,{project,radius,tolerance=10,visibleTypes}={}){
 const visible=visibleTypes?new Set(visibleTypes):null,unique=new Map();
 for(const f of features){if(f.geometry&&(!visible||visible.has(f.properties?.record_type)))unique.set(key(f),f);}
 const cells=new Map(),large=[],members=new Map(),counts=new Map(),cell=64;
 const overlaps=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
 const eligible=[...unique.values()];
 if(!eligible.some(f=>number(f)>1))return {members:()=>null,count:f=>number(f)};
 for(const feature of eligible){
  const geometry=projectGeometry(feature.geometry,project),r=Number(radius(feature.properties))||8;
  const bounds=geometryBounds(geometry,r);if(!bounds.every(Number.isFinite))continue;
  const entry={feature,geometry,r,bounds},x1=Math.floor(bounds[0]/cell),x2=Math.floor(bounds[2]/cell),y1=Math.floor(bounds[1]/cell),y2=Math.floor(bounds[3]/cell);
  if((x2-x1+1)*(y2-y1+1)>256){large.push(entry);continue;}
  for(let x=x1;x<=x2;x++)for(let y=y1;y<=y2;y++){const k=x+':'+y;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(entry);}
 }
 for(const f of eligible){
  if(number(f)<=1||f.geometry.type!=='Point')continue;
  const p=project(f.geometry.coordinates),box=[p.x-tolerance,p.y-tolerance,p.x+tolerance,p.y+tolerance];
  const candidates=new Set(large);
  for(let x=Math.floor(box[0]/cell);x<=Math.floor(box[2]/cell);x++)for(let y=Math.floor(box[1]/cell);y<=Math.floor(box[3]/cell);y++)for(const e of cells.get(x+':'+y)||[])candidates.add(e);
  const found=[...candidates].filter(e=>overlaps(e.bounds,box)&&hits(e.geometry,box,e.r)).map(e=>e.feature);
  if(!found.some(x=>key(x)===key(f)))found.push(f);
  members.set(key(f),found);counts.set(key(f),found.reduce((n,x)=>n+number(x),0));
 }
 return {members:f=>members.get(key(f))||null,count:f=>counts.get(key(f))||number(f)};
}
const api={create,key};
if(typeof module==='object'&&module.exports)module.exports=api;else root.CAALPublicClusterTotals=api;
})(typeof window==='object'?window:globalThis);

(() => {
'use strict';
function svgMeasureDistanceToolIcon() {
  return `
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
    >
      <line
        x1="5"
        y1="16"
        x2="19"
        y2="8"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
      <circle
        cx="5"
        cy="16"
        r="2.2"
        fill="currentColor"
      />
      <circle
        cx="19"
        cy="8"
        r="2.2"
        fill="currentColor"
      />
    </svg>
  `;
}
function svgMeasureAreaToolIcon() {
  return `
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
    >
      <path
        d="M6 7 L17 5.5 L19 15.5 L9 18.5 Z"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <circle cx="6" cy="7" r="2" fill="currentColor" />
      <circle cx="17" cy="5.5" r="2" fill="currentColor" />
      <circle cx="19" cy="15.5" r="2" fill="currentColor" />
      <circle cx="9" cy="18.5" r="2" fill="currentColor" />
    </svg>
  `;
}
function svgTargetIcon() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path
        d="M11 3a1 1 0 0 1 2 0v1.1A8 8 0 0 1 19.9 11H21a1 1 0 1 1 0 2h-1.1A8 8 0 0 1 13 19.9V21a1 1 0 1 1-2 0v-1.1A8 8 0 0 1 4.1 13H3a1 1 0 1 1 0-2h1.1A8 8 0 0 1 11 4.1V3Zm1 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 3.2A2.8 2.8 0 1 1 12 14.8 2.8 2.8 0 0 1 12 9.2Z"
        fill="currentColor"
      />
    </svg>
  `;
}
function svgMapSearchIcon({
  width = 20,
  height = 20
} = {}) {
  return `
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="${width}"
      height="${height}"
      focusable="false"
    >
      <circle
        cx="10.5"
        cy="10.5"
        r="6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />

      <path
        d="M15 15l5 5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
  `;
}

function svgViewerMeasurementIcon() {
  return `
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
    >
      <rect
        x="2.5"
        y="7"
        width="19"
        height="10"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      />

      <path
        d="
          M6 7v4
          M9 7v2.5
          M12 7v4
          M15 7v2.5
          M18 7v4
        "
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      />
    </svg>
  `;
}

function svgMapOptionsIcon() {
  return `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
      <path
        d="M4 7h10a2 2 0 1 0 0-2H4a1 1 0 0 0 0 2Zm16 0h-2a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2ZM4 13h2a2 2 0 1 0 0-2H4a1 1 0 1 0 0 2Zm8 0h8a1 1 0 1 0 0-2h-8a1 1 0 1 0 0 2ZM4 19h10a2 2 0 1 0 0-2H4a1 1 0 1 0 0 2Zm16 0h-2a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2Z"
        fill="currentColor"
      />
    </svg>
  `;
}

function svgViewerMapLayersIcon() {
  return `
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="18"
      height="18"
    >
      <path
        d="M12 3.5 3.5 8 12 12.5 20.5 8 12 3.5Z"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linejoin="round"
      />

      <path
        d="M4.5 11.5 12 15.5l7.5-4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <path
        d="M4.5 15 12 19l7.5-4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
}

function viewerDegreesToRadians(value) {
  return Number(value) * Math.PI / 180;
}

function viewerDistanceMetres(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return 0;
  }

  const earthRadiusMetres = 6371008.8;

  const lon1 = viewerDegreesToRadians(a[0]);
  const lat1 = viewerDegreesToRadians(a[1]);
  const lon2 = viewerDegreesToRadians(b[0]);
  const lat2 = viewerDegreesToRadians(b[1]);

  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    2 *
    earthRadiusMetres *
    Math.atan2(
      Math.sqrt(haversine),
      Math.sqrt(1 - haversine)
    )
  );
}

function viewerPolygonAreaSquareMetres(
  coordinates = []
) {
  if (!Array.isArray(coordinates) || coordinates.length < 3) {
    return 0;
  }

  const earthRadiusMetres = 6371008.8;

  let total = 0;

  for (let index = 0; index < coordinates.length; index += 1) {
    const current = coordinates[index];
    const next =
      coordinates[(index + 1) % coordinates.length];

    const lon1 = viewerDegreesToRadians(current[0]);
    const lon2 = viewerDegreesToRadians(next[0]);
    const lat1 = viewerDegreesToRadians(current[1]);
    const lat2 = viewerDegreesToRadians(next[1]);

    total +=
      (lon2 - lon1) *
      (
        2 +
        Math.sin(lat1) +
        Math.sin(lat2)
      );
  }

  return Math.abs(
    total * earthRadiusMetres * earthRadiusMetres / 2
  );
}

const ICONS={home:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5v7a1.5 1.5 0 0 1-1.5 1.5H15v-5H9v5H5.5A1.5 1.5 0 0 1 4 18.5v-7Z" fill="currentColor"/></svg>',download:'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',locate:svgMapSearchIcon({width:18,height:18}),measure:svgViewerMeasurementIcon(),options:svgMapOptionsIcon(),layers:svgViewerMapLayersIcon()};
// Evaluate the numeric circle paint expression so hit/label rules follow the visible size.
function pointPaintValue(value,properties){
 if(!Array.isArray(value))return value;
 const [op,...args]=value,v=x=>pointPaintValue(x,properties);
 if(op==='get')return properties[args[0]];
 if(op==='literal')return args[0];
 if(op==='to-number'){const n=Number(v(args[0]));return Number.isFinite(n)?n:v(args[1]);}
 if(op==='>')return v(args[0])>v(args[1]);
 if(op==='==')return v(args[0])===v(args[1]);
 if(op==='case'){for(let i=0;i<args.length-1;i+=2)if(v(args[i]))return v(args[i+1]);return v(args.at(-1));}
 if(op==='match'){const input=v(args[0]);for(let i=1;i<args.length-1;i+=2)if(Array.isArray(args[i])?args[i].includes(input):args[i]===input)return v(args[i+1]);return v(args.at(-1));}
 if(op==='step'){const input=v(args[0]);let result=v(args[1]);for(let i=2;i<args.length;i+=2){if(input<args[i])break;result=v(args[i+1]);}return result;}
 return undefined;
}
// Labels are a separate map layer. Hide a rear cluster count if its text touches
// a circle drawn in front. A screen-space grid avoids checking every pair.
function maskCoveredClusterLabels(features,{project,radius,measure,textSize=12}){
 const cellSize=64,buckets=new Map(),points=[];
 const output=features.map((feature,index)=>({...feature,properties:{...feature.properties,
  public_draw_order:(feature.properties.record_type==='institution'?features.length:0)+index}}));
 for(const feature of output){
  if(feature.geometry?.type!=='Point')continue;
  const position=project(feature.geometry.coordinates),r=Number(radius(feature.properties));
  if(!Number.isFinite(position?.x)||!Number.isFinite(position?.y)||!Number.isFinite(r)||r<=0)continue;
  const point={feature,x:position.x,y:position.y,r:r+1,order:feature.properties.public_draw_order};points.push(point);
  for(let x=Math.floor((point.x-point.r)/cellSize);x<=Math.floor((point.x+point.r)/cellSize);x++)
   for(let y=Math.floor((point.y-point.r)/cellSize);y<=Math.floor((point.y+point.r)/cellSize);y++){
    const key=x+':'+y;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(point);
   }
 }
 for(const point of points){
  const p=point.feature.properties;if(!(Number(p.count)>1)||!p.public_label)continue;
  const halfWidth=measure(p.public_label)/2+1.5,halfHeight=textSize/2+1.5;
  const left=point.x-halfWidth,right=point.x+halfWidth,top=point.y-halfHeight,bottom=point.y+halfHeight;
  const visited=new Set();let hidden=false;
  for(let x=Math.floor(left/cellSize);x<=Math.floor(right/cellSize)&&!hidden;x++)
   for(let y=Math.floor(top/cellSize);y<=Math.floor(bottom/cellSize)&&!hidden;y++)
    for(const front of buckets.get(x+':'+y)||[]){
     if(front.order<=point.order||visited.has(front))continue;visited.add(front);
     const dx=front.x-Math.max(left,Math.min(right,front.x)),dy=front.y-Math.max(top,Math.min(bottom,front.y));
     if(dx*dx+dy*dy<=front.r*front.r){hidden=true;break;}
    }
  if(hidden)p.public_label='';
 }
 return output;
}

window.createPublicViewerTools=({map,names,colors,onArea,getFeatures,getSelected,onMapChange,onBasemap})=>{
 function uiNode(tag,key,text,cls){const n=node(tag,undefined,cls);if(I)I.bind(n,key,text);else n.textContent=t(key,text);return n;}
 const I=window.publicViewerI18n,t=(key,fallback,vars={})=>I?.t(key,fallback,vars)||String(fallback||key).replace(/\{(\w+)\}/g,(all,k)=>vars[k]??all);
 const el=id=>document.getElementById(id);const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 let mode=null,points=[],lastMeasurement=[],areaGeometry=null,selectedFeature=null,hoveredFeature=null;
 const panels=['viewerMeasurementPanel','viewerMapLayersPanel','mapOptionsPanel'];const buttons={};
 function panel(id){for(const p of panels){const show=p===id&&el(p).hidden;el(p).hidden=!show;buttons[p]?.setAttribute('aria-expanded',String(show));}}
 function addButton(id,title,svg,action,disabled=false){
  const control={onAdd(){const box=node('div',undefined,'maplibregl-ctrl map-custom-control');const b=node('button',undefined,'map-icon-toggle');b.type='button';b.id=id;b.title=I?.ui(title)||title;b.setAttribute('data-public-ui-title',title);b.setAttribute('aria-label',I?.ui(title)||title);b.setAttribute('data-public-ui-aria-label',title);b.disabled=disabled;b.innerHTML=svg;b.onclick=action;box.append(b);this.box=box;return box;},onRemove(){this.box.remove();}};
  map.addControl(control,'top-right');return el(id);
 }
 addButton('publicMapHome','Reset map',ICONS.home,()=>map.easeTo({center:[66.9,42.5],zoom:Math.min(4,map.getMaxZoom())}));
 addButton('publicMapDownload','Downloads are disabled during the public preview',ICONS.download,null,true);
 addButton('publicLocateTool','Locate tools are disabled in the public Viewer',ICONS.locate,null,true);
 buttons.viewerMeasurementPanel=addButton('publicMeasurementTool','Measurement tools',ICONS.measure,()=>panel('viewerMeasurementPanel'));
 buttons.viewerMapLayersPanel=addButton('publicLayersTool','Map layers',ICONS.layers,()=>panel('viewerMapLayersPanel'));
 buttons.mapOptionsPanel=addButton('publicOptionsTool','Map options',ICONS.options,()=>panel('mapOptionsPanel'));
 for(const [id,button] of Object.entries(buttons)){button.setAttribute('aria-controls',id);button.setAttribute('aria-expanded','false');}
 for(const [button,id] of [['closeViewerMeasurementPanelBtn','viewerMeasurementPanel'],['closeViewerMapLayersBtn','viewerMapLayersPanel'],['closeMapOptionsBtn','mapOptionsPanel']])el(button).onclick=()=>{el(id).hidden=true;buttons[id]?.setAttribute('aria-expanded','false');};
 const layerInputs=[...el('viewerMapLayersPanel').querySelectorAll('input[type=checkbox][value]')];
 for(const i of layerInputs)i.onchange=onMapChange;
 el('basemapSelect').onchange=onBasemap;
 const labelIds=['showMapLabelsCheckbox','forceMapLabelsCheckbox','mapLabelScopeSelect','mapLabelModeSelect'];
 for(const id of labelIds)el(id).onchange=()=>{el('mapLabelsOptions').hidden=!el('showMapLabelsCheckbox').checked;refreshData();};
 const visibleTypes=()=>layerInputs.filter(i=>i.checked&&!i.disabled).map(i=>i.value);
 let clusterTotals=null; // CAAL_CLUSTER_TOTALS_V1
 let labelContext;
 try{labelContext=document.createElement('canvas').getContext('2d');}catch{}
 function labelFeatures(features){
  if(features===getFeatures())clusterTotals=window.CAALPublicClusterTotals.create(features,{
   project:coords=>map.project(coords),tolerance:10,visibleTypes:visibleTypes(),
   radius:p=>pointPaintValue(map.getPaintProperty('public-point-hit','circle-radius'),p)});
  const selected=getSelected();const labelled=features.map(f=>{
  const p=f.properties;let text='';const count=Number(p.count)>1?(clusterTotals?.count(f)||Number(p.count)):1;
  if(count>1)text=count>=10000?(count/1000).toFixed(1)+'k':count.toLocaleString(I?.locale());
  else if(el('showMapLabelsCheckbox').checked&&(el('mapLabelScopeSelect').value!=='selected'||(selected?.record_type===p.record_type&&String(selected.source_row_id)===String(p.source_row_id)))){
   const name=p.display_label||p.caal_id||'';text=el('mapLabelModeSelect').value==='caal_id'?p.caal_id:el('mapLabelModeSelect').value==='name_caal_id'?name+'\n'+p.caal_id:name;
  }
  if(selectedFeature&&f!==selectedFeature&&selected?.record_type===p.record_type&&String(selected.source_row_id)===String(p.source_row_id))text='';
  return {...f,properties:{...p,public_label:String(text||'').slice(0,240)}};
 });
  const radiusExpression=map.getPaintProperty('public-point','circle-radius');
  const textSize=Number(map.getLayoutProperty('public-labels','text-size'))||12;
  if(labelContext)labelContext.font='600 '+textSize+'px "Open Sans", Arial, sans-serif';
  return maskCoveredClusterLabels(labelled,{project:coords=>map.project(coords),
   radius:p=>pointPaintValue(radiusExpression,p),textSize,
   measure:text=>labelContext?labelContext.measureText(text).width:String(text).length*textSize*.65});
 }
 function refreshData(){if(!map.getSource('public-data')||!map.getLayer('public-point'))return;map.getSource('public-data').setData({type:'FeatureCollection',features:labelFeatures(getFeatures())});
  setSource('public-selected',selectedFeature?labelFeatures([selectedFeature]):[]);
  if(map.getLayer('public-labels')){
   const force=el('forceMapLabelsCheckbox').checked;
   map.setLayoutProperty('public-labels','text-allow-overlap',force);
   map.setLayoutProperty('public-labels','symbol-sort-key',force?['get','public_draw_order']:['-',['get','public_draw_order']]);
  }
 }
 map.on('moveend',refreshData);map.on('resize',refreshData);
 function fc(features){return {type:'FeatureCollection',features};}
 function polygon(coords){return {type:'Polygon',coordinates:[[...coords,coords[0]]]};}
 function features(coords,kind){
  if(!coords.length)return [];
  const out=coords.map(c=>({type:'Feature',geometry:{type:'Point',coordinates:c},properties:{}}));
  if(coords.length>1)out.push({type:'Feature',geometry:{type:'LineString',coordinates:coords},properties:{}});
  if((kind==='measure-area'||kind==='polygon'||kind==='rectangle')&&coords.length>=3)out.push({type:'Feature',geometry:polygon(coords),properties:{}});
  return out;
 }
 function setSource(id,features){map.getSource(id)?.setData(fc(features));}
 function restoreLayers(){
  for(const id of ['public-area','public-sketch','public-measure','public-selected','public-hover']){
   if(!map.getSource(id))map.addSource(id,{type:'geojson',data:fc([])});
   map.addLayer({id:id+'-fill',type:'fill',source:id,filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':id==='public-measure'?'#22D3EE':id==='public-selected'?'#00E5FF':id==='public-hover'?'#00E5FF':'#2f6f5f','fill-opacity':id==='public-measure'?.22:id==='public-hover'||id==='public-selected'?.14:.12}});
   map.addLayer({id:id+'-line',type:'line',source:id,filter:['in',['geometry-type'],['literal',['Polygon','LineString']]],paint:{'line-color':id==='public-measure'?'#083344':id==='public-selected'?'#00E5FF':id==='public-hover'?'#00E5FF':'#2f6f5f','line-width':id==='public-selected'||id==='public-hover'?['match',['get','record_type'],'rs3_line',2.5,'rs3_group',2.2,1.8]:3}});
   map.addLayer({id:id+'-point',type:'circle',source:id,filter:['==',['geometry-type'],'Point'],paint:{'circle-color':id==='public-measure'?'#22D3EE':id==='public-selected'?'#00E5FF':id==='public-hover'?'#00E5FF':'#2f6f5f','circle-radius':id==='public-measure'?5:id==='public-selected'||id==='public-hover'?['match',['get','record_type'],'rs3_poly',4,'rs3_line',4,'rs3_group',4,6]:4,'circle-stroke-color':id==='public-measure'?'#083344':'#fff1d6','circle-stroke-width':id==='public-measure'?2:id==='public-selected'||id==='public-hover'?.75:1.5}});
  }
  map.addLayer({
    id:'public-labels',
    type:'symbol',
    source:'public-data',
    filter:['==',['geometry-type'],'Point'],
    layout:{
      'text-field':['get','public_label'],
      'text-font':['Open Sans Semibold','Arial Unicode MS Bold'],
      'text-size':12,'text-offset':[0,0],
      'symbol-z-order':'source',
      'symbol-sort-key':el('forceMapLabelsCheckbox').checked?['get','public_draw_order']:['-',['get','public_draw_order']],
      'text-allow-overlap':el('forceMapLabelsCheckbox').checked},
      paint:{
        'text-color':'#182d27',
        'text-halo-color':'#ffffff',
        'text-halo-width':0.7}});
  map.addLayer({
    id:'public-selected-label',
    type:'symbol',
    source:'public-selected',
    filter:['==',['geometry-type'],'Point'],
    layout:{'text-field':['get','public_label'],
      'text-font':['Open Sans Semibold','Arial Unicode MS Bold'],
      'text-size':12,'text-offset':[0,1.2],
      'text-anchor':'top','text-allow-overlap':true},
    paint:{'text-color':'#182d27','text-halo-color':'#ffffff','text-halo-width':0.7}});
  setSource('public-area',[]);setSource('public-measure',lastMeasurement);setSource('public-selected',selectedFeature?[selectedFeature]:[]);setSource('public-hover',hoveredFeature?[hoveredFeature]:[]);refreshData();
 }
 function distance(coords){let total=0;for(let i=1;i<coords.length;i++)total+=viewerDistanceMetres(coords[i-1],coords[i]);return total;}
 function result(coords,kind){if(kind==='measure-distance'){const d=distance(coords);return d>=1000?(d/1000).toLocaleString(undefined,{maximumFractionDigits:2})+' km':d.toLocaleString(undefined,{maximumFractionDigits:1})+' m';}
  const a=viewerPolygonAreaSquareMetres(coords);return a>=1000000?(a/1000000).toLocaleString(undefined,{maximumFractionDigits:3})+' km²':a>=10000?(a/10000).toLocaleString(undefined,{maximumFractionDigits:2})+' ha':a.toLocaleString(undefined,{maximumFractionDigits:1})+' m²';}
 function rectangle(a,b){const west=Math.min(a[0],b[0]),east=Math.max(a[0],b[0]),south=Math.min(a[1],b[1]),north=Math.max(a[1],b[1]);return [[west,south],[east,south],[east,north],[west,north]];}
 function renderMeasurementIcons(){
  for(const [id,key,label,svg] of [['viewerMeasureDistanceBtn','measure_distance','Measure distance',svgMeasureDistanceToolIcon],['viewerMeasureAreaBtn','measure_area','Measure area',svgMeasureAreaToolIcon],['viewerMeasurePointBtn','point_coordinates','Point coordinates',svgTargetIcon]]){
   const button=el(id);button.removeAttribute('data-i18n');button.removeAttribute('data-public-i18n');
   button.innerHTML='<span class="measurement-button-icon" aria-hidden="true">'+svg()+'</span>';
   button.title=t(key,label);button.setAttribute('aria-label',t(key,label));
  }
 }
 let savedMeasurement=null,rectanglePanWasEnabled=false,rectangleStart=null,rectangleEnd=null,suppressDrawingClick=false;
 function measurementActive(kind){for(const [id,value] of [['viewerMeasureDistanceBtn','measure-distance'],['viewerMeasureAreaBtn','measure-area']])el(id).setAttribute('aria-pressed',String(kind===value));}
 function formatDistance(metres){return metres>=1000?(metres/1000).toLocaleString(I?.locale(),{maximumFractionDigits:2})+' km':metres.toLocaleString(I?.locale(),{maximumFractionDigits:1})+' m';}
 function showMeasurementPlaceholder(text){const host=el('viewerMeasurementResult');host.replaceChildren(node('span',text,'viewer-measurement-placeholder'));host.hidden=false;}
 function clearMeasurement(){stop();savedMeasurement=null;lastMeasurement=[];setSource('public-measure',[]);showMeasurementPlaceholder(t('select_measurement_type','Select a measurement type.'));}
 function renderMeasurement(coords,kind){
  const host=el('viewerMeasurementResult');host.replaceChildren();host.hidden=false;
  if(coords.length<(kind==='measure-distance'?2:3)){showMeasurementPlaceholder(t('add_points_on_map','Add points on the map.'));return;}
  host.append(node('strong',result(coords,kind)));
  const secondary=node('span',undefined,'viewer-measurement-result-label');
  if(kind==='measure-area')secondary.textContent=t('area','Area')+' · '+t('perimeter','Perimeter')+': '+formatDistance(distance([...coords,coords[0]]));
  else secondary.textContent=t('total_distance','Total distance')+' · '+t('last_segment','Last segment')+': '+formatDistance(viewerDistanceMetres(coords.at(-2),coords.at(-1)));
  host.append(secondary);
  const clear=node('button','×','public-popup-close viewer-measurement-clear-inline');clear.type='button';clear.title=t('public_clear_measurement','Clear measurement');clear.setAttribute('aria-label',clear.title);clear.onclick=clearMeasurement;host.append(clear);
 }

 renderMeasurementIcons();showMeasurementPlaceholder(t('select_measurement_type','Select a measurement type.'));el('publicFinishDrawing').hidden=true;el('publicCancelDrawing').classList.add('viewer-spatial-draw-cancel');
 function stop(){if(mode?.startsWith('measure')){setSource('public-measure',lastMeasurement);if(!savedMeasurement)showMeasurementPlaceholder(t('select_measurement_type','Select a measurement type.'));}if(rectanglePanWasEnabled)map.dragPan?.enable();rectanglePanWasEnabled=false;rectangleStart=null;rectangleEnd=null;mode=null;points=[];el('publicDrawInstruction').hidden=true;el('viewerMeasurementInstruction').hidden=true;
  for(const id of ['viewerMeasureDistanceBtn','viewerMeasureAreaBtn'])el(id).setAttribute('aria-pressed','false');
  el('publicDrawArea').setAttribute('aria-pressed',String(!!areaGeometry&&el('publicMapExtent').getAttribute('aria-pressed')!=='true'));map.getCanvas().style.cursor='';map.doubleClickZoom.enable();setSource('public-sketch',[]);}
 function start(kind){stop();mode=kind;
  if(kind==='polygon'||kind==='rectangle')el('publicDrawArea').setAttribute('aria-pressed','true');
  map.doubleClickZoom.disable();map.getCanvas().style.cursor='crosshair';
  if(kind==='rectangle'){rectanglePanWasEnabled=map.dragPan?.isEnabled?.()??true;map.dragPan?.disable();}
  if(kind.startsWith('measure')){
   savedMeasurement=null;lastMeasurement=[];setSource('public-measure',[]);
   el(kind==='measure-distance'?'viewerMeasureDistanceBtn':'viewerMeasureAreaBtn').setAttribute('aria-pressed','true');
   el('viewerMeasurementInstruction').hidden=true;showMeasurementPlaceholder(t('add_points_on_map','Add points on the map.'));
  }else{
   el('publicDrawInstruction').hidden=false;
   el('publicDrawInstructionText').textContent=kind==='rectangle'?t('viewer_spatial_rectangle_drag_instruction','Click and drag to draw a rectangle.'):t('viewer_spatial_polygon_finish_instruction','Click to add points. Click the first point or right-click anywhere on the map to finish.');
  }
 }
 function finish(){if(!mode)return;const kind=mode;
  let coords=points.filter((p,i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]);
  if(kind==='rectangle'&&coords.length===2)coords=rectangle(...coords);
  if((kind==='measure-distance'&&coords.length<2)||(kind!=='measure-distance'&&coords.length<3))return;
  if(kind.startsWith('measure')){
   lastMeasurement=features(coords,kind);setSource('public-measure',lastMeasurement);
   savedMeasurement={coords:[...coords],kind};renderMeasurement(coords,kind);
  }else{
   el('publicMapExtent').setAttribute('aria-pressed','false');areaGeometry=polygon(coords);
   // Same lifecycle as the authenticated Viewer: retain the filter, remove the drawing.
   setSource('public-area',[]);stop();onArea(areaGeometry);return;
  }
  stop();if(kind.startsWith('measure'))measurementActive(kind);
 }
 function closeDrawMenu(){el('publicDrawMenu').hidden=true;el('publicDrawArea').setAttribute('aria-expanded','false');}
 el('publicDrawArea').onclick=()=>{const menu=el('publicDrawMenu');menu.hidden=!menu.hidden;el('publicDrawArea').setAttribute('aria-expanded',String(!menu.hidden));};
 document.addEventListener('click',event=>{if(!el('publicDrawArea').contains(event.target)&&!el('publicDrawMenu').contains(event.target))closeDrawMenu();});
 window.addEventListener('keydown',event=>{if(event.key==='Escape')closeDrawMenu();});
 for(const b of el('publicDrawMenu').querySelectorAll('[data-draw]'))b.onclick=()=>{closeDrawMenu();start(b.dataset.draw);};
 el('publicMapExtent').onclick=()=>{stop();closeDrawMenu();el('publicMapExtent').setAttribute('aria-pressed','true');el('publicDrawArea').setAttribute('aria-pressed','false');const b=map.getBounds();const coords=rectangle([Math.max(-180,b.getWest()),Math.max(-85.0511,b.getSouth())],[Math.min(180,b.getEast()),Math.min(85.0511,b.getNorth())]);areaGeometry=polygon(coords);setSource('public-area',[]);onArea(areaGeometry);};
 el('viewerMeasureDistanceBtn').onclick=()=>start('measure-distance');el('viewerMeasureAreaBtn').onclick=()=>start('measure-area');
 el('publicFinishDrawing').onclick=finish;el('publicCancelDrawing').onclick=stop;
 // Rectangle uses drag-to-draw, matching the authenticated Viewer.
 function beginRectangle(event){if(mode!=='rectangle')return;if(event.originalEvent?.button!=null&&event.originalEvent.button!==0)return;
  event.preventDefault?.();event.originalEvent?.preventDefault?.();rectangleStart=[event.lngLat.lng,event.lngLat.lat];rectangleEnd=rectangleStart;points=[rectangleStart];
 }
 function endRectangle(event){if(mode!=='rectangle'||!rectangleStart)return;
  event.preventDefault?.();const end=event.lngLat?[event.lngLat.lng,event.lngLat.lat]:rectangleEnd;
  if(!end||end[0]===rectangleStart[0]||end[1]===rectangleStart[1]){rectangleStart=null;points=[];setSource('public-sketch',[]);return;}
  points=[rectangleStart,end];suppressDrawingClick=true;setTimeout(()=>{suppressDrawingClick=false;},250);finish();
 }
 map.on('mousedown',beginRectangle);map.on('mouseup',endRectangle);
 window.addEventListener('mouseup',event=>{if(mode==='rectangle'&&rectangleStart&&event.target!==map.getCanvas())stop();});
 map.on('click',event=>{
  if(suppressDrawingClick){event.publicViewerDrawing=true;suppressDrawingClick=false;return;}
  if(!mode)return;event.publicViewerDrawing=true;if(mode==='rectangle')return;
  const p=[event.lngLat.lng,event.lngLat.lat];if(Math.abs(p[0])>180||Math.abs(p[1])>85.0511)return;
  if((mode==='polygon'||mode==='measure-area')&&points.length>=3){const first=map.project(points[0]),current=map.project(p);if(Math.hypot(first.x-current.x,first.y-current.y)<=12){finish();return;}}
  const previous=points.at(-1);if(previous&&previous[0]===p[0]&&previous[1]===p[1])return;
  points.push(p);setSource(mode.startsWith('measure')?'public-measure':'public-sketch',features(points,mode));if(mode.startsWith('measure'))renderMeasurement(points,mode);if(points.length>=198)finish();
 });
 map.on('dblclick',event=>{if(mode){event.preventDefault();finish();}});
 map.on('mousemove',event=>{
  if(!mode)return;
  if(mode==='rectangle'){
   if(!rectangleStart)return;rectangleEnd=[event.lngLat.lng,event.lngLat.lat];setSource('public-sketch',features(rectangle(rectangleStart,rectangleEnd),mode));return;
  }
  if(!points.length)return;const coords=[...points,[event.lngLat.lng,event.lngLat.lat]];setSource(mode.startsWith('measure')?'public-measure':'public-sketch',features(coords,mode));if(mode.startsWith('measure'))renderMeasurement(coords,mode);
 });
 map.on('contextmenu',event=>{if(!mode)return;event.preventDefault?.();event.originalEvent?.preventDefault?.();finish();});
 window.addEventListener('keydown',event=>{
  if(!mode||event.isComposing||event.target?.closest?.('input,textarea,select,button,[contenteditable="true"]'))return;
  if(event.key==='Escape'){event.preventDefault();stop();}
  else if(event.key==='Enter'){event.preventDefault();finish();}
 });
 function legendSnapshot(map){
  const main=['public-fill','public-line','public-point','public-related-fill','public-related-outline','public-related-points'].filter(id=>map.getLayer(id));
  const selected=['public-selected-fill','public-selected-line','public-selected-point'].filter(id=>map.getLayer(id));
  const canvas=map.getCanvas(),width=canvas.clientWidth,height=canvas.clientHeight;
  if(!width||!height)return {types:new Set(),selected:false};
  const bounds=[[0,0],[width,height]];
  const features=main.length?map.queryRenderedFeatures(bounds,{layers:main}):[];
  return {types:new Set(features.map(f=>f.properties?.record_type).filter(Boolean)),
   selected:selected.length>0&&map.queryRenderedFeatures(bounds,{layers:selected}).length>0};
 }
 const legendRows=new Map();let legendSelection,legendBody,legendHost,legendShow,legendClose,legendFrame=null;
 function updateLegend(){
  if(!legendHost)return;
  const current=legendSnapshot(map);
  for(const [type,row] of legendRows)row.hidden=!current.types.has(type);
  legendSelection.hidden=!current.selected;
 }
 function scheduleLegend(){if(legendFrame!==null)return;legendFrame=requestAnimationFrame(()=>{legendFrame=null;updateLegend();});}
 const legendControl={onAdd(){
  const host=node('div',undefined,'maplibregl-ctrl monument-map-legend viewer-map-legend public-map-legend');legendHost=host;
  const show=uiNode('button','map_key','Map key','legend-toggle-btn legend-show-btn');legendShow=show;
  show.type='button';show.hidden=true;show.setAttribute('aria-expanded','true');show.setAttribute('aria-controls','publicMapKey');
  const body=node('div',undefined,'public-map-key');legendBody=body;body.id='publicMapKey';
  const header=node('div',undefined,'public-map-key-header');
  const title=node('strong',t('map_key','Map key'));title.dataset.publicLegendTitle='';
  const close=node('button','×','public-popup-close public-map-key-close');legendClose=close;close.type='button';close.setAttribute('aria-label','Close map key');close.title='Close map key';
  header.append(title,close);body.append(header);
  for(const [type,label] of Object.entries(names)){
   if(type==='archive')continue;const row=node('div',undefined,'public-map-key-row');row.hidden=true;
   const dot=node('span',undefined,'public-type-dot');dot.style.background=colors[type];
   const text=node('span',label);text.dataset.publicLayerName=type;row.append(dot,text);body.append(row);legendRows.set(type,row);
  }
  const highlighted=node('div',undefined,'public-key-selection-row');legendSelection=highlighted;highlighted.hidden=true;
  const swatch=node('span',undefined,'public-type-dot public-highlight-key');swatch.style.background='#00E5FF';
  const selectedName=node('span',t('public_selected_feature','Selected feature'));selectedName.setAttribute('data-public-i18n','Selected feature');highlighted.append(swatch,selectedName);body.append(highlighted);
  const setOpen=open=>{body.hidden=!open;show.hidden=open;host.classList.toggle('legend-collapsed',!open);show.setAttribute('aria-expanded',String(open));};
  close.onclick=()=>setOpen(false);show.onclick=()=>{setOpen(true);updateLegend();};host.append(show,body);this.box=host;return host;
 },onRemove(){if(legendFrame!==null)cancelAnimationFrame(legendFrame);this.box.remove();legendHost=null;}};
 map.addControl(legendControl,'bottom-right');
 map.on('idle',scheduleLegend);map.on('moveend',scheduleLegend);map.on('resize',scheduleLegend);
 map.on('sourcedata',event=>{if(['public-data','public-related','public-selected'].includes(event.sourceId))scheduleLegend();});
 function relabel(){renderMeasurementIcons();if(savedMeasurement&&!mode)renderMeasurement(savedMeasurement.coords,savedMeasurement.kind);for(const n of document.querySelectorAll('[data-public-layer-name]'))n.textContent=names[n.dataset.publicLayerName];if(legendShow)legendShow.textContent=t('map_key','Map key');const title=legendHost?.querySelector('[data-public-legend-title]');if(title)title.textContent=t('map_key','Map key');I?.apply();refreshData();}
 return {restoreLayers,visibleTypes,labelFeatures,clusterMembers:f=>clusterTotals?.members(f),clusterCount:f=>clusterTotals?.count(f)||Number(f.properties.count||1),refreshData,relabel,setHovered(geometry,record={}){hoveredFeature=geometry?{type:'Feature',geometry,properties:{record_type:record.record_type}}:null;setSource('public-hover',hoveredFeature?[hoveredFeature]:[]);},isDrawing:()=>!!mode,clearArea(){areaGeometry=null;stop();el('publicMapExtent').setAttribute('aria-pressed','false');setSource('public-area',[]);},setSelected(geometry,record){selectedFeature=geometry?{type:'Feature',geometry,properties:{record_type:record.record_type,source_row_id:record.source_row_id,caal_id:record.caal_id,display_label:record.display_label}}:null;setSource('public-selected',selectedFeature?[selectedFeature]:[]);setSource('public-hover',hoveredFeature?[hoveredFeature]:[]);refreshData();}};
};
})();
