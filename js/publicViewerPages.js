(()=>{
'use strict';
const tabs=[...document.querySelectorAll('[data-public-page]')];
const panels={viewer:document.getElementById('publicViewerPage'),about:document.getElementById('publicAboutPage'),feedback:document.getElementById('publicFeedbackPage')};
function show(page,writeHash=true){
 if(!panels[page])page='viewer';
 for(const [name,panel] of Object.entries(panels))panel.hidden=name!==page;
 for(const tab of tabs){const active=tab.dataset.publicPage===page;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
 document.body.classList.toggle('public-information-active',page!=='viewer');
 if(writeHash)history.replaceState(null,'','#'+page);
 if(page==='viewer')requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
}
for(const [index,tab] of tabs.entries()){
 tab.addEventListener('click',()=>show(tab.dataset.publicPage));
 tab.addEventListener('keydown',event=>{
  let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;
  event.preventDefault();tabs[next].focus();show(tabs[next].dataset.publicPage);
 });
}
for(const link of document.querySelectorAll('[data-public-page-link]'))link.addEventListener('click',()=>{show(link.dataset.publicPageLink);document.getElementById('feedbackName')?.focus();});
window.addEventListener('hashchange',()=>show(location.hash.slice(1),false));show(location.hash.slice(1),false);
const form=document.getElementById('publicFeedbackForm'),type=document.getElementById('feedbackType'),status=document.getElementById('feedbackStatus'),button=document.getElementById('feedbackSubmit');
let submissionId=null,lastPayload=null;
type.addEventListener('change',()=>{document.getElementById('feedbackSubject').textContent='[CAAL Web Viewer Feedback]'+(type.value?' '+type.selectedOptions[0].textContent.toLowerCase():'');});
form.addEventListener('submit',async event=>{
 event.preventDefault();if(!form.reportValidity()||button.disabled)return;
 const data=Object.fromEntries(new FormData(form));const payload=JSON.stringify(data);
 if(payload!==lastPayload){submissionId=crypto.randomUUID();lastPayload=payload;}
 data.submission_id=submissionId;
 button.disabled=true;status.dataset.error='false';status.textContent='Sending your feedback...';
 try{
  const response=await fetch('/api/public-feedback',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();if(!response.ok||!result.saved)throw Error(response.status===429?'Please wait before sending more feedback.':'Your feedback could not be saved. Please try again.');
  status.textContent='Your feedback has been saved. Thank you.'+(result.submission_id?' Reference: '+result.submission_id:'');
  form.reset();type.dispatchEvent(new Event('change'));submissionId=null;lastPayload=null;
 }catch(error){status.dataset.error='true';status.textContent=error.message==='Failed to fetch'?'Could not connect. Please try again.':error.message;}
 finally{button.disabled=false;}
});
})();
