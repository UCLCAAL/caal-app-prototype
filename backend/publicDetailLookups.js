'use strict';
// Public vocabulary labels follow the app language fallback. English remains the default.
const LANGUAGES=Object.freeze(['en','ru','zh','kk','ky','tg','tk','uz']);
function buildPublicDetailLookups(rows,requestedLanguage='en'){
 const language=LANGUAGES.includes(String(requestedLanguage).toLowerCase())?String(requestedLanguage).toLowerCase():'en';
 const chain=[...new Set([language,...(['kk','ky','tg','tk','uz'].includes(language)?['ru']:[]),'en'])];
 const result={monuments:{},archive:{}};
 for(const row of rows){
  if(!Object.hasOwn(result,row.family)||!row.lookup_name)continue;
  const raw=row.item||{};
  const value=row.family==='archive'?(raw.canonical_value??raw.concept_id??raw.id??raw.label_name):
   (raw.concept_id??raw.canonical_value??raw.id??raw.label_name);
  const label=[...chain.map(code=>raw['display_'+code]),...chain.map(code=>raw['label_'+code]),raw.canonical_value,raw.en_label,value].find(v=>v!==null&&v!==undefined&&String(v).trim()!=='');
  (result[row.family][row.lookup_name]??=[]).push({value,label,raw});
 }
 return result;
}
module.exports={buildPublicDetailLookups,LANGUAGES};
