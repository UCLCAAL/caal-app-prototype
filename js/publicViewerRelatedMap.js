(() => {
'use strict';
window.createPublicViewerRelatedMap=({getMap,get,colors,status})=>{
 let version=0,features=[],visibility={records:true,lines:true};
 const collection=()=>({type:'FeatureCollection',features:features.filter(f=>f.properties.relationship_line?visibility.lines:visibility.records)});
 function restore(){const map=getMap();if(!map?.getSource('public-data'))return;
  if(!map.getSource('public-related'))map.addSource('public-related',{type:'geojson',data:collection()});
  const color=['match',['get','record_type'],...Object.entries(colors).flat(),'#487061'];
  const layers=[
   {id:'public-related-fill',type:'fill',source:'public-related',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':color,'fill-opacity':.15}},
   {id:'public-related-outline',type:'line',source:'public-related',filter:['all',['!',['has','relationship_line']],['in',['geometry-type'],['literal',['Polygon','LineString']]]],paint:{'line-color':color,'line-width':2}},
   {id:'public-related-points',type:'circle',source:'public-related',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':color,'circle-radius':5,'circle-stroke-color':'#fff1d6','circle-stroke-width':.75}},
   {id:'public-relationship-lines',type:'line',source:'public-related',filter:['has','relationship_line'],paint:{'line-color':'#496b60','line-width':1.5,'line-dasharray':[3,2]}}
  ];for(const layer of layers)if(!map.getLayer(layer.id))map.addLayer(layer,map.getLayer('public-selected-fill')?'public-selected-fill':undefined);
  map.getSource('public-related').setData(collection());
 }
 function coordinates(g,out=[]){if(!g)return out;if(g.coordinates){const walk=c=>{if(typeof c[0]==='number'){if(Number.isFinite(c[0])&&Number.isFinite(c[1]))out.push(c.slice(0,2));}else c.forEach(walk);};walk(g.coordinates);}else g.geometries?.forEach(v=>coordinates(v,out));return out;}
 function anchor(g){const coords=coordinates(g);if(!coords.length)return null;let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;for(const [x,y] of coords){west=Math.min(west,x);east=Math.max(east,x);south=Math.min(south,y);north=Math.max(north,y);}return [(west+east)/2,(south+north)/2];}
 function clear(){++version;features=[];getMap()?.getSource('public-related')?.setData(collection());}
 async function show(record,relations){
  const map=getMap();if(!map?.getSource('public-data')){status('Map is not ready yet.');return false;}
  clear();const current=version;visibility={records:true,lines:true};status('Loading related map locations...');
  let origin=null;try{origin=anchor((await get('/geometry/'+record.record_type+'/'+encodeURIComponent(record.source_row_id))).geometry);}catch{}
  if(current!==version)return false;
  const seen=new Set(),items=relations.filter(r=>{const key=r.record_type+'/'+r.source_row_id;if(seen.has(key))return false;seen.add(key);return true;}),loaded=[];let index=0;
  async function worker(){while(current===version&&index<items.length){const r=items[index++];try{const data=await get('/geometry/'+r.record_type+'/'+encodeURIComponent(r.source_row_id));if(data.geometry)loaded.push({r,geometry:data.geometry});}catch{}}}
  await Promise.all([worker(),worker()]);if(current!==version)return false;
  features=loaded.flatMap(({r,geometry})=>{const out=[{type:'Feature',geometry,properties:{record_type:r.record_type,source_row_id:r.source_row_id,caal_id:r.caal_id,display_label:r.display_label,count:1}}];const dest=anchor(geometry);if(origin&&dest)out.push({type:'Feature',geometry:{type:'LineString',coordinates:[origin,dest]},properties:{relationship_line:true}});return out;});
  restore();const box=new maplibregl.LngLatBounds();if(origin)box.extend(origin);for(const f of features)for(const coord of coordinates(f.geometry))box.extend(coord);
  if(!box.isEmpty())map.fitBounds(box,{padding:70,maxZoom:map.getMaxZoom(),duration:500});
  status(loaded.length+' related records mapped'+(loaded.length<items.length?' ('+(items.length-loaded.length)+' without available map geometry)':''));
  return loaded.length>0;
 }
 return {show,clear,restore,setVisibility(value){visibility=value;getMap()?.getSource('public-related')?.setData(collection());}};
};
})();
