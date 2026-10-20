'use strict';
const LANGUAGES=Object.freeze(['en','ru','zh','kk','ky','tg','tk','uz']);
const language=value=>LANGUAGES.includes(String(value||'').toLowerCase())?String(value).toLowerCase():'en';
const clean=value=>value==null||String(value).trim().toUpperCase()==='NULL'?'':String(value).replace(/\\n|\r?\n/g,' ').replace(/\s+/g,' ').trim();
function resolve(row,requested,fallback=''){
 const lang=language(requested),chain=[lang,...(['kk','ky','tg','tk','uz'].includes(lang)?['ru']:[]),'en'];
 for(const code of [...new Set(chain)])for(const prefix of ['display_','label_']){const text=clean(row?.[prefix+code]);if(text)return text.replace(/\bRS3\b/g,'RS');}
 return clean(fallback);
}
module.exports={LANGUAGES,language,clean,resolve};
