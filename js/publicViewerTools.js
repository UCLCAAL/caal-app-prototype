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
window.createPublicViewerTools=({map,names,colors,onArea,getFeatures,getSelected,onMapChange,onBasemap})=>{
 const el=id=>document.getElementById(id);const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 let mode=null,points=[],lastMeasurement=[],areaGeometry=null,selectedFeature=null,hoveredFeature=null;
 const panels=['viewerMeasurementPanel','viewerMapLayersPanel','mapOptionsPanel'];const buttons={};
 function panel(id){for(const p of panels){const show=p===id&&el(p).hidden;el(p).hidden=!show;buttons[p]?.setAttribute('aria-expanded',String(show));}}
 function addButton(id,title,svg,action,disabled=false){
  const control={onAdd(){const box=node('div',undefined,'maplibregl-ctrl map-custom-control');const b=node('button',undefined,'map-icon-toggle');b.type='button';b.id=id;b.title=title;b.setAttribute('aria-label',title);b.disabled=disabled;b.innerHTML=svg;b.onclick=action;box.append(b);this.box=box;return box;},onRemove(){this.box.remove();}};
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
 function labelFeatures(features){const selected=getSelected();return features.map(f=>{
  const p=f.properties;let text='';const count=Number(p.count||1);
  if(count>1)text=count>=10000?(count/1000).toFixed(1)+'k':count.toLocaleString();
  else if(el('showMapLabelsCheckbox').checked&&(el('mapLabelScopeSelect').value!=='selected'||(selected?.record_type===p.record_type&&String(selected.source_row_id)===String(p.source_row_id)))){
   const name=p.display_label||p.caal_id||'';text=el('mapLabelModeSelect').value==='caal_id'?p.caal_id:el('mapLabelModeSelect').value==='name_caal_id'?name+'\n'+p.caal_id:name;
  }
  if(selectedFeature&&f!==selectedFeature&&selected?.record_type===p.record_type&&String(selected.source_row_id)===String(p.source_row_id))text='';
  return {...f,properties:{...p,public_label:String(text||'').slice(0,240)}};
 });}
 function refreshData(){map.getSource('public-data')?.setData({type:'FeatureCollection',features:labelFeatures(getFeatures())});
  setSource('public-selected',selectedFeature?labelFeatures([selectedFeature]):[]);
  if(map.getLayer('public-labels'))map.setLayoutProperty('public-labels','text-allow-overlap',el('forceMapLabelsCheckbox').checked);
 }
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
  el('publicDrawInstructionText').textContent=kind==='rectangle'?'Click two opposite corners.':kind.startsWith('measure')?'Click points, then Finish or double-click. Measurements are approximate.':'Click the polygon corners, then Finish or double-click.';}
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
 const clearMeasure=node('button','Clear measurement','action-btn');clearMeasure.type='button';clearMeasure.onclick=()=>{stop();lastMeasurement=[];setSource('public-measure',[]);el('viewerMeasurementResult').textContent='';};el('viewerMeasurementPanel').append(clearMeasure);
 el('publicFinishDrawing').onclick=finish;el('publicCancelDrawing').onclick=stop;
 map.on('click',event=>{if(!mode)return;event.publicViewerDrawing=true;const p=[event.lngLat.lng,event.lngLat.lat];if(Math.abs(p[0])>180||Math.abs(p[1])>85.0511)return;points.push(p);setSource('public-sketch',features(mode==='rectangle'&&points.length===2?rectangle(...points):points,mode));if(mode==='rectangle'&&points.length===2||points.length>=198)finish();});
 map.on('dblclick',event=>{if(mode){event.preventDefault();finish();}});
 map.on('mousemove',event=>{if(!mode||!points.length)return;const coords=mode==='rectangle'?rectangle(points[0],[event.lngLat.lng,event.lngLat.lat]):[...points,[event.lngLat.lng,event.lngLat.lat]];setSource('public-sketch',features(coords,mode));if(mode.startsWith('measure'))el('viewerMeasurementResult').textContent=result(coords,mode);});
 window.addEventListener('keydown',event=>{if(event.key==='Escape'&&mode){event.preventDefault();stop();}});
 const legendControl={onAdd(){const host=node('div',undefined,'maplibregl-ctrl monument-map-legend viewer-map-legend public-map-legend legend-collapsed');const b=node('button','Key','legend-toggle-btn legend-show-btn');b.type='button';b.setAttribute('aria-expanded','false');b.setAttribute('aria-controls','publicMapKey');const body=node('div',undefined,'public-map-key');body.id='publicMapKey';body.hidden=true;
  for(const [type,label] of Object.entries(names)){if(type==='archive')continue;const row=node('div');const dot=node('span',undefined,'public-type-dot');dot.style.background=colors[type];row.append(dot,node('span',label));body.append(row);}const highlighted=node('div',undefined,'public-key-selection-row');const swatch=node('span',undefined,'public-type-dot public-highlight-key');swatch.style.background='#00E5FF';highlighted.append(swatch,node('span','Selected feature'));body.append(highlighted);b.onclick=()=>{body.hidden=!body.hidden;host.classList.toggle('legend-collapsed',body.hidden);b.setAttribute('aria-expanded',String(!body.hidden));b.textContent=body.hidden?'Key':'Hide key';};host.append(b,body);this.box=host;return host;},onRemove(){this.box.remove();}};map.addControl(legendControl,'bottom-right');
 return {restoreLayers,visibleTypes,labelFeatures,refreshData,setHovered(geometry,record={}){hoveredFeature=geometry?{type:'Feature',geometry,properties:{record_type:record.record_type}}:null;setSource('public-hover',hoveredFeature?[hoveredFeature]:[]);},isDrawing:()=>!!mode,clearArea(){areaGeometry=null;stop();el('publicMapExtent').setAttribute('aria-pressed','false');setSource('public-area',[]);},setSelected(geometry,record){selectedFeature=geometry?{type:'Feature',geometry,properties:{record_type:record.record_type,source_row_id:record.source_row_id,caal_id:record.caal_id,display_label:record.display_label}}:null;setSource('public-selected',selectedFeature?[selectedFeature]:[]);setSource('public-hover',hoveredFeature?[hoveredFeature]:[]);refreshData();}};
};
})();
