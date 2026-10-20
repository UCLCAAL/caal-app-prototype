(() => {
  'use strict';
  const api='/api/public-viewer';
  function uiNode(tag,key,text,cls){const n=node(tag,undefined,cls);if(I)I.bind(n,key,text);else n.textContent=t(key,text);return n;}
 const I=window.publicViewerI18n;
  const t=(key,fallback,vars={})=>I?.t(key,fallback,vars)||String(fallback||key).replace(/\{(\w+)\}/g,(all,k)=>vars[k]??all);
  const message=(id,key,fallback,vars)=>I?I.bind(el(id),key,fallback,vars):el(id).textContent=t(key,fallback,vars);
  const mapPickTolerance=10; // CSS pixels on each side of the click (a square hit area).
  const names={monument:'Monuments',archive:'Archive',rs3_poly:'RS polygons',rs3_line:'RS lines',rs3_group:'RS groups',vernacular:'Vernacular',institution:'Institutions',cartography:'Cartography',dataset:'Datasets'};
  if(I)for(const type of Object.keys(names))Object.defineProperty(names,type,{get:()=>I.layer(type),enumerable:true});
  const colors={
    monument:'#BA4530',
    archive:'#8c6c4a',
    rs3_poly:'#3DD4C2',
    rs3_line:'#F5A83B',
    rs3_group:'#9E66E8',
    vernacular:'#4b82ed',
    institution:'#33E892',
    cartography:'#1C1A0B',
    dataset:'#0E1B1F'};
  const el=id=>document.getElementById(id);const state={policy:null,map:null,offset:0,more:false,selected:null,listController:null,mapController:null,detailSequence:0,detailController:null,mapSequence:0,mapLoading:false,hoverSequence:0,cursor:null,nextCursor:null,cursorHistory:[],areaPolygon:null,mapFeatures:[],filtersUI:null,groupsUI:null,tools:null};
  let detailsUI=null,relatedMap=null,mapPausedForDetails=false;
  // Wait only for the first map request to START, never for map SQL to finish.
  // If the map style fails or loads slowly, counts can proceed after 1.5 s.
  let releaseInitialMapStart=null,initialMapTimer;
  const initialMapStarted=new Promise(resolve=>{releaseInitialMapStart=()=>{clearTimeout(initialMapTimer);resolve();};});
  let mapTimer,searchTimer;let popup=null,selectionPopup=null;const hoverBlobs=new Map(),geometryCache=new Map();let hoverTimer,hoverController,hoverVersion=0,previewTimer,listPreview=null,previewAnchor=null,previewDescription=null;
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const rs=type=>['rs3_poly','rs3_line','rs3_group'].includes(type);
  const label=r=>rs(r.record_type)?r.caal_id:(r.display_label||r.caal_id);
  async function get(path,signal){if(I&&!new URLSearchParams(path.split('?')[1]||'').has('lang'))path+=(path.includes('?')?'&':'?')+'lang='+encodeURIComponent(I.language());const response=await fetch(api+path,{credentials:'omit',signal});
    if(!response.ok){let body={};try{body=await response.json();}catch(_){}const error=Error(body.error||'request_failed');error.status=response.status;error.path=path.split('?')[0];throw error;}return response.json();}
  function filters(){const q=new URLSearchParams();q.set('types',[...el('publicTypes').querySelectorAll('input:checked')].map(n=>n.value).join(','));
    if(el('publicQuery').value.trim())q.set('q',el('publicQuery').value.trim());state.filtersUI?.appendParams(q);if(state.areaPolygon)q.set('spatialPolygon',JSON.stringify(state.areaPolygon));return q;}
  function bounds(){const b=state.map.getBounds();return [Math.max(-180,b.getWest()),Math.max(-85.0511,b.getSouth()),Math.min(180,b.getEast()),Math.min(85.0511,b.getNorth())];}
  function maximumZoom(){return state.policy.max_zoom;}
  function anyTypes(){return el('publicTypes').querySelector('input:checked');}
  let resultsLocateController=null,resultsLocateSequence=0;
  function syncResultsLocate(){
    const button=el('publicResultsLocate');
    if(button)button.disabled=!state.map?.getSource('public-data')||!anyTypes()||!!resultsLocateController;
  }
  function cancelResultsLocate(){
    ++resultsLocateSequence;resultsLocateController?.abort();resultsLocateController=null;
    el('publicResultsLocate')?.removeAttribute('aria-busy');syncResultsLocate();
  }
  async function zoomToResults(){
    if(!state.map?.getSource('public-data')||!anyTypes())return;
    cancelResultsLocate();const sequence=resultsLocateSequence,controller=new AbortController();
    resultsLocateController=controller;const button=el('publicResultsLocate');
    button.setAttribute('aria-busy','true');syncResultsLocate();
    message('publicMapStatus','calculating_results_extent','Calculating results extent...');
    const params=filters();
    if(el('publicMapFilter').checked&&!state.areaPolygon)params.set('bbox',bounds().join(','));
    try{
      const data=await get('/bounds?'+params,controller.signal);
      if(sequence!==resultsLocateSequence)return;
      if(!data.mapped_records||!data.bbox){message('publicMapStatus','no_matching_records_on_map','No matching records are currently shown on the map.');return;}
      const [west,south,east,north]=data.bbox;
      if(data.bbox.length!==4||!data.bbox.every(Number.isFinite)||west>east||south>north)throw Error('Invalid results extent');
      state.map.fitBounds([[west,south],[east,north]],{
        padding:70,maxZoom:Math.min(maximumZoom(),state.map.getMaxZoom()),duration:650
      });
    }catch(error){
      if(error.name!=='AbortError'&&sequence===resultsLocateSequence){
        console.error('Public Viewer results bounds failed',error);
        message('publicMapStatus','results_extent_failed','Could not calculate the results extent.');
      }
    }finally{
      if(sequence===resultsLocateSequence){resultsLocateController=null;button.removeAttribute('aria-busy');syncResultsLocate();}
    }
  }
  async function loadList(){return state.groupsUI?.reload();}
  async function loadMap(){syncResultsLocate();if(!state.map?.getSource('public-data'))return;state.mapController?.abort();state.mapController=new AbortController();const controller=state.mapController,sequence=++state.mapSequence;state.mapLoading=false;
    if(!anyTypes()){state.mapFeatures=[];state.map.getSource('public-data')?.setData({type:'FeatureCollection',features:[]});(I?I.bind(el('publicMapStatus'),"public_select_at_least_one_layer",'Select at least one layer.',{},"textContent"):el('publicMapStatus').textContent=t("public_select_at_least_one_layer",'Select at least one layer.'));return;}
    const params=filters();const visible=state.tools?.visibleTypes();if(visible){const types=params.get('types').split(',').filter(t=>visible.includes(t));if(!types.length){state.mapFeatures=[];state.map.getSource('public-data').setData({type:'FeatureCollection',features:[]});(I?I.bind(el('publicMapStatus'),"public_no_visible_map_layers",'No visible map layers.',{},"textContent"):el('publicMapStatus').textContent=t("public_no_visible_map_layers",'No visible map layers.'));return;}params.set('types',types.join(','));}params.set('bbox',bounds().join(','));params.set('zoom',state.map.getZoom().toFixed(4));state.mapLoading=true;(I?I.bind(el('publicMapStatus'),"public_loading_map",'Loading map...',{},"textContent"):el('publicMapStatus').textContent=t("public_loading_map",'Loading map...'));
    try{const data=await get('/map?'+params,controller.signal);if(sequence!==state.mapSequence)return;state.mapFeatures=data.features;state.map.getSource('public-data').setData({type:'FeatureCollection',features:state.tools?state.tools.labelFeatures(data.features):data.features});
      const total=data.features.reduce((n,f)=>n+Number(f.properties.count||1),0);
      message('publicMapStatus',data.clustered?'public_mapped_grouped':'public_mapped_records',data.clustered?'{count} mapped records · grouped markers':'{count} mapped records',{count:total.toLocaleString(I?.locale())});
    }catch(error){if(error.name!=='AbortError'&&sequence===state.mapSequence){(I?I.bind(el('publicMapStatus'),"public_map_update_failed_the_previous_map_is_still_shown_try_a_smaller_area",'Map update failed; the previous map is still shown. Try a smaller area.',{},"textContent"):el('publicMapStatus').textContent=t("public_map_update_failed_the_previous_map_is_still_shown_try_a_smaller_area",'Map update failed; the previous map is still shown. Try a smaller area.'));}}finally{if(sequence===state.mapSequence)state.mapLoading=false;}}
  async function shapeImage(type,id,img){const key=type+'/'+id;try{
    let url=hoverBlobs.get(key);if(!url){const r=await fetch(api+'/shape/'+key,{credentials:'omit'});if(!r.ok)return;
      url=URL.createObjectURL(await r.blob());hoverBlobs.set(key,url);if(hoverBlobs.size>100){const [old,oldUrl]=hoverBlobs.entries().next().value;URL.revokeObjectURL(oldUrl);hoverBlobs.delete(old);}}
    img.src=url;img.hidden=false;
  }catch(_){} }
  function clearListPreview(){clearTimeout(previewTimer);listPreview?.remove();listPreview=null;
    if(previewAnchor){if(previewDescription)previewAnchor.setAttribute('aria-describedby',previewDescription);else previewAnchor.removeAttribute('aria-describedby');}
    previewAnchor=null;previewDescription=null;
  }
  function showListPreview(r,anchor){clearListPreview();if(!rs(r.record_type)||!anchor)return;
    previewTimer=setTimeout(async()=>{
      const box=node('div',undefined,'public-list-shape-preview');box.id='publicListShapePreview';box.setAttribute('role','tooltip');
      box.append(node('strong',label(r)),node('small',names[r.record_type]));
      const img=node('img');img.alt=t('public_shape_preview_for','Geometry shape preview for {label}',{label:label(r)});img.width=160;img.height=120;img.hidden=true;
      const status=uiNode('span',"public_loading_shape",'Loading shape...','public-preview-status');box.append(img,status);
      (document.fullscreenElement||document.body).append(box);listPreview=box;previewAnchor=anchor;previewDescription=anchor.getAttribute('aria-describedby');anchor.setAttribute('aria-describedby',box.id);
      const rect=anchor.getBoundingClientRect(),width=184,height=176,gap=10,vw=window.innerWidth||1024,vh=window.innerHeight||768;
      let x=rect.right+gap;if(x+width>vw-8)x=rect.left-width-gap;
      box.style.left=Math.max(8,Math.min(vw-width-8,x))+'px';box.style.top=Math.max(8,Math.min(vh-height-8,rect.top))+'px';
      await shapeImage(r.record_type,r.source_row_id,img);if(listPreview!==box)return;
      status.hidden=!img.hidden;if(img.hidden)(I?I.bind(status,"public_shape_preview_unavailable",'Shape preview unavailable',{},"textContent"):status.textContent=t("public_shape_preview_unavailable",'Shape preview unavailable'));
    },220);
  }
  window.addEventListener('scroll',clearListPreview,true);
  window.addEventListener('resize',clearListPreview);
  window.addEventListener('keydown',event=>{if(event.key==='Escape')clearListPreview();});
  const recordKey=r=>r.record_type+'/'+r.source_row_id;
  function rememberGeometry(r,geometry){if(!geometry)return;geometryCache.set(recordKey(r),geometry);if(geometryCache.size>100)geometryCache.delete(geometryCache.keys().next().value);}
  function cachedGeometry(r){return geometryCache.get(recordKey(r))||state.mapFeatures.find(f=>Number(f.properties.count||1)===1&&recordKey(f.properties)===recordKey(r))?.geometry;}
  function clearHover(){clearListPreview();++hoverVersion;clearTimeout(hoverTimer);hoverController?.abort();state.tools?.setHovered(null);}
  function hoverRecord(r,geometry){clearHover();const version=hoverVersion;const g=cachedGeometry(r)||geometry;
    if(g){state.tools?.setHovered(g,r);return;}
    hoverTimer=setTimeout(async()=>{hoverController=new AbortController();try{const data=await get('/geometry/'+r.record_type+'/'+encodeURIComponent(r.source_row_id),hoverController.signal);
      if(version!==hoverVersion)return;rememberGeometry(r,data.geometry);state.tools?.setHovered(data.geometry,r);
    }catch(_){}},180);
  }

  async function selectGeometry(r,center,seq,signal){
    if(!state.map)return;state.tools?.setSelected(cachedGeometry(r)||null,r);
    try{const loc=await get('/geometry/'+r.record_type+'/'+encodeURIComponent(r.source_row_id),signal);if(seq!==state.detailSequence)return;
      rememberGeometry(r,loc.geometry);state.tools?.setSelected(loc.geometry,r);
      if(center&&loc.geometry){const box=new maplibregl.LngLatBounds();const walk=g=>{if(g.coordinates){const coords=c=>{if(typeof c[0]==='number')box.extend(c);else c.forEach(coords);};coords(g.coordinates);}else g.geometries?.forEach(walk);};walk(loc.geometry);
        if(!box.isEmpty())state.map.fitBounds(box,{padding:70,maxZoom:state.map.getMaxZoom(),duration:500});}
    }catch(error){if(seq===state.detailSequence&&error.name!=='AbortError'&&error.status!==404)console.error('Public Viewer selection geometry failed',error);}
  }

  // Locate a result without opening details or changing the selected record.
  let locateSequence=0;
  async function locateRecord(r){
    const sequence=++locateSequence;
    if(!state.map?.getSource('public-data')){(I?I.bind(el('publicMapStatus'),"public_map_is_not_ready_yet",'Map is not ready yet.',{},"textContent"):el('publicMapStatus').textContent=t("public_map_is_not_ready_yet",'Map is not ready yet.'));return false;}
    clearHover();
    try{
      const data=await get('/geometry/'+r.record_type+'/'+encodeURIComponent(r.source_row_id));
      if(sequence!==locateSequence)return false;
      const box=new maplibregl.LngLatBounds();
      const walk=g=>{if(!g)return;if(g.coordinates){const coords=c=>{if(typeof c[0]==='number'){if(Number.isFinite(c[0])&&Number.isFinite(c[1]))box.extend(c.slice(0,2));}else c.forEach(coords);};coords(g.coordinates);}else g.geometries?.forEach(walk);};
      walk(data.geometry);
      if(box.isEmpty()){(I?I.bind(el('publicMapStatus'),"public_no_map_location_is_available_for_this_record",'No map location is available for this record.',{},"textContent"):el('publicMapStatus').textContent=t("public_no_map_location_is_available_for_this_record",'No map location is available for this record.'));return false;}
      rememberGeometry(r,data.geometry);
      state.map.fitBounds(box,{padding:70,maxZoom:state.map.getMaxZoom(),duration:500});
      return true;
    }catch(error){
      if(sequence===locateSequence)el('publicMapStatus').textContent=error.status===404?t('public_no_record_location','No map location is available for this record.'):t('public_location_load_failed','Location could not be loaded. Try again.');
      return false;
    }
  }

  function makePopupMovable(recordPopup,box){
    const handle=node('button',undefined,'public-popup-drag-handle');handle.type='button';
    (I?I.bind(handle,"public_move_record_list_drag_or_use_arrow_keys_when_focused",'Move record list: drag, or use arrow keys when focused',{},"title"):handle.title=t("public_move_record_list_drag_or_use_arrow_keys_when_focused",'Move record list: drag, or use arrow keys when focused'));handle.setAttribute('aria-label','Move record list: drag or use arrow keys');
    const grip=node('span','⠿','public-popup-drag-grip');grip.setAttribute('aria-hidden','true');handle.append(grip);
    const header=node('div',undefined,'public-popup-header'),count=box.firstElementChild;
    const close=node('button','×','public-popup-close');close.type='button';(I?I.bind(close,"public_close_record_list",'Close record list',{},"title"):close.title=t("public_close_record_list",'Close record list'));close.setAttribute('aria-label','Close record list');close.onclick=()=>recordPopup.remove();
    header.append(handle,count,close);box.prepend(header);
    let offset=[0,0],drag=null;
    function move(x,y){
      const root=recordPopup.getElement(),rect=root.getBoundingClientRect?.(),bounds=state.map.getContainer?.().getBoundingClientRect?.();
      // Keep the drag handle reachable inside the map, even for a long list.
      if(rect?.width&&bounds?.width){
        const dx=x-offset[0],dy=y-offset[1];
        x=offset[0]+Math.min(Math.max(dx,bounds.left-rect.left),Math.max(bounds.left,bounds.right-rect.width)-rect.left);
        y=offset[1]+Math.min(Math.max(dy,bounds.top-rect.top),bounds.bottom-40-rect.top);
      }
      offset=[x,y];recordPopup.setOffset(offset);root.classList.add('is-moved');
    }
    handle.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();
      clearListPreview();handle.focus();drag={id:event.pointerId,x:event.clientX,y:event.clientY,offset:[...offset]};handle.setPointerCapture?.(event.pointerId);handle.classList.add('is-dragging');};
    handle.onpointermove=event=>{if(!drag||drag.id!==event.pointerId)return;event.preventDefault();event.stopPropagation();move(drag.offset[0]+event.clientX-drag.x,drag.offset[1]+event.clientY-drag.y);};
    const stop=event=>{if(drag&&event.pointerId===drag.id){drag=null;handle.classList.remove('is-dragging');}};
    handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=stop;
    handle.onkeydown=event=>{const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},d=directions[event.key];
      if(!d)return;event.preventDefault();event.stopPropagation();const step=event.shiftKey?40:10;move(offset[0]+d[0]*step,offset[1]+d[1]*step);};
    for(const name of ['mousedown','touchstart','click','dblclick'])handle.addEventListener(name,event=>event.stopPropagation());
    recordPopup.on('close',()=>{drag=null;handle.classList.remove('is-dragging');});
  }

  async function openRecord(r,center=false){
    const seq=++state.detailSequence;
    if(state.mapLoading){mapPausedForDetails=true;state.mapController?.abort();++state.mapSequence;state.mapLoading=false;(I?I.bind(el('publicMapStatus'),"public_map_update_paused_while_the_record_loads",'Map update paused while the record loads.',{},"textContent"):el('publicMapStatus').textContent=t("public_map_update_paused_while_the_record_loads",'Map update paused while the record loads.'));}
    state.detailController?.abort();state.detailController=new AbortController();const signal=state.detailController.signal;
    state.selected=r;clearHover();detailsUI?.clear();
    state.tools?.setSelected(cachedGeometry(r)||null,r);
    window.viewerDetailPanel?.select(r.record_type+'/'+r.source_row_id);
    window.viewerDetailPanel?.open();state.tools?.refreshData();
    document.querySelectorAll('.public-record').forEach(b=>b.classList.toggle('is-selected',b.dataset.recordKey===r.record_type+'/'+r.source_row_id));
    el('publicClose').hidden=false;const pane=el('publicDetails');pane.replaceChildren(uiNode('p',"public_loading_record",'Loading record...'));
    try{
      const data=await get('/records/'+r.record_type+'/'+encodeURIComponent(r.source_row_id),signal);
      if(seq!==state.detailSequence)return;
      // Show the record immediately. Relationships, labels and map centring are independent.
      detailsUI.render(pane,data.record,{relationships:[],loading:true});
      void selectGeometry(r,center,seq,signal);
      get('/relationships/'+r.record_type+'/'+encodeURIComponent(r.source_row_id),signal)
       .then(relationships=>{if(seq===state.detailSequence)detailsUI.updateRelationships(r,relationships);})
       .catch(error=>{if(error.name!=='AbortError'&&seq===state.detailSequence)detailsUI.updateRelationships(r,{relationships:[],failed:true});});
    }catch(error){if(error.name!=='AbortError'&&seq===state.detailSequence)pane.replaceChildren(uiNode('p',"public_record_could_not_be_loaded",'Record could not be loaded.'));}
    finally{if(seq===state.detailSequence&&mapPausedForDetails){mapPausedForDetails=false;void loadMap();}}
  }

  function osmStyle(){return {version:8,glyphs:'https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=wZNaIRIPfJrrJLopqgo0',sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}},layers:[{id:'osm',type:'raster',source:'osm'}]};
  }

  function basemapStyle(){
    const choice=el('basemapSelect').value;
    if(choice==='osm')return osmStyle();
    // Match the basemap already used by the authenticated Viewer.
    return 'https://api.maptiler.com/maps/'+choice.replace('maptiler-','')+'/style.json?key=wZNaIRIPfJrrJLopqgo0';
  }

  function mapError(error){
    console.error('Public Viewer map could not start or load:',error);
    el('publicMapError').hidden=false;
    el('publicMapError').textContent=t('public_map_load_failed','The map could not be loaded. Try OpenStreetMap in the basemap selector.')+(state.policy?.preview?' Local diagnostic: '+(error?.message||'Unknown map error'):'');
    (I?I.bind(el('publicMapStatus'),"public_map_unavailable_you_can_still_browse_records",'Map unavailable. You can still browse records.',{},"textContent"):el('publicMapStatus').textContent=t("public_map_unavailable_you_can_still_browse_records",'Map unavailable. You can still browse records.'));
  }

  function initMap(){
    if(!window.maplibregl)throw new Error('MapLibre did not load. Check the map script request in the browser Network tab.');
    if(!Number.isFinite(maximumZoom())||maximumZoom()<0||maximumZoom()>22)throw new Error('Invalid public map zoom policy.');
    state.map=new maplibregl.Map({container:'publicMap',style:basemapStyle(),center:[66.9,42.5],zoom:4,maxZoom:maximumZoom(),maxPitch:0,renderWorldCopies:false});
    state.map.dragRotate.disable();state.map.touchZoomRotate.disableRotation();state.map.addControl(new maplibregl.NavigationControl({showCompass:true}));state.map.addControl(new maplibregl.FullscreenControl({container:document.querySelector('.map-pane-body')}));state.map.addControl(new maplibregl.ScaleControl());
    const compass=el('publicMap').querySelector('.maplibregl-ctrl-compass');if(compass){compass.disabled=true;(I?I.bind(compass,"public_rotation_is_disabled_in_the_public_viewer",'Rotation is disabled in the public Viewer',{},"title"):compass.title=t("public_rotation_is_disabled_in_the_public_viewer",'Rotation is disabled in the public Viewer'));}
    state.tools=window.createPublicViewerTools({map:state.map,names,colors,onArea:g=>{state.areaPolygon=g;reload();},getFeatures:()=>state.mapFeatures,getSelected:()=>state.selected,onMapChange:()=>loadMap(),onBasemap:()=>{cancelResultsLocate();clearHover();state.mapController?.abort();popup?.remove();selectionPopup?.remove();state.map.setStyle(basemapStyle());syncResultsLocate();}});
    state.map.on('error',event=>mapError(event.error));
    state.map.on('style.load',()=>{el('publicMapError').hidden=true;state.map.addSource('public-data',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      const color=['match',['get','record_type'],...Object.entries(colors).flat(), '#487061'];
      state.map.addLayer({id:'public-fill',type:'fill',source:'public-data',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':color,'fill-opacity':.08}});
      state.map.addLayer({id:'public-line-casing',type:'line',source:'public-data',filter:['in',['geometry-type'],['literal',['Polygon','LineString']]],paint:{'line-color':'#fff1d6','line-width':['match',['get','record_type'],'rs3_line',2.1,'rs3_group',1.8,1.4],'line-opacity':.85}});
      state.map.addLayer({id:'public-line',type:'line',source:'public-data',filter:['in',['geometry-type'],['literal',['Polygon','LineString']]],paint:{'line-color':color,'line-width':['match',['get','record_type'],'rs3_line',1.5,'rs3_group',1.2,0.8]}});
      state.map.addLayer({
        id:'public-point',
        type:'circle',
        source:'public-data',
        filter:['==',['geometry-type'],'Point'],
        layout:{'circle-sort-key':['coalesce',['get','public_draw_order'],['case',['==',['get','record_type'],'institution'],1,0]]},
        paint:{'circle-color':color,
          'circle-radius':['case',['>', ['get','count'],1],['step',['to-number',['get','count'],1],12,20,15,100,19,500,24,1500,30,5000,36],['match',['get','record_type'],'rs3_poly',3,'rs3_line',3,'rs3_group',3,5]],
          'circle-stroke-color':'#fff1d6',
          'circle-stroke-width':['case',['>',['get','count'],1],0.75,0.5],
          'circle-opacity':.85}});
      // Wider invisible targets improve interaction without enlarging the symbols.
      state.map.addLayer({id:'public-line-hit',type:'line',source:'public-data',filter:['in',['geometry-type'],['literal',['Polygon','LineString']]],paint:{'line-width':8,'line-opacity':0}});
      state.map.addLayer({id:'public-point-hit',type:'circle',source:'public-data',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':['case',['>',['get','count'],1],['step',['to-number',['get','count'],1],12,20,15,100,19,500,24,1500,30,5000,36],8],'circle-opacity':0,'circle-stroke-width':0}});
      state.tools.restoreLayers();relatedMap?.restore();
      if(!state.mapInteractionsInstalled){state.mapInteractionsInstalled=true;
      state.map.on('click',event=>{
        if(event.publicViewerDrawing||state.tools?.isDrawing())return;
        const p=event.point;
        const hits=state.map.queryRenderedFeatures([[p.x-mapPickTolerance,p.y-mapPickTolerance],[p.x+mapPickTolerance,p.y+mapPickTolerance]],{layers:['public-point-hit','public-line-hit','public-fill','public-related-points','public-related-outline','public-related-fill']});
        const records=new Map(),clusters=new Map();
        for(const f of hits){const props=f.properties;if(Number(props.count)>1){clusters.set(props.cluster_id||props.record_type+':'+JSON.stringify(f.geometry.coordinates),f);continue;}
          if(props.source_row_id!=null)records.set(props.record_type+'/'+props.source_row_id,f);}
        clearHover();selectionPopup?.remove();popup?.remove();
        if(!records.size&&!clusters.size)return;
        const choose=f=>{selectionPopup?.remove();clearHover();void openRecord(f.properties,false);};
        const box=node('div',undefined,'public-map-picks');
        const represented=records.size+[...clusters.values()].reduce((n,f)=>n+Number(f.properties.count),0);
        box.append(node('strong',represented===1?t('public_record_here','1 record here'):t('public_records_here','{count} records here',{count:represented.toLocaleString(I?.locale())})));
        const list=node('div',undefined,'public-popup-list');box.append(list);
        const grouped=new Map();for(const f of [...records.values(),...clusters.values()]){const type=f.properties.record_type;if(!grouped.has(type))grouped.set(type,[]);grouped.get(type).push(f);}
        for(const [type,features] of grouped){const group=node('details',undefined,'public-map-pick-group');group.open=true;
          group.append(node('summary',names[type]+' ('+features.reduce((n,f)=>n+Number(f.properties.count||1),0).toLocaleString()+')'));
          for(const f of features){if(Number(f.properties.count)>1){const groupedButton=node('button',t('public_grouped_zoom','{count} grouped records - zoom in',{count:Number(f.properties.count).toLocaleString(I?.locale())}),'action-btn public-map-pick');groupedButton.type='button';groupedButton.onclick=()=>{selectionPopup?.remove();state.map.easeTo({center:f.geometry.coordinates,zoom:Math.min(state.map.getZoom()+1,state.map.getMaxZoom())});};group.append(groupedButton);continue;}const b=node('button',label(f.properties),'action-btn public-map-pick');b.type='button';b.dataset.recordKey=recordKey(f.properties);b.classList.toggle('is-selected',!!state.selected&&recordKey(state.selected)===recordKey(f.properties));b.setAttribute('aria-pressed',String(b.classList.contains('is-selected')));if(f.properties.caal_id&&label(f.properties)!==f.properties.caal_id)b.append(node('small',f.properties.caal_id));b.onmouseenter=b.onfocus=()=>{hoverRecord(f.properties,f.geometry);showListPreview(f.properties,b);};b.onmouseleave=b.onblur=clearHover;b.onclick=()=>choose(f);group.append(b);}
          list.append(group);}
        selectionPopup=new maplibregl.Popup({closeButton:false,closeOnClick:true,maxWidth:'320px',className:'public-draggable-popup'}).setLngLat(event.lngLat).setDOMContent(box).addTo(state.map);selectionPopup.on('close',clearHover);makePopupMovable(selectionPopup,box);
      });
      let hoverKey=null;
      state.map.on('mousemove',event=>{
        if(state.tools?.isDrawing()||!event.point||event.originalEvent?.target?.closest?.('.maplibregl-popup'))return;
        const p=event.point,hits=state.map.queryRenderedFeatures([[p.x-3,p.y-3],[p.x+3,p.y+3]],{layers:['public-point-hit','public-line-hit','public-fill','public-related-points','public-related-outline','public-related-fill']});
        const f=hits[0];if(!f){hoverKey=null;popup?.remove();state.map.getCanvas().style.cursor='';return;}
        state.map.getCanvas().style.cursor='pointer';const props=f.properties;
        const key=Number(props.count)>1?(props.cluster_id||props.record_type+JSON.stringify(f.geometry.coordinates)):recordKey(props);
        if(key===hoverKey&&popup?.isOpen?.())return;hoverKey=key;popup?.remove();
        const box=node('div',undefined,'public-popup');box.append(node('strong',Number(props.count)>1?`${props.count} ${names[props.record_type]}`:label(props)));
        if(Number(props.count)>1)box.append(uiNode('span',"public_click_to_browse_nearby_records_or_zoom_in",'Click to browse nearby records or zoom in.'));
        else {box.append(node('small',names[props.record_type]||props.record_type));if(props.caal_id&&label(props)!==props.caal_id)box.append(node('div',props.caal_id));}
        if(Number(props.count||1)===1&&rs(props.record_type)){const img=node('img');img.alt=t('public_shape_preview','Geometry shape preview');img.hidden=true;box.append(img);void shapeImage(props.record_type,props.source_row_id,img);}
        popup=new maplibregl.Popup({closeButton:false,closeOnClick:false}).setLngLat(event.lngLat).setDOMContent(box).addTo(state.map);
      });
      state.map.getCanvas().addEventListener('mouseleave',()=>{hoverKey=null;popup?.remove();state.map.getCanvas().style.cursor='';});
      }
      void loadMap();releaseInitialMapStart();});
    state.map.on('movestart',clearListPreview);
    state.map.on('moveend',()=>{clearTimeout(mapTimer);mapTimer=setTimeout(()=>{void loadMap();if(el('publicMapFilter').checked){resetPaging();void loadList();}},350);});
  }
  function resetPaging(){state.offset=0;state.cursor=null;state.nextCursor=null;state.cursorHistory=[];}

  function reload(){cancelResultsLocate();clearHover();resetPaging();state.filtersUI?.render();void loadMap();void loadList();}

  async function init(){
    try{
    relatedMap=window.createPublicViewerRelatedMap({getMap:()=>state.map,get,colors,status:message=>el('publicMapStatus').textContent=message});
    detailsUI=window.createPublicViewerDetails({get,onOpen:openRecord,onLocate:locateRecord,onShowRelated:(record,relations)=>relatedMap.show(record,relations),onClearRelated:()=>relatedMap.clear(),onRelatedVisibility:value=>relatedMap.setVisibility(value)});
    const [policy]=await Promise.all([get('/policy'),I?.load()]);state.policy=policy.policy;el('publicPreview').hidden=!state.policy.preview;
    const allowed=new Set(state.policy.record_types);
    for(const input of el('publicTypes').querySelectorAll('input')){
      input.disabled=!allowed.has(input.value);input.checked=!input.disabled;input.onchange=reload;
    }
    el('publicSearch').onsubmit=e=>{e.preventDefault();reload();};el('publicQuery').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(reload,400);};el('publicMapFilter').onchange=reload;
    el('publicRefreshGroups').onclick=reload;
    el('publicResultsLocate').onclick=zoomToResults;
    el('publicRetryResults').onclick=()=>loadList();
    el('publicClear').onclick=()=>{el('publicQuery').value='';state.filtersUI?.clear();state.areaPolygon=null;state.tools?.clearArea();el('publicMapFilter').checked=false;el('publicTypes').querySelectorAll('input').forEach(n=>n.checked=!n.disabled);reload();};
    el('publicClose').onclick=()=>{++state.detailSequence;state.detailController?.abort();state.selected=null;clearHover();detailsUI?.clear();if(mapPausedForDetails){mapPausedForDetails=false;void loadMap();}state.tools?.setSelected(null,{});window.viewerDetailPanel?.clear();document.querySelectorAll('.public-record').forEach(b=>b.classList.remove('is-selected'));el('publicDetails').replaceChildren(uiNode('p',"public_select_a_record_to_explore_its_details",'Select a record to explore its details.'));el('publicClose').hidden=true;};
    state.filtersUI=window.createPublicViewerFiltersUI({onChange:reload,getTypes:()=>[...el('publicTypes').querySelectorAll('input:checked')].map(i=>i.value),getText:()=>el('publicQuery').value.trim(),getArea:()=>state.areaPolygon,clearArea:()=>{state.areaPolygon=null;state.tools?.clearArea();},get});
    state.groupsUI=window.createPublicViewerGroups({
      get,filters,names,label,onOpen:openRecord,onLocate:locateRecord,getSelected:()=>state.selected,onHover:(r,b)=>{hoverRecord(r);showListPreview(r,b);},onHoverEnd:clearHover,beforeCounts:()=>initialMapStarted});
    // The list remains usable if the browser cannot initialise the map.
    initialMapTimer=setTimeout(releaseInitialMapStart,1500);
    try{initMap();}catch(error){mapError(error);releaseInitialMapStart();}void loadList();
    let countryVersion=0;
    async function localiseCountries(){const sequence=++countryVersion;try{const data=await get('/countries');if(sequence!==countryVersion)return;const select=el('viewerFilterCountry'),existing=new Map([...select.options].map(o=>[o.value,o]));for(const item of data.options||data.countries.map(value=>({value,label:value}))){let option=existing.get(item.value);if(!option){option=node('option');option.value=item.value;select.append(option);}option.textContent=item.label;}state.filtersUI?.render();}catch{}}
    void localiseCountries();
    I?.onChange(()=>{state.groupsUI?.relabel();state.tools?.relabel();clearHover();selectionPopup?.remove();popup?.remove();return localiseCountries();});
    I?.apply();
  }catch(error){console.error('Public Viewer initialisation failed:',error);el('publicResultsStatus').textContent=error.message==='public_viewer_not_enabled'?t('public_not_enabled','The public Viewer is not enabled yet.'):t('public_temporarily_unavailable','The Viewer is temporarily unavailable.');(I?I.bind(el('publicMapStatus'),"public_viewer_unavailable",'Viewer unavailable.',{},"textContent"):el('publicMapStatus').textContent=t("public_viewer_unavailable",'Viewer unavailable.'));}}
  window.addEventListener('viewer:layoutchange',()=>state.map?.resize());
  void init();
})();
