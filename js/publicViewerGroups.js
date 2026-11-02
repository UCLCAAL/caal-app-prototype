(() => {
 'use strict';
 window.createPublicViewerGroups=({get,filters,names,label,onOpen,onLocate,getSelected,onHover,onHoverEnd,beforeCounts=()=>Promise.resolve()})=>{
  const host=document.getElementById('publicResults'),status=document.getElementById('publicResultsStatus'),retry=document.getElementById('publicRetryResults');
  const order=['monument','archive','rs3_poly','rs3_line','rs3_group','institution','vernacular','dataset','cartography'];
  function uiNode(tag,key,text,cls){const n=node(tag,undefined,cls);if(I)I.bind(n,key,text);else n.textContent=t(key,text);return n;}
 const I=window.publicViewerI18n,t=(key,fallback,vars={})=>I?.t(key,fallback,vars)||String(fallback||key).replace(/\{(\w+)\}/g,(all,k)=>vars[k]??all);
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  let groups=new Map(),version=0,countController=null;
  function paramsFor(type){const p=filters();p.set('types',type);return p;}
  function updateSummary(){const all=[...groups.values()];const complete=all.every(g=>g.count!==null);
   const failures=all.some(g=>g.countError);retry.hidden=!failures;
   status.textContent=complete?t('public_records_count','{count} records',{count:all.reduce((n,g)=>n+g.count,0).toLocaleString(I?.locale())}):failures?t('public_count_failed','Some group counts could not be loaded. Open a group to browse or retry.'):t('public_loading_counts','Loading record counts...');
  }
  function updateCount(g){g.countNode.textContent=g.count===null?(g.countError?t('public_unavailable','Unavailable'):'...'):g.count.toLocaleString(I?.locale());g.countNode.title=g.countError?t('public_count_unavailable','Count could not be loaded'):'';}
  function pageText(g){const total=g.count===null?null:Math.max(1,Math.ceil(g.count/50));return total===null?t('page_x','Page {page}',{page:g.page}):t('page_x_of_y','Page {page} of {total}',{page:g.page,total});}
  function renderBody(g){
   g.body.hidden=g.collapsed;g.header.setAttribute('aria-expanded',String(!g.collapsed));
   if(g.collapsed)return;
   g.body.replaceChildren();
   const paging=node('div',undefined,'pagination-bar viewer-result-group-pagination');
   const prev=uiNode('button',"previous",'Previous','action-btn viewer-group-page-btn');prev.type='button';prev.disabled=g.loading||!g.history.length;
   const next=uiNode('button',"next",'Next','action-btn viewer-group-page-btn');next.type='button';next.disabled=g.loading||!g.more;
   const page=node('span',undefined,'viewer-result-group-page-info');
   page.textContent=pageText(g);g.pageInfo=page;
   prev.onclick=()=>{g.cursor=g.history.pop();g.page--;void loadGroup(g);};
   next.onclick=()=>{g.history.push(g.cursor);g.cursor=g.nextCursor;g.page++;void loadGroup(g);};
   paging.append(prev,page,next);g.body.append(paging);
   if(g.loading){g.body.append(uiNode('p',"loading_records",'Loading records...','section-empty'));return;}
   if(g.error){const message=uiNode('p',"public_records_could_not_be_loaded",'Records could not be loaded.','section-empty');const b=uiNode('button',"public_retry",'Retry','action-btn');b.type='button';b.onclick=()=>loadGroup(g);g.body.append(message,b);return;}
   if(!g.records.length){g.body.append(uiNode('p',"no_matching_records",'No matching records.','section-empty'));return;}
   const list=node('div',undefined,'viewer-result-group-list');g.body.append(list);
   for(const r of g.records){
    const b=node('div',undefined,'public-record result-card viewer-result-card');b.dataset.recordKey=r.record_type+'/'+r.source_row_id;
    const selected=getSelected();b.classList.toggle('is-selected',!!selected&&b.dataset.recordKey===selected.record_type+'/'+selected.source_row_id);
    const open=node('button',undefined,'public-record-open');open.type='button';
    open.append(node('strong',label(r)),node('small',r.caal_id,'result-card-meta'));open.onclick=()=>onOpen(r,true);
    open.onmouseenter=open.onfocus=()=>onHover?.(r,open);open.onmouseleave=open.onblur=()=>onHoverEnd?.();
    const locate=node('button',undefined,'public-record-target');locate.type='button';
    const locateLabel=t('public_show_record_on_map','Show {label} on map',{label:label(r)});locate.title=locateLabel;locate.setAttribute('aria-label',locateLabel);
    locate.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>';
    locate.onclick=async event=>{event?.stopPropagation();if(locate.disabled)return;onHoverEnd?.();locate.disabled=true;locate.setAttribute('aria-busy','true');
     try{const ok=await onLocate?.(r);locate.title=ok===false?t('public_location_unavailable','Location unavailable'):locateLabel;}
     catch(_){(I?I.bind(locate,"public_location_could_not_be_loaded_try_again",'Location could not be loaded. Try again.',{},"title"):locate.title=t("public_location_could_not_be_loaded_try_again",'Location could not be loaded. Try again.'));}
     finally{locate.disabled=false;locate.removeAttribute('aria-busy');}
    };
    b.append(open,locate);list.append(b);
   }
  }
  async function loadGroup(g){
   g.controller?.abort();g.controller=new AbortController();const current=version;const request=++g.request;
   g.loading=true;g.error=false;renderBody(g);
   const p=paramsFor(g.type);if(g.cursor)p.set('cursor',g.cursor);
   try{const data=await get('/records?'+p,g.controller.signal);if(current!==version||request!==g.request)return;
    g.records=data.records;g.more=data.has_more;g.nextCursor=data.next_cursor;g.loaded=true;
   }catch(error){if(error.name==='AbortError')return;if(current!==version||request!==g.request)return;g.error=true;console.error('Public Viewer group failed',g.type,error);}
   finally{if(current===version&&request===g.request){g.loading=false;renderBody(g);}}
  }
  function addGroup(type,collapsed){
   const g={type,collapsed,count:null,countError:false,records:[],cursor:null,nextCursor:null,history:[],page:1,loaded:false,more:false,loading:false,error:false,request:0,controller:null};
   const section=node('section',undefined,'viewer-result-group');section.dataset.viewerResultGroup=type;
   const header=node('button',undefined,'viewer-result-group-header');header.type='button';header.setAttribute('aria-expanded',String(!collapsed));
   const icon=node('span',undefined,'viewer-layer-icon viewer-layer-icon-'+type);
   const svg=document.querySelector('#publicTypes input[value="'+type+'"]')?.parentElement.querySelector('svg');if(svg)icon.append(svg.cloneNode(true));
   const title=node('span',names[type],'viewer-result-group-title');g.titleNode=title;g.countNode=node('span','...','viewer-result-group-count');
   const chevron=node('span',undefined,'viewer-result-group-chevron');chevron.setAttribute('aria-hidden','true');header.append(icon,title,g.countNode,chevron);
   g.header=header;g.body=node('div',undefined,'viewer-result-group-body');g.body.id='publicGroup_'+type;g.body.hidden=collapsed;header.setAttribute('aria-controls',g.body.id);
   header.onclick=()=>{g.collapsed=!g.collapsed;renderBody(g);if(!g.collapsed&&!g.loaded&&!g.loading)void loadGroup(g);};
   section.append(header,g.body);host.append(section);return g;
  }
  async function reload(){
   const current=++version;document.getElementById('publicRefreshGroups').disabled=true;countController?.abort();countController=new AbortController();const previous=groups;
   for(const g of previous.values())g.controller?.abort();
   groups=new Map();host.replaceChildren();retry.hidden=true;
   const selected=new Set((filters().get('types')||'').split(','));
   for(const type of order)if(selected.has(type))groups.set(type,addGroup(type,previous.get(type)?.collapsed??true));
   if(!groups.size){const note=document.getElementById('publicFilterApplicabilityNote');if(note&&!note.hidden){status.textContent=note.textContent;document.getElementById('publicRefreshGroups').disabled=false;return;}(I?I.bind(status,"public_select_at_least_one_layer",'Select at least one layer.',{},"textContent"):status.textContent=t("public_select_at_least_one_layer",'Select at least one layer.'));document.getElementById('publicRefreshGroups').disabled=false;return;}
   updateSummary();
   for(const g of groups.values())if(!g.collapsed)void loadGroup(g);
   // Let the initial map request start before background counts. This does not
   // wait for its response. Two workers avoid a nine-request database queue.
   const controller=countController,queue=[...groups.values()];let next=0;
   await beforeCounts();if(current!==version||controller.signal.aborted)return;
   async function countWorker(){
    while(current===version&&!controller.signal.aborted&&next<queue.length){
     const g=queue[next++];
     try{const data=await get('/counts?'+paramsFor(g.type),controller.signal);if(current!==version)return;
      g.count=Number(data.count);
     }catch(error){if(error.name==='AbortError'||current!==version)return;g.countError=true;console.error('Public Viewer group count failed',g.type,error);}
    }
   }
   await Promise.all([countWorker(),countWorker()]);
   if(current!==version||controller.signal.aborted)return;
   // Publish one coherent set instead of visibly walking down the layer list.
   for(const g of queue){updateCount(g);if(g.pageInfo)g.pageInfo.textContent=pageText(g);}
   updateSummary();document.getElementById('publicRefreshGroups').disabled=false;
  }
  return {reload,relabel(){for(const g of groups.values()){g.titleNode.textContent=names[g.type];updateCount(g);renderBody(g);}updateSummary();}};
 };
})();
