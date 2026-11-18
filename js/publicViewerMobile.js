(() => {
  'use strict';
  const shell=document.getElementById('publicViewerPage');if(!shell)return;
  const body=document.body,header=document.querySelector('.app-header');
  const menu=document.getElementById('publicMobileMenu'),menuContent=document.getElementById('publicMobileMenuContent');
  const navigation=document.getElementById('publicMobileNavigation');
  const panes={browse:shell.querySelector('.browse-pane'),map:shell.querySelector('.map-pane'),record:document.getElementById('viewerDetailPane')};
  const buttons=[...navigation.querySelectorAll('[data-public-mobile-view]')];
  const query=window.matchMedia('(max-width: 760px), (max-width: 1024px) and (max-height: 520px) and (pointer: coarse)');
  const paneSemantics=new Map(Object.values(panes).map(pane=>[pane,{role:pane.getAttribute('role'),label: pane.getAttribute('aria-labelledby')}]));
  const placements=[];let mobile=false,view='map',hasRecord=false,map=null,resizeFrame=null,tray=null,toolsButton=null,legendWasOpen=false;
  const t=(key,fallback)=>window.publicViewerI18n?.t(key,fallback)||fallback;
  function resizeMap(){cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(!mobile||view==='map')window.dispatchEvent(new Event('viewer:layoutchange'));});}
  function sizeViewport(){if(!mobile)return;body.style.setProperty('--public-mobile-height',Math.round(window.visualViewport?.height||window.innerHeight)+'px');resizeMap();}
  function menuClose(){menu.open=false;}
  function toolsClose(){if(tray)tray.hidden=true;toolsButton?.setAttribute('aria-expanded','false');}
  function moveForMobile(node,parent){const marker=document.createComment('public-mobile-placement');node.before(marker);placements.push({node,marker});parent.append(node);}
  function restorePlacements(){for(const {node,marker} of placements.splice(0).reverse()){marker.replaceWith(node);}}
  function syncNavigation(){navigation.hidden=!mobile||body.classList.contains('public-information-active');}
  function show(next,{focus=false}={}){
    if(!mobile||!panes[next]||(next==='record'&&!hasRecord))return false;
    const old=panes[view];view=next;shell.dataset.mobileView=next;
    if(old!==panes[next]&&old?.contains(document.activeElement))buttons.find(b=>b.dataset.publicMobileView===next)?.focus();
    if(next==='record')window.viewerDetailPanel?.open();else window.viewerDetailPanel?.minimise();
    for(const [name,pane] of Object.entries(panes)){pane.inert=name!==next;pane.setAttribute('aria-hidden',String(name!==next));}
    for(const button of buttons){const selected=button.dataset.publicMobileView===next;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
    toolsClose();menuClose();window.dispatchEvent(new Event('public:panelchange'));resizeMap();
    if(focus)buttons.find(button=>button.dataset.publicMobileView===next)?.focus();return true;
  }
  function configureTools(){if(!mobile||!map||tray)return;
    tray=document.createElement('div');tray.id='publicMobileToolsTray';tray.className='public-mobile-tools-tray';tray.hidden=true;tray.setAttribute('aria-label',t('tools','Map tools'));
    panes.map.querySelector('.map-pane-body').append(tray);
    const key=document.getElementById('publicMapKey');legendWasOpen=!!key&&!key.hidden;document.querySelector('.public-map-key-close')?.click();
    const control={onAdd(){const box=document.createElement('div');box.className='maplibregl-ctrl map-custom-control public-mobile-tools-control';const button=document.createElement('button');toolsButton=button;button.type='button';button.id='publicMobileToolsToggle';button.setAttribute('aria-controls',tray.id);button.setAttribute('aria-expanded','false');button.title=t('tools','Map tools');button.setAttribute('aria-label',button.title);button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="white"/><circle cx="15" cy="12" r="2" fill="white"/><circle cx="9" cy="18" r="2" fill="white"/></svg>';button.onclick=()=>{tray.hidden=!tray.hidden;button.setAttribute('aria-expanded',String(!tray.hidden));};box.append(button);this.box=box;return box;},onRemove(){this.box.remove();}};
    map.addControl(control,'top-right');
    for(const id of ['publicMapHome','publicMeasurementTool','publicLayersTool','publicOptionsTool','publicLocateTool','publicMapDownload']){const node=document.getElementById(id)?.parentElement;if(node)moveForMobile(node,tray);}
    tray.addEventListener('click',event=>{if(event.target.closest('button')&&!event.target.closest('button').disabled)toolsClose();});
    tray._control=control;
  }
  function destroyTools(){if(!tray)return;if(legendWasOpen)document.querySelector('.public-map-legend .legend-show-btn')?.click();const control=tray._control;restorePlacements();tray.remove();tray=null;if(control)map.removeControl(control);toolsButton=null;}
  function relabel(){for(const b of buttons){const names={browse:['browse','Browse'],map:['map','Map'],record:['public_mobile_record','Record']};const [key,fallback]=names[b.dataset.publicMobileView];b.querySelector('span').textContent=t(key,fallback);}document.getElementById('publicMobileMenuSummary').setAttribute('aria-label',t('public_menu','Menu'));if(toolsButton){toolsButton.title=t('tools','Map tools');toolsButton.setAttribute('aria-label',toolsButton.title);}}
  function apply(){const next=query.matches;if(next===mobile){sizeViewport();return;}
    mobile=next;body.classList.toggle('is-mobile-viewer',mobile);
    if(mobile){
      for(const node of [header.querySelector('.public-page-tabs'),header.querySelector('.public-header-actions')])if(node)moveForMobile(node,menuContent);
      buttons.find(b=>b.dataset.publicMobileView==='record').disabled=!hasRecord;
      for(const [name,pane] of Object.entries(panes)){pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',buttons.find(b=>b.dataset.publicMobileView===name).id);}
      configureTools();sizeViewport();show(view==='record'&&!hasRecord?'map':view);
    }else{
      menuClose();destroyTools();restorePlacements();
      for(const [pane,attrs] of paneSemantics){for(const [attr,value] of [['role',attrs.role],['aria-labelledby',attrs.label]]){if(value===null)pane.removeAttribute(attr);else pane.setAttribute(attr,value);}}
      delete shell.dataset.mobileView;body.style.removeProperty('--public-mobile-height');
      for(const name of ['browse','map']){panes[name].inert=false;panes[name].removeAttribute('aria-hidden');}
      if(hasRecord&&view==='record')window.viewerDetailPanel?.open();else window.viewerDetailPanel?.minimise();resizeMap();
    }syncNavigation();
  }
  for(const [index,button] of buttons.entries()){
    button.addEventListener('click',()=>show(button.dataset.publicMobileView));
    button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const enabled=buttons.filter(b=>!b.disabled),current=enabled.indexOf(button);const next=event.key==='Home'?enabled[0]:event.key==='End'?enabled.at(-1):enabled[(current+(event.key==='ArrowRight'?1:enabled.length-1))%enabled.length];show(next.dataset.publicMobileView,{focus:true});});
  }
  document.addEventListener('click',event=>{if(mobile&&menu.open&&!menu.contains(event.target))menuClose();if(mobile&&tray&&!tray.hidden&&!tray.contains(event.target)&&!toolsButton?.contains(event.target))toolsClose();});
  menuContent.addEventListener('click',event=>{if(event.target.closest('[data-public-page],a'))menuClose();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(menu.open){menuClose();document.getElementById('publicMobileMenuSummary').focus();}toolsClose();if(mobile&&view==='record'&&!body.classList.contains('public-information-active'))show('map');}});
  for(const id of ['publicPolygon','publicRectangle','publicMapExtent'])document.getElementById(id)?.addEventListener('click',()=>show('map'),true);
  new MutationObserver(syncNavigation).observe(body,{attributes:true,attributeFilter:['class']});
  query.addEventListener('change',apply);window.addEventListener('resize',sizeViewport);window.visualViewport?.addEventListener('resize',sizeViewport);
  window.publicViewerI18n?.onChange(relabel);
  window.publicViewerMobile={active:()=>mobile,show,selectRecord(){hasRecord=true;buttons.find(b=>b.dataset.publicMobileView==='record').disabled=false;show('record');},clearRecord(){hasRecord=false;buttons.find(b=>b.dataset.publicMobileView==='record').disabled=true;if(mobile&&view==='record')show('map');},mapReady(value){map=value;configureTools();resizeMap();}};
  relabel();apply();
})();
