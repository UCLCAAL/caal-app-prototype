(() => {
  'use strict';
  window.createPublicViewerFiltersUI = ({onChange,getTypes,getText,getArea,clearArea,get}) => {
    const el=id=>document.getElementById(id);
    const controls=[['viewerFilterCountry','countries','Country','country'],['viewerFilterMonumentType','monumentTypes','Monument type','monument_types'],['viewerFilterCondition','condition','Condition','condition_levels'],['viewerFilterDeteriorationCause','deteriorationCause','Deterioration','deterioration_causes'],['viewerFilterRiskType','riskType','Risk','risk_levels']];
    let applicability={country:['rs3_poly','rs3_line','rs3_group','institution','vernacular','monument','archive'],monument_types:['rs3_poly','rs3_line','rs3_group','monument'],condition_levels:['rs3_poly','rs3_line'],deterioration_causes:['rs3_poly','rs3_line'],risk_levels:['rs3_poly','rs3_line']};
    const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const selected=id=>[...el(id).selectedOptions].filter(o=>o.value);
    const treeInputs=()=>[...el('viewerFilterMonumentTypeTree').querySelectorAll('input[type=checkbox]')];
    function changed(){render();onChange();}
    function remove(id,value){for(const o of el(id).options)if(o.value===value)o.selected=false;
      if(id==='viewerFilterMonumentType')for(const i of treeInputs())if(i.value===value)i.checked=false;changed();}
    function chip(label,action){const host=make('span',undefined,'active-filter-chip');const text=make('span',label,'active-filter-chip-text');const b=make('button','×','active-filter-chip-remove');b.type='button';b.setAttribute('aria-label','Remove '+label);b.onclick=action;host.append(text,b);return host;}
    function render(){
      const active=el('publicActiveFilterChips');active.replaceChildren();
      for(const [id,param,label,field] of controls){
        const host=el(id+'Chips');host?.replaceChildren();
        const applies=getTypes().some(t=>(applicability[field]||[]).includes(t));el(id).disabled=!applies;
        el(id).closest('.filter-group')?.classList.toggle('filter-not-applicable',!applies);
        for(const o of selected(id)){host?.append(chip(o.textContent,()=>remove(id,o.value)));active.append(chip(o.textContent,()=>remove(id,o.value)));}
      }
      const mtApplies=getTypes().some(t=>applicability.monument_types.includes(t));for(const i of treeInputs())i.disabled=!mtApplies;
      const caal=el('viewerFilterCaalId');if(caal.value.trim())active.append(chip('CAAL_ID: '+caal.value.trim(),()=>{caal.value='';changed();}));
      const risk=el('viewerFilterRiskMin');risk.disabled=!getTypes().some(t=>applicability.risk_levels.includes(t));
      risk.closest('.filter-group')?.classList.toggle('filter-not-applicable',risk.disabled);
      if(risk.value)active.append(chip('Risk level ≥ '+risk.value,()=>{risk.value='';changed();}));
      if(getText())active.append(chip(getText(),()=>{el('publicQuery').value='';changed();}));
      if(getArea())active.append(chip('Search area',()=>{clearArea();changed();}));
      const hasFilters=!!active.childElementCount;
      if(!hasFilters&&el('publicActiveFilters').contains(document.activeElement))el('publicAdvancedToggle').focus();
      el('publicActiveFilters').hidden=!hasFilters;el('publicAdvancedToggle').classList.toggle('has-active-filters',hasFilters);
    }
    function appendParams(q){
      for(const [id,param] of controls){const values=selected(id).map(o=>o.value);if(values.length)q.set(param,values.join(','));}
      const caal=el('viewerFilterCaalId').value.trim();if(caal)q.set('caalId',caal);
      if(el('viewerFilterRiskMin').value)q.set('riskMin',el('viewerFilterRiskMin').value);
    }
    for(const [id] of controls){const select=el(id);select.addEventListener('change',changed);
      select.addEventListener('mousedown',event=>{if(event.target.tagName==='OPTION'&&!select.disabled){event.preventDefault();event.target.selected=!event.target.selected;select.focus();changed();}});
    }
    let timer;el('viewerFilterCaalId').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(changed,350);});
    el('viewerFilterRiskMin').addEventListener('change',changed);
    el('publicAdvancedToggle').onclick=()=>{const panel=el('viewerFiltersPanel');panel.hidden=!panel.hidden;el('publicAdvancedToggle').textContent='Advanced filters';el('publicAdvancedToggle').setAttribute('aria-expanded',String(!panel.hidden));};
    async function loadTree(){
      const host=el('viewerFilterMonumentTypeTree');host.textContent='Loading monument types...';
      try{const data=await get('/lookups');if(data.field_applicability)applicability=data.field_applicability;
        const all=data.site_types||[];const byId=new Map(all.map(r=>[r.concept_id,r]));const children=new Map();
        for(const row of all){const parent=byId.has(row.parent_id)?row.parent_id:null;if(!children.has(parent))children.set(parent,[]);children.get(parent).push(row);}
        host.replaceChildren();const search=make('input');search.type='search';search.placeholder='Find a monument type';search.className='form-control';search.setAttribute('aria-label','Find a monument type');host.append(search);
        const tree=make('div',undefined,'public-monument-tree');host.append(tree);el('viewerFilterMonumentType').replaceChildren();
        const seen=new Set();
        function branch(row,depth){
          if(seen.has(row.concept_id))return null;seen.add(row.concept_id);
          const option=make('option',row.display_en||row.label_en||row.concept_id);option.value=row.concept_id;el('viewerFilterMonumentType').append(option);
          const descendants=children.get(row.concept_id)||[];const box=make(descendants.length?'details':'div',undefined,'public-tree-node');if(descendants.length)box.open=depth<1;
          const line=make(descendants.length?'summary':'div');const label=make('label',undefined,'browse-checkbox');const check=make('input');check.type='checkbox';check.value=row.concept_id;
          check.onchange=()=>{option.selected=check.checked;changed();};label.append(check,make('span',row.label_en||row.display_en||row.concept_id));line.append(label);box.append(line);
          for(const child of descendants){const n=branch(child,depth+1);if(n)box.append(n);}return box;
        }
        for(const row of children.get(null)||[]){const n=branch(row,0);if(n)tree.append(n);}
        // Preserve orphaned/cyclic vocabulary entries without infinite recursion.
        for(const row of all)if(!seen.has(row.concept_id)){const n=branch(row,0);if(n)tree.append(n);}
        search.oninput=()=>{const term=search.value.trim().toLowerCase();for(const n of tree.querySelectorAll('.public-tree-node')){n.hidden=!!term&&!n.textContent.toLowerCase().includes(term);if(term&&n.tagName==='DETAILS')n.open=true;}};
        render();
      }catch(error){host.textContent='Monument types could not be loaded.';console.error('Public Viewer filter lookups failed:',error);}
    }
    function clear(){for(const [id] of controls)for(const o of el(id).options)o.selected=false;for(const i of treeInputs())i.checked=false;el('viewerFilterCaalId').value='';el('viewerFilterRiskMin').value='';const search=el('viewerFilterMonumentTypeTree').querySelector('input[type=search]');if(search){search.value='';search.dispatchEvent(new Event('input'));}render();}
    void loadTree();render();return {appendParams,render,clear};
  };
})();
