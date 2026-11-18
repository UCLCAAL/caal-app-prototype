(() => {
  'use strict';
  const origin='https://vocab.uclcaal.org';
  // Vocabulary identifiers verified against the Vocabulary Explorer REST catalogue.
  const fields={
    caalMonumentTypes:['Monument Type','Monument types','monument_types','Monument type1','Monument type2','Monument type3','Monument type4','Monument Type5','Monument Type6'],
    caalCulturalPeriods:['Cultural Period','Cultural Period1','Cultural Period2','Cultural Period3','Cultural Period4','Cultural Period5','Cultural Period6'],
    caalReligions:['Religion','Religion1','Religion2','Religion3','Related Religions'],
    caalCountries:['Country','Related Countries'],
    caalClassifications:['Classification'],caalDesignationTypes:['Designation'],
    caalLocationAccuracyAssessment:['Location Confidence','Location Accuracy'],
    caalAdministrativeTypes:['Administrative Subdivision Type','Administrative Subdivision Type1','Administrative Subdivision Type2','Administrative Subdivision Type3','Administrative Subdivision Type4'],
    caalUnitsOfMeasurement:['Unit','Measurement Unit'],caalMeasurementTypes:['Measurement Type'],
    caalContentTypes:['Content Type'],caalLevels:['Level'],caalSubjects:['Related Subjects'],
    caalLanguages:['Language of Material','Languages of Material','Preferred Language'],
    caalScripts:['Script of Material'],caalWritingSystems:['Writing System'],
    caalDigitalFileFormats:['Format of Digital Files','Digital Format Name and Version'],
    caalColours:['Colour','Colour / B&W','Colour/BW'],
    caalCopyrightStatus:['Still under CopyrightYN','Still under Copyright?'],
    caalSizeDimensionsOriginalMaterial:['Size and Dimensions of Original Material'],
    caalConditions:['Condition of Original Material'],
    caalCertainty:['Certainty','certainty'],
    caalGroundTruthingPriority:['Merit ground-truthing'],
    caalConditionLevels:['Overall condition'],caalRiskLevels:['Risk levels']
  };
  const lookupNames={
    caalMonumentTypes:['monument_type','monument_type_tree','site_type','site_type_tree'],
    caalCulturalPeriods:['cultural_period'],caalReligions:['religion','related_religion'],
    caalCountries:['country','related_country'],caalClassifications:['classification'],
    caalDesignationTypes:['designation'],caalLocationAccuracyAssessment:['location_confidence'],
    caalAdministrativeTypes:['admin_subdivision_type'],caalUnitsOfMeasurement:['measurement_unit'],
    caalMeasurementTypes:['measurement_type'],caalContentTypes:['content_type'],caalLevels:['level'],
    caalSubjects:['related_subject'],caalLanguages:['language','language_display'],caalScripts:['script'],
    caalWritingSystems:['writing_system'],caalDigitalFileFormats:['format'],caalColours:['colour'],
    caalCopyrightStatus:['copyright_status'],caalSizeDimensionsOriginalMaterial:['size_dimensions_original_material'],
    caalConditions:['condition_original_material']
  };
  const schemes=new Set([...Object.keys(fields),'caalDeteriorationCauses','caalThreatTypes','caalAnomalyTypes','caalOrigins']);
  const normal=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  const language=()=>{const lang=window.publicViewerI18n?.language()||'en';return ['en','ru','zh','kk','ky','tg','tk','uz'].includes(lang)?lang:'en';};
  const t=(key,fallback,vars={})=>window.publicViewerI18n?.t(key,fallback,vars)||fallback.replace(/\{(\w+)\}/g,(_,k)=>vars[k]??'');
  function landing(scheme){return schemes.has(scheme)?`${origin}/${scheme}/${language()}/`:null;}
  function safeConcept(uri){try{const u=new URL(uri);return u.origin===origin&&/^\/concept\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/.test(u.pathname)&&!u.pathname.split('/').some(s=>s==='.'||s==='..')&&!u.search&&!u.hash?u.href:null;}catch{return null;}}
  function page(scheme,id){if(!schemes.has(scheme))return null;const uri=safeConcept(id);if(uri)return `${origin}/${scheme}/${language()}/page/?uri=${encodeURIComponent(uri)}`;return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)?`${origin}/${scheme}/${language()}/page/${encodeURIComponent(id)}`:null;}
  function aliases(item){const values=[];for(const source of [item,item?.raw])if(source)for(const [key,value] of Object.entries(source)){
    if(/^(value|label|canonical_value|concept_id|display_label|chip_label|path_label_en|id|uri|concept_uri|label_en|label_ru|label_zh|display_(en|ru|zh|kk|ky|tg|tk|uz))$/.test(key)&&typeof value!=='object')values.push(normal(value));
  }return new Set(values);}
  function explicitId(item){for(const source of [item?.raw,item])if(source){
    for(const key of ['concept_uri','uri']){const id=safeConcept(source[key]);if(id)return id;}
    // Database concept IDs are identifiers; numeric row IDs and canonical labels are not.
    const uriId=safeConcept(source.concept_id);if(uriId)return uriId;
    const id=String(source.concept_id??'');if(/^[A-Z][A-Z0-9]*(?:-[A-Za-z0-9]+)+$/.test(id))return id;
  }return null;}
  const resolved=new Map();
  const pending=new Map(),queue=[];let running=0;
  function pump(){while(running<3&&queue.length){const job=queue.shift();running++;job().finally(()=>{running--;pump();});}}
  function lookup(scheme,term,lang){
    const key=JSON.stringify([scheme,normal(term),lang]),now=Date.now(),cached=pending.get(key);
    if(cached&&cached.expires>now)return cached.promise;
    let complete;const promise=new Promise(resolve=>complete=resolve);
    if(pending.size>=2000){const oldest=pending.keys().next().value;pending.delete(oldest);}
    pending.set(key,{promise,expires:now+300000});
    queue.push(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);
      try{
        const params=new URLSearchParams({label:term,lang});
        const response=await fetch(`${origin}/rest/v1/${scheme}/lookup?${params}`,{credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
        if(!response.ok)throw Error('vocabulary_unavailable');
        const data=await response.json();
        const ids=new Set((data.result||[]).filter(row=>[row.prefLabel,row.altLabel,row.hiddenLabel,row.matchedPrefLabel].some(value=>normal(value)===normal(term))).map(row=>safeConcept(row.uri)).filter(Boolean));
        complete(ids.size===1?[...ids][0]:ids.size>1?{ambiguous:true}:null);
      }catch{pending.get(key)&&(pending.get(key).expires=Date.now()+30000);complete(null);}
      finally{clearTimeout(timer);}
    });pump();return promise;
  }
  async function resolve(scheme,term,lookups={}){
    if(!schemes.has(scheme)||!String(term).trim()||String(term).length>250)return null;
    const options=(lookupNames[scheme]||[]).flatMap(name=>[...(lookups.monuments?.[name]||[]),...(lookups.archive?.[name]||[])]);
    const matches=options.filter(item=>aliases(item).has(normal(term)));
    const ids=new Set(matches.map(explicitId).filter(Boolean));
    if(ids.size>1)return null;
    if(ids.size===1)return page(scheme,[...ids][0]);
    // A concept's identity is independent of the selected interface language.
    // Keep successful exact matches across language changes, then try the same
    // displayed fallback label in English/Russian if the requested language lacks it.
    const key=JSON.stringify([scheme,normal(term)]),cached=resolved.get(key);
    if(cached&&cached.expires>Date.now())return page(scheme,cached.id);
    for(const lang of [...new Set([language(),'en','ru'])]){
      const id=await lookup(scheme,String(term).trim(),lang);
      // Do not disambiguate an ambiguous term by choosing another language.
      if(id?.ambiguous)return null;
      if(id){
        if(resolved.size>=2000)resolved.delete(resolved.keys().next().value);
        resolved.set(key,{id,expires:Date.now()+300000});
        return page(scheme,id);
      }
    }
    return null;
  }
  function linkElement(text,href){const a=document.createElement('a');a.className='public-vocabulary-link';a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=text;a.title=t('public_vocabulary_concept','View this concept in the Vocabulary Explorer (opens in a new tab)');return a;}
  // Inline Vernacular links. Source spelling and separators remain visible.
  const vernacularInlineCatalog=[
  {
    "slug": "vernacular-building-materials",
    "scheme": "caalVernacularBuildingMaterials",
    "fields": [
      "Building Material",
      "building_material"
    ],
    "terms": [
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/001",
        [
          "Adobe brick",
          "Саман кірпіш",
          "Пахса, чийки кыш",
          "Саманный кирпич",
          "Хишти хом",
          "Çig kerpiç",
          "Xom g‘isht",
          "土坯砖"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/002",
        [
          "Brick",
          "Кірпіш",
          "Кыш",
          "Кирпич",
          "Хишт",
          "Kerpiç",
          "G‘isht",
          "砖"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/003",
        [
          "Burnt brick",
          "Күйдірілген кірпіш",
          "Бышкан кыш",
          "Обожжённый кирпич",
          "Хишти пухта",
          "Bişen kerpiç",
          "Pishiq g‘isht",
          "烧结砖"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/004",
        [
          "Burnt brick (with Nikalai building shape)",
          "Күйдірілген кірпіш («Николаевский»)",
          "Бышкан кыш (Николай формасындагы)",
          "Обожжённый кирпич (\"Николаевский\")",
          "Хишти пухта (?)",
          "Bişen kerpiç (Nikalaý binasynyň şekili bilen)",
          "Pishiq g‘isht (Nikolay g‘isht)",
          "烧结砖(Nikolai 型建筑)"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/005",
        [
          "Burnt brick and mud block",
          "Күйдірілген кірпіш және шикі блок",
          "Бышкан кыш жана топурак жасалган блок",
          "Обожжённый кирпич и глиноблок",
          "Хишти хом бо похса",
          "Bişen  kerpiç we pagsa blok",
          "Pishiq g‘isht va paxsa (loy blok?)",
          "烧结砖与土坯块"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/006",
        [
          "Cinder block",
          "Шлакоблок",
          "Шлактан жасалган блок",
          "Блоки синдер",
          "Şlak blok",
          "Shlakli g‘isht",
          "煤渣砌块"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/007",
        [
          "Concrete",
          "Бетон",
          "Семент",
          "Beton",
          "混凝土"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/008",
        [
          "Mud block",
          "Шикі блок",
          "Топурактан жасалган блок (ылайдан жасалган блок)",
          "Глиноблок (сырцовый блок)",
          "Блоки хом",
          "Pagsa blok",
          "Paxsa (loy blok?)",
          "土坯块"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/009",
        [
          "Mud brick",
          "Шикі кірпіш",
          "Чийки кыш (ылайдан жасалган кыш)",
          "Кирпич-сырец",
          "Хишти хом",
          "Palçyk kerpiç",
          "Xom g‘isht",
          "土坯砖"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/010",
        [
          "Other",
          "Басқа",
          "Башка",
          "Прочее",
          "Дигар",
          "Başga",
          "Boshqa",
          "其他"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/011",
        [
          "Pakhsa",
          "Пахса"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/012",
        [
          "Rammed earth",
          "Тапталған саз",
          "Глинобит"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/013",
        [
          "Wood",
          "Ағаш",
          "Жыгач",
          "Дерево",
          "Чӯб",
          "Agaç",
          "Yog‘och",
          "木材"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-building-materials/014",
        [
          "Wooden frame",
          "Ағаш қаңқа",
          "Жыгач каркас",
          "Деревянный каркас",
          "Қолаби чӯбӣ",
          "Agaç rama",
          "Yog‘och sinchli",
          "木结构框架"
        ]
      ]
    ]
  },
  {
    "slug": "vernacular-roof-materials",
    "scheme": "caalVernacularRoofMaterials",
    "fields": [
      "Roof Material",
      "roof_material"
    ],
    "terms": [
      [
        "https://vocab.uclcaal.org/concept/vernacular-roof-materials/001",
        [
          "Asbestos",
          "Асбест",
          "Асбест (Шифер)",
          "Азбест",
          "Asbest",
          "Azbest",
          "石棉瓦"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-roof-materials/002",
        [
          "Burnt brick",
          "Күйдірілген кірпіш",
          "Бышкан кыш",
          "Обожжённый кирпич",
          "Хишти хом",
          "Bişen kerpiç",
          "Pishiq g‘isht",
          "烧结砖"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-roof-materials/003",
        [
          "Concrete",
          "Бетон",
          "Beton",
          "混凝土"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-roof-materials/004",
        [
          "Concrete slab",
          "Темірбетон плита",
          "Бетон плитасы",
          "Железобетонная плита",
          "Плитаи бетонӣ",
          "Beton plita",
          "Beton plita (Beton qoplama?)",
          "混凝土板"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-roof-materials/005",
        [
          "Earthen",
          "Топырақ",
          "Топурактуу (ылай)",
          "Земляная",
          "Хокӣ",
          "Toprak",
          "Tuproqli",
          "土"
        ]
      ],
      [
        "https://vocab.uclcaal.org/concept/vernacular-roof-materials/006",
        [
          "Other",
          "Басқа",
          "Башка",
          "Прочее",
          "Дигар",
          "Başga",
          "Boshqa",
          "其他"
        ]
      ]
    ]
  }
];
  const vernacularInlineKey=s=>String(s??'').trim().replace(/\s+/g,' ').toLowerCase();
  function inlineVernacularMaterials(node,config){
    if(!node||node.querySelector('a,input,button,.empty-value'))return;
    const original=node.textContent;
    if(!original.trim())return;
    const index=new Map();
    for(const [uri,labels] of config.terms)for(const label of labels){
      const key=vernacularInlineKey(label);
      if(!index.has(key))index.set(key,new Set());
      index.get(key).add(uri);
    }
    // Timber is an approved vocabulary equivalence, not a spelling correction.
    if(config.slug==='vernacular-building-materials'){
      index.set('timber',new Set([origin+'/concept/vernacular-building-materials/013']));
      index.set('burnt bricks',new Set([origin+'/concept/vernacular-building-materials/003']));
      index.set('mud blocks',new Set([origin+'/concept/vernacular-building-materials/008']));
    }
    const target=text=>{
      const ids=index.get(vernacularInlineKey(text));
      if(ids?.size!==1)return null;
      const uri=[...ids][0];
      return origin+'/'+config.scheme+'/'+language()+'/page/?uri='+encodeURIComponent(uri);
    };
    const whole=index.get(vernacularInlineKey(original));
    if(whole){
      const href=target(original);
      if(href)node.replaceChildren(linkElement(original,href));
      return;
    }
    // Keep delimiters and unmatched text exactly as recorded.
    const parts=original.split(/([/,;])/);
    let linked=false;
    const nodes=parts.map((part,i)=>{
      const href=i%2?null:target(part);
      if(href){linked=true;return linkElement(part,href);}
      return document.createTextNode(part);
    });
    if(linked)node.replaceChildren(...nodes);
  }
  function linkText(node,scheme,lookups,term=node.textContent,splitList=false){
    if(!node||node.querySelector('a,input,button,.empty-value')||!node.textContent.trim())return;
    const original=node.textContent;
    void resolve(scheme,term,lookups).then(async href=>{
      if(!node.isConnected||node.textContent!==original||node.querySelector('a'))return;
      if(href){node.replaceChildren(linkElement(original,href));return;}
      if(!splitList)return;
      const parts=original.split(/([,;]\s*)/);if(parts.length<3)return;
      const links=await Promise.all(parts.map((text,index)=>index%2?null:resolve(scheme,text,lookups)));
      if(!links.some(Boolean)||!node.isConnected||node.textContent!==original||node.querySelector('a'))return;
      node.replaceChildren(...parts.map((text,index)=>links[index]?linkElement(text,links[index]):document.createTextNode(text)));
    });
  }
  function fieldScheme(label,type){const I=window.publicViewerI18n;const needle=normal(label);
    for(const [scheme,names] of Object.entries(fields))if(names.some(name=>normal(name)===needle||normal(I?.field(name,name,type))===needle))return scheme;
    return null;
  }
  function enrich(host,record,lookups){
    const type=record?.identity?.record_type;
    for(const item of host.querySelectorAll('.detail-item,.measurement-field')){
      const label=[...item.children].find(n=>n.classList.contains('detail-label'));
      const value=[...item.children].find(n=>n.classList.contains('detail-value'));
      const field=item.dataset.vocabField||label?.textContent;
      const materialField=type==='vernacular'&&normal(field)&&vernacularInlineCatalog.find(config=>
        config.fields.some(name=>normal(field)===normal(name)||normal(field)===normal(window.publicViewerI18n?.field(name,name,type))));
      if(materialField){
        inlineVernacularMaterials(value,materialField);
        continue;
      }
      let scheme=fieldScheme(field,type);
      if(!scheme&&normal(field)===normal(window.publicViewerI18n?.field('Type','Type',type)||'Type')&&item.closest('.viewer-measurement-row'))scheme='caalMeasurementTypes';
      if(!scheme||!value||value.querySelector('input,.viewer-rating-slider,.boolean-display,.viewer-indicator-grid'))continue;
      const entries=value.querySelectorAll('li');
      if(entries.length)for(const entry of entries)linkText(entry,scheme,lookups);
      else if(!value.children.length)linkText(value,scheme,lookups,value.textContent,['caalCountries','caalReligions','caalSubjects','caalLanguages','caalScripts','caalContentTypes','caalDigitalFileFormats'].includes(scheme));
    }
    for(const node of host.querySelectorAll('[data-vocab-scheme]')){
      const indicator=node.closest('.viewer-indicator-row');
      if(indicator&&!indicator.classList.contains('is-checked'))continue;
      linkText(node,node.dataset.vocabScheme,lookups,node.dataset.vocabTerm||node.textContent);
    }
  }
  const filterSchemes={viewerFilterMonumentType:'caalMonumentTypes',viewerFilterCulturalPeriod:'caalCulturalPeriods',viewerFilterCountry:'caalCountries',viewerFilterLocationConfidence:'caalLocationAccuracyAssessment',viewerFilterCondition:'caalConditionLevels',viewerFilterDeteriorationCause:'caalDeteriorationCauses',viewerFilterRiskType:'caalThreatTypes',viewerFilterRiskMin:'caalRiskLevels'};
  function guides(){for(const [id,scheme] of Object.entries(filterSchemes)){
    const label=document.querySelector(`label[for="${id}"]`);if(!label)continue;
    let row=label.parentElement;
    if(!row.classList.contains('public-vocabulary-label-row')){row=document.createElement('div');row.className='public-vocabulary-label-row';label.before(row);row.append(label);}
    let a=row.querySelector('.public-vocabulary-guide');if(!a){a=document.createElement('a');a.className='public-vocabulary-guide';a.target='_blank';a.rel='noopener noreferrer';a.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Z"/><path d="M12 5v16"/></svg>';row.append(a);}
    a.href=landing(scheme);const title=t('public_vocabulary_guide','Explore the {label} thesaurus (opens in a new tab)',{label:label.textContent.trim()});a.title=title;a.setAttribute('aria-label',title);
  }}
  window.publicViewerVocabulary={landing,resolve,enrich,guides};
})();
