(() => {
  'use strict';
  window.createPublicViewerFiltersUI = ({onChange,getTypes,getText,getArea,clearArea,get}) => {
    const I=window.publicViewerI18n,t=(key,fallback,vars={})=>I?.t(key,fallback,vars)||String(fallback||key).replace(/\{(\w+)\}/g,(all,k)=>vars[k]??all);
    const el=id=>document.getElementById(id);
    // Insert into the existing advanced panel without replacing the HTML file.
    if(!el('viewerFilterLocationConfidence')){
      const group=document.createElement('div');group.className='filter-group';
      const label=document.createElement('label');label.setAttribute('for','viewerFilterLocationConfidence');label.id='publicLocationConfidenceLabel';label.textContent='Location Confidence';
      const chips=document.createElement('div');chips.id='viewerFilterLocationConfidenceChips';chips.className='selected-filter-chips';
      const select=document.createElement('select');select.id='viewerFilterLocationConfidence';select.multiple=true;select.className='form-control chip-multiselect';
      group.append(label,chips,select);const anchor=el('viewerFilterCondition').closest('[data-filter-section="rs_assessments"]')||el('viewerFilterCondition').closest('.filter-group');anchor.parentNode.insertBefore(group,anchor);
    }
    const confidenceGroup = el('viewerFilterLocationConfidence').closest('.filter-group');
    const rsSection = el('viewerFilterCondition').closest('[data-filter-section="rs_assessments"]');

    if (rsSection && confidenceGroup) {
      const section = document.createElement('div');
      section.className = 'advanced-filter-section';
      section.dataset.filterSection = 'monument_assessments';

      const heading = document.createElement('h4');
      heading.textContent = 'Monument assessments';
      I?.bind(heading, 'viewer_monument_assessments', 'Monument assessments');

      section.append(heading, confidenceGroup);
      rsSection.parentNode.insertBefore(section, rsSection);
    }
    const periodsGroup=document.createElement('div');
    periodsGroup.className='filter-group chip-multiselect-group';
    periodsGroup.dataset.filterField='cultural_periods';
    const periodLabel=document.createElement('label');
    periodLabel.htmlFor='viewerFilterCulturalPeriod';
    periodLabel.textContent='Cultural Period';
    I?.bind(periodLabel,'Cultural Period','Cultural Period');
    const periodChips=document.createElement('div');
    periodChips.id='viewerFilterCulturalPeriodChips';
    periodChips.className='selected-filter-chips';
    const periodsSelect=document.createElement('select');
    periodsSelect.id='viewerFilterCulturalPeriod';
    periodsSelect.className='form-control chip-multiselect advanced-filter-hidden-select';
    periodsSelect.multiple=true;
    const periodStatus=document.createElement('p');
    periodStatus.hidden=true;
    periodStatus.className='filter-help';
    periodStatus.setAttribute('role','status');
    const periodsTree=document.createElement('div');
    periodsTree.id='viewerFilterCulturalPeriodTree';
    periodsGroup.append(periodLabel,periodChips,periodsSelect,periodsTree,periodStatus);
    el('viewerFilterMonumentType').closest('.filter-group').after(periodsGroup);

    const controls=[['viewerFilterCountry','countries','Country','country'],['viewerFilterLocationConfidence','locationConfidence','Location Confidence','location_confidence'],['viewerFilterMonumentType','monumentTypes','Monument type','monument_types'],['viewerFilterCulturalPeriod','culturalPeriods','Cultural Period','cultural_periods'],['viewerFilterCondition','condition','Condition','condition_levels'],['viewerFilterDeteriorationCause','deteriorationCause','Deterioration','deterioration_causes'],['viewerFilterRiskType','riskType','Risk','risk_levels']];
    const incoming=new URLSearchParams(location.search);
    const linkedSelections=[];
    function seed(key,id,pattern){
      const value=incoming.get(key);
      if(!value || incoming.getAll(key).length!==1 || (pattern&&!pattern.test(value)))return;
      const select=el(id);
      let option=[...select.options].find(o=>o.value===value);
      if(!option && pattern){
        option=new Option(value,value);
        select.append(option);
      }
      if(!option)return;
      option.selected=true;
      linkedSelections.push({key,id,value});
    }
    // Seed the filters before the Viewer makes its first counts, list or map request.
    seed('siteType','viewerFilterMonumentType',/^MT-[1-3]-[0-9]{4,8}$/);
    seed('culturalPeriod','viewerFilterCulturalPeriod',/^CP-[1-3]-[0-9]{4,8}$/);
    seed('country','viewerFilterCountry',/^(China|Karakalpakstan|Kazakhstan|Kyrgyzstan|Tajikistan|Turkmenistan|Uzbekistan)$/);
    seed('locationConfidence','viewerFilterLocationConfidence',/^(High|Medium|Low|No coords|Unknown)$/);
    seed('condition','viewerFilterCondition');
    seed('deteriorationCause','viewerFilterDeteriorationCause');
    seed('riskType','viewerFilterRiskType');
    seed('riskMin','viewerFilterRiskMin');
    let applicability={location_confidence:['monument'],cultural_periods:['monument'],country:['rs3_poly','rs3_line','rs3_group','institution','vernacular','monument','archive'],monument_types:['rs3_poly','rs3_line','rs3_group','monument'],condition_levels:['rs3_poly','rs3_line'],deterioration_causes:['rs3_poly','rs3_line'],risk_levels:['rs3_poly','rs3_line']};
    const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
    const selected=id=>[...el(id).selectedOptions].filter(o=>o.value);
    const treeInputs=(id='viewerFilterMonumentType')=>[
      ...el(id+'Tree').querySelectorAll('input[type=checkbox]')];
    const hierarchyStates=new Map();
    function syncHierarchyChecks(){
      for(const [id,{byId}] of hierarchyStates){
        const chosen=new Map(selected(id).map(o=>[o.value,o.textContent]));
        for(const input of treeInputs(id)){
          let parent=byId.get(input.value)?.parent_id,inheritedFrom=null;
          const seen=new Set([input.value]);
          while(parent&&!seen.has(parent)){
            if(chosen.has(parent)){inheritedFrom=parent;break;}
            seen.add(parent);parent=byId.get(parent)?.parent_id;
          }
          input.checked=chosen.has(input.value)||inheritedFrom!==null;
          input.dataset.inherited=String(inheritedFrom!==null);
          input.title=inheritedFrom===null?'':t('public_filter_inherited_from',
            'Included by {label}. Remove that parent filter to change this selection.',
            {label:chosen.get(inheritedFrom)});
        }
      }
    }
    function changed(){render();onChange();}
    function remove(id,value){for(const o of el(id).options)if(o.value===value)o.selected=false;
      if(['viewerFilterMonumentType','viewerFilterCulturalPeriod'].includes(id))for(const i of treeInputs(id))if(i.value===value)i.checked=false;changed();}
    function chip(label,action){const host=make('span',undefined,'active-filter-chip');const text=make('span',label,'active-filter-chip-text');const b=make('button','×','active-filter-chip-remove');b.type='button';b.setAttribute('aria-label',t('public_remove_filter','Remove {label}',{label}));b.onclick=action;host.append(text,b);return host;}
    function applicableTypes(types=getTypes()){
      const fields=controls.filter(([id])=>selected(id).length).map(([, , ,field])=>field);
      if(el('viewerFilterRiskMin').value)fields.push('risk_levels');
      return types.filter(type=>fields.every(field=>(applicability[field]||[]).includes(type)));
    }
    function renderLayerAvailability(){
      const inputs=[...el('publicTypes').querySelectorAll('input')];
      const applicable=new Set(applicableTypes(inputs.map(input=>input.value)));
      const explanation=t('public_layer_filter_not_applicable','This layer does not support the active filters.');
      for(const input of inputs){
        const blocked=!applicable.has(input.value),label=input.closest('label');
        input.disabled=input.dataset.publicPolicyDisabled==='true'||blocked;
        label?.classList.toggle('public-layer-filter-disabled',blocked);
        if(label){if(blocked){label.title=explanation;label.setAttribute('aria-disabled','true');}
          else{label.removeAttribute('title');label.removeAttribute('aria-disabled');}}
      }
      const note=el('publicFilterApplicabilityNote');
      if(note){const hasBlocked=inputs.some(input=>input.checked&&!applicable.has(input.value));
        note.hidden=!hasBlocked;
        const empty=!applicableTypes().length;
        note.textContent=empty?t('public_filters_no_applicable_layers','No selected layer supports this combination of filters. Clear a filter or select a compatible layer.'):
          t('public_filters_matching_layers_only','Only layers that support all active filters are shown. Your layer selections are kept.');}
    }
    function render(){
      syncHierarchyChecks();
      renderLayerAvailability();
      window.publicViewerVocabulary?.guides();
      if(linkedSelections.length){
        const url=new URL(location.href);
        let changedUrl=false;
        for(const {key,id,value} of linkedSelections){
          if(url.searchParams.get(key)===value && !selected(id).some(option=>option.value===value)){
            url.searchParams.delete(key);
            changedUrl=true;
          }
        }
        if(changedUrl)history.replaceState(history.state,'',url);
      }
      const active=el('publicActiveFilterChips');active.replaceChildren();
      for(const [id,param,label,field] of controls){
        const host=el(id+'Chips');host?.replaceChildren();
        const applies=getTypes().some(t=>(applicability[field]||[]).includes(t));el(id).disabled=!applies;
        el(id).closest('.filter-group')?.classList.toggle('filter-not-applicable',!applies);
        for(const o of selected(id)){host?.append(chip(o.textContent,()=>remove(id,o.value)));active.append(chip(o.textContent,()=>remove(id,o.value)));}
      }
      for(const [id,field] of [['viewerFilterMonumentType','monument_types'],['viewerFilterCulturalPeriod','cultural_periods']]){
        const applies=getTypes().some(t=>(applicability[field]||[]).includes(t));
        for(const input of treeInputs(id))input.disabled=!applies||input.dataset.inherited==='true';
      }
      const caal=el('viewerFilterCaalId');if(caal.value.trim())active.append(chip('CAAL_ID: '+caal.value.trim(),()=>{caal.value='';changed();}));
      const risk=el('viewerFilterRiskMin');risk.disabled=!getTypes().some(t=>applicability.risk_levels.includes(t));
      risk.closest('.filter-group')?.classList.toggle('filter-not-applicable',risk.disabled);
      if(risk.value)active.append(chip(t('public_risk_minimum','Risk level ≥ {level}',{level:risk.value}),()=>{risk.value='';changed();}));
      if(getText())active.append(chip(getText(),()=>{el('publicQuery').value='';changed();}));
      if(getArea())active.append(chip(t('search_area','Search area'),()=>{clearArea();changed();}));
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
    el('publicAdvancedToggle').onclick=()=>{const panel=el('viewerFiltersPanel');panel.hidden=!panel.hidden;(I?I.bind(el('publicAdvancedToggle'),"advanced_filters",'Advanced filters',{},"textContent"):el('publicAdvancedToggle').textContent=t("advanced_filters",'Advanced filters'));el('publicAdvancedToggle').setAttribute('aria-expanded',String(!panel.hidden));};
    // Both filters share one tree renderer and keep only explicitly selected IDs.
    // Descendant expansion happens on the server for lists, counts, maps and links.
    function renderHierarchy(host,select,all,placeholder){
      const expanded=new Map([...host.querySelectorAll('[data-concept]')].map(n=>[n.dataset.concept,n.open]));
      const oldSearch=host.querySelector('input[type=search]')?.value||'';
      const chosen=new Map(selected(select.id).map(o=>[o.value,o.textContent]));
      const byId=new Map(all.map(r=>[r.concept_id,r])),children=new Map();
      hierarchyStates.set(select.id,{byId});
      for(const row of all){
        const parent=byId.has(row.parent_id)?row.parent_id:null;
        if(!children.has(parent))children.set(parent,[]);
        children.get(parent).push(row);
      }
      host.replaceChildren();select.replaceChildren();
      const search=make('input');search.type='search';search.placeholder=placeholder;
      search.className='form-control';search.setAttribute('aria-label',placeholder);host.append(search);
      const tree=make('div',undefined,'public-monument-tree');host.append(tree);
      const seen=new Set();
      function branch(row,depth){
        if(seen.has(row.concept_id))return null;
        seen.add(row.concept_id);
        const labelText=row.label||row.display_label||row.display_en||row.label_en||row.concept_id;
        const option=new Option(labelText,row.concept_id,false,chosen.has(row.concept_id));select.append(option);
        const descendants=children.get(row.concept_id)||[];
        const box=make(descendants.length?'details':'div',undefined,'public-tree-node');
        box.dataset.concept=row.concept_id;
        if(descendants.length)box.open=expanded.has(row.concept_id)?expanded.get(row.concept_id):depth<1;
        const line=make(descendants.length?'summary':'div');
        const label=make('label',undefined,'browse-checkbox'),check=make('input');
        check.type='checkbox';check.value=row.concept_id;check.checked=option.selected;
        check.onchange=()=>{option.selected=check.checked;changed();};
        label.append(check,make('span',labelText));line.append(label);box.append(line);
        for(const child of descendants){const n=branch(child,depth+1);if(n)box.append(n);}
        return box;
      }
      for(const row of children.get(null)||[]){const n=branch(row,0);if(n)tree.append(n);}
      for(const row of all)if(!seen.has(row.concept_id)){const n=branch(row,0);if(n)tree.append(n);}
      // Never discard a stale incoming link or a selection during a language reload.
      for(const [value,label] of chosen)if(!byId.has(value))select.append(new Option(label,value,false,true));
      search.oninput=()=>{
        const term=search.value.trim().toLowerCase();
        for(const n of tree.querySelectorAll('.public-tree-node')){
          n.hidden=!!term&&!n.textContent.toLowerCase().includes(term);
          if(term&&n.tagName==='DETAILS')n.open=true;
        }
      };
      search.value=oldSearch;if(oldSearch)search.dispatchEvent(new Event('input'));
    }
    const typeStatus=make('p',undefined,'filter-help');
    typeStatus.hidden=true;typeStatus.setAttribute('role','status');
    el('viewerFilterMonumentTypeTree').after(typeStatus);
    let treeVersion=0;
    async function loadTree(){
      const sequence=++treeVersion,host=el('viewerFilterMonumentTypeTree');
      try{
        const data=await get('/lookups');if(sequence!==treeVersion)return;
        if(data.field_applicability)applicability={cultural_periods:['monument'],...data.field_applicability,location_confidence:['monument']};
        renderHierarchy(host,el('viewerFilterMonumentType'),data.site_types||[],t('search_site_types','Find a monument type'));
        typeStatus.hidden=true;render();
      }catch(error){
        if(sequence!==treeVersion)return;
        typeStatus.hidden=false;typeStatus.textContent=t('public_types_load_failed','Monument types could not be loaded.');
        console.error('Public Viewer filter lookups failed:',error);
      }
    }
    function clear(){
      for(const [id] of controls)for(const o of el(id).options)o.selected=false;
      for(const id of ['viewerFilterMonumentType','viewerFilterCulturalPeriod']){
        for(const i of treeInputs(id))i.checked=false;
        const search=el(id+'Tree').querySelector('input[type=search]');
        if(search){search.value='';search.dispatchEvent(new Event('input'));}
      }
      el('viewerFilterCaalId').value='';el('viewerFilterRiskMin').value='';render();
    }
    let periodsVersion=0;
    async function loadPeriods(){
      const version=++periodsVersion;
      try{
        const data=await get('/cultural-periods');if(version!==periodsVersion)return;
        renderHierarchy(periodsTree,periodsSelect,(data.options||[]).map(row=>({...row,concept_id:row.concept_id||row.value})),
          t('public_search_cultural_periods','Find a cultural period'));
        periodStatus.hidden=true;render();
      }catch(error){
        if(version!==periodsVersion)return;
        const fallback='Could not load cultural periods.';
        periodStatus.hidden=false;
        if(I)I.bind(periodStatus,'public_cultural_periods_unavailable',fallback);else periodStatus.textContent=fallback;
        console.error('Public Viewer cultural periods lookup failed',error);
      }
    }
    let confidenceVersion=0;
    async function loadConfidence(){
      const version=++confidenceVersion;
      el('publicLocationConfidenceLabel').textContent=I?.field('Location Confidence','Location Confidence','monument')||t('location_confidence','Location Confidence');
      try{const data=await get('/location-confidence');if(version!==confidenceVersion)return;
        const select=el('viewerFilterLocationConfidence'),chosen=new Set(selected(select.id).map(o=>o.value));
        const confidenceRank = row => {
          if (row.missing) return 6;
          const value = String(row.value ?? row.label ?? '').trim().toLowerCase();

          return ({
            high: 0,
            medium: 1,
            m: 1,
            low: 2,
            'no coords': 3,
            unknown: 4
          })[value] ?? 5;
        };

        const orderedOptions = [...(data.options || [])].sort(
          (a, b) => confidenceRank(a) - confidenceRank(b)
        );
        select.replaceChildren();for (const row of orderedOptions) {const option=make('option',row.missing?t('none_recorded','None recorded'):row.label);option.value=row.value;option.selected=chosen.has(row.value);select.append(option);chosen.delete(row.value);}
        for(const value of chosen)select.append(new Option(value,value,false,true));
        render();
      }catch(error){console.error('Public Viewer location confidence lookup failed',error);}
    }
    I?.onChange(()=>Promise.all([loadConfidence(),loadPeriods(),loadTree()]));void loadConfidence();void loadPeriods();void loadTree();render();return {appendParams,render,clear,applicableTypes,hasLinkedFilters:linkedSelections.length>0};
  };
})();
