(() => {
'use strict';
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
 let labelContext;
 try{labelContext=document.createElement('canvas').getContext('2d');}catch{}
 function labelFeatures(features){const selected=getSelected();const labelled=features.map(f=>{
  const p=f.properties;let text='';const count=Number(p.count||1);
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
   map.addLayer({id:id+'-fill',type:'fill',source:id,filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':id==='public-selected'?'#00E5FF':id==='public-hover'?'#00E5FF':'#2f6f5f','fill-opacity':id==='public-hover'||id==='public-selected'?.14:.12}});
   map.addLayer({id:id+'-line',type:'line',source:id,filter:['in',['geometry-type'],['literal',['Polygon','LineString']]],paint:{'line-color':id==='public-selected'?'#00E5FF':id==='public-hover'?'#00E5FF':'#2f6f5f','line-width':id==='public-selected'||id==='public-hover'?['match',['get','record_type'],'rs3_line',2.5,'rs3_group',2.2,1.8]:3}});
   map.addLayer({id:id+'-point',type:'circle',source:id,filter:['==',['geometry-type'],'Point'],paint:{'circle-color':id==='public-selected'?'#00E5FF':id==='public-hover'?'#00E5FF':'#2f6f5f','circle-radius':id==='public-selected'||id==='public-hover'?['match',['get','record_type'],'rs3_poly',4,'rs3_line',4,'rs3_group',4,6]:4,'circle-stroke-color':'#fff1d6','circle-stroke-width':id==='public-selected'||id==='public-hover'?.75:1.5}});
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
  setSource('public-area',areaGeometry?[{type:'Feature',geometry:areaGeometry,properties:{}}]:[]);setSource('public-measure',lastMeasurement);setSource('public-selected',selectedFeature?[selectedFeature]:[]);setSource('public-hover',hoveredFeature?[hoveredFeature]:[]);refreshData();
 }
 function distance(coords){let total=0;for(let i=1;i<coords.length;i++)total+=viewerDistanceMetres(coords[i-1],coords[i]);return total;}
 function result(coords,kind){if(kind==='measure-distance'){const d=distance(coords);return d>=1000?(d/1000).toLocaleString(undefined,{maximumFractionDigits:2})+' km':d.toLocaleString(undefined,{maximumFractionDigits:1})+' m';}
  const a=viewerPolygonAreaSquareMetres(coords);return a>=1000000?(a/1000000).toLocaleString(undefined,{maximumFractionDigits:3})+' km²':a>=10000?(a/10000).toLocaleString(undefined,{maximumFractionDigits:2})+' ha':a.toLocaleString(undefined,{maximumFractionDigits:1})+' m²';}
 function rectangle(a,b){const west=Math.min(a[0],b[0]),east=Math.max(a[0],b[0]),south=Math.min(a[1],b[1]),north=Math.max(a[1],b[1]);return [[west,south],[east,south],[east,north],[west,north]];}
 function stop(){mode=null;points=[];el('publicDrawInstruction').hidden=true;el('publicDrawArea').setAttribute('aria-pressed',String(!!areaGeometry&&el('publicMapExtent').getAttribute('aria-pressed')!=='true'));map.getCanvas().style.cursor='';map.doubleClickZoom.enable();setSource('public-sketch',[]);}
 function start(kind){stop();mode=kind;if(kind==='polygon'||kind==='rectangle')el('publicDrawArea').setAttribute('aria-pressed','true');map.doubleClickZoom.disable();map.getCanvas().style.cursor='crosshair';el('publicDrawInstruction').hidden=false;
  el('publicDrawInstructionText').textContent=kind==='rectangle'?t('public_rectangle_instruction','Click two opposite corners.'):kind.startsWith('measure')?t('public_measure_instruction','Click points, then Finish or double-click. Measurements are approximate.'):t('public_polygon_instruction','Click the polygon corners, then Finish or double-click.');}
 function finish(){if(!mode)return;const kind=mode;
  let coords=points.filter((p,i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]);
  if(kind==='rectangle'&&coords.length===2)coords=rectangle(...coords);
  if((kind==='measure-distance'&&coords.length<2)||(kind!=='measure-distance'&&coords.length<3))return;
  if(kind.startsWith('measure')){lastMeasurement=features(coords,kind);setSource('public-measure',lastMeasurement);el('viewerMeasurementResult').textContent=result(coords,kind);}
  else {el('publicMapExtent').setAttribute('aria-pressed','false');areaGeometry=polygon(coords);setSource('public-area',[{type:'Feature',geometry:areaGeometry,properties:{}}]);onArea(areaGeometry);}
  stop();
 }
 function closeDrawMenu(){el('publicDrawMenu').hidden=true;el('publicDrawArea').setAttribute('aria-expanded','false');}
 el('publicDrawArea').onclick=()=>{const menu=el('publicDrawMenu');menu.hidden=!menu.hidden;el('publicDrawArea').setAttribute('aria-expanded',String(!menu.hidden));};
 document.addEventListener('click',event=>{if(!el('publicDrawArea').contains(event.target)&&!el('publicDrawMenu').contains(event.target))closeDrawMenu();});
 window.addEventListener('keydown',event=>{if(event.key==='Escape')closeDrawMenu();});
 for(const b of el('publicDrawMenu').querySelectorAll('[data-draw]'))b.onclick=()=>{closeDrawMenu();start(b.dataset.draw);};
 el('publicMapExtent').onclick=()=>{stop();closeDrawMenu();el('publicMapExtent').setAttribute('aria-pressed','true');el('publicDrawArea').setAttribute('aria-pressed','false');const b=map.getBounds();const coords=rectangle([Math.max(-180,b.getWest()),Math.max(-85.0511,b.getSouth())],[Math.min(180,b.getEast()),Math.min(85.0511,b.getNorth())]);areaGeometry=polygon(coords);setSource('public-area',[{type:'Feature',geometry:areaGeometry,properties:{}}]);onArea(areaGeometry);};
 el('viewerMeasureDistanceBtn').onclick=()=>start('measure-distance');el('viewerMeasureAreaBtn').onclick=()=>start('measure-area');
 const clearMeasure=uiNode('button',"public_clear_measurement",'Clear measurement','action-btn');clearMeasure.type='button';clearMeasure.onclick=()=>{stop();lastMeasurement=[];setSource('public-measure',[]);el('viewerMeasurementResult').textContent='';};el('viewerMeasurementPanel').append(clearMeasure);
 el('publicFinishDrawing').onclick=finish;el('publicCancelDrawing').onclick=stop;
 map.on('click',event=>{if(!mode)return;event.publicViewerDrawing=true;const p=[event.lngLat.lng,event.lngLat.lat];if(Math.abs(p[0])>180||Math.abs(p[1])>85.0511)return;points.push(p);setSource('public-sketch',features(mode==='rectangle'&&points.length===2?rectangle(...points):points,mode));if(mode==='rectangle'&&points.length===2||points.length>=198)finish();});
 map.on('dblclick',event=>{if(mode){event.preventDefault();finish();}});
 map.on('mousemove',event=>{if(!mode||!points.length)return;const coords=mode==='rectangle'?rectangle(points[0],[event.lngLat.lng,event.lngLat.lat]):[...points,[event.lngLat.lng,event.lngLat.lat]];setSource('public-sketch',features(coords,mode));if(mode.startsWith('measure'))el('viewerMeasurementResult').textContent=result(coords,mode);});
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&mode){event.preventDefault();stop();}});
 const legendControl={onAdd(){const host=node('div',undefined,'maplibregl-ctrl monument-map-legend viewer-map-legend public-map-legend legend-collapsed');const b=uiNode('button',"map_key_short",'Key','legend-toggle-btn legend-show-btn');b.type='button';b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls','publicMapKey');const body=node('div',undefined,'public-map-key');body.id='publicMapKey';body.hidden=true;
  for(const [type,label] of Object.entries(names)){if(type==='archive')continue;const row=node('div');const dot=node('span',undefined,'public-type-dot');dot.style.background=colors[type];const title=node('span',label);title.dataset.publicLayerName=type;row.append(dot,title);body.append(row);}const highlighted=node('div',undefined,'public-key-selection-row');const swatch=node('span',undefined,'public-type-dot public-highlight-key');swatch.style.background='#00E5FF';const selectedName=node('span',t('public_selected_feature','Selected feature'));selectedName.setAttribute('data-public-i18n','Selected feature');highlighted.append(swatch,selectedName);body.append(highlighted);b.onclick=()=>{body.hidden=!body.hidden;host.classList.toggle('legend-collapsed',body.hidden);b.setAttribute('aria-expanded',String(!body.hidden));b.textContent=body.hidden?t('map_key_short','Key'):t('hide_map_key','Hide key');};host.append(b,body);this.box=host;return host;},onRemove(){this.box.remove();}};map.addControl(legendControl,'bottom-right');
 function relabel(){for(const n of document.querySelectorAll('[data-public-layer-name]'))n.textContent=names[n.dataset.publicLayerName];const key=document.querySelector('.public-map-legend .legend-toggle-btn');if(key)key.textContent=key.getAttribute('aria-expanded')==='true'?t('hide_map_key','Hide key'):t('map_key_short','Key');I?.apply();refreshData();}
 return {restoreLayers,visibleTypes,labelFeatures,refreshData,relabel,setHovered(geometry,record={}){hoveredFeature=geometry?{type:'Feature',geometry,properties:{record_type:record.record_type}}:null;setSource('public-hover',hoveredFeature?[hoveredFeature]:[]);},isDrawing:()=>!!mode,clearArea(){areaGeometry=null;stop();el('publicMapExtent').setAttribute('aria-pressed','false');setSource('public-area',[]);},setSelected(geometry,record){selectedFeature=geometry?{type:'Feature',geometry,properties:{record_type:record.record_type,source_row_id:record.source_row_id,caal_id:record.caal_id,display_label:record.display_label}}:null;setSource('public-selected',selectedFeature?[selectedFeature]:[]);setSource('public-hover',hoveredFeature?[hoveredFeature]:[]);refreshData();}};
};
})();
