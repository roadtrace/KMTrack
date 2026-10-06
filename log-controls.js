/* Register controls reuse the one list, current filters and device action handlers. */
document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const button = (id, text) => { const b=document.createElement('button'); b.type='button'; if(id)b.id=id; b.className='ds-btn ds-btn-quiet'; b.textContent=text; return b; };
  const header=document.querySelector('.log-header'); header.classList.add('log-toolbar');
  const badge=document.createElement('span'); badge.id='log-count-badge'; badge.className='log-count-badge'; badge.setAttribute('role','status'); header.querySelector('h2').append(badge);
  const view=$('log-view'), head=view.querySelector('.ds-view-head');
  head.querySelector('h2').textContent='Inspection Log';
  const subtitle=document.createElement('p'); subtitle.className='register-subtitle'; subtitle.textContent='Review, filter, and manage inspection records.'; head.append(subtitle);
  const scopes=document.createElement('div'); scopes.className='register-scopes'; scopes.setAttribute('role','group'); scopes.setAttribute('aria-label','Record scope');
  const imported=button('log-scope-imported','Imported'); imported.setAttribute('aria-pressed','false');
  scopes.append($('log-scope-my'),$('log-scope-team'),imported); head.after(scopes);
  imported.addEventListener('click',()=>{
    if(!canViewTeamRecords()) return;
    switchLogScope('my'); $('entry-filter-source').value='imported'; applyEntryFilters();
  });
  const search=document.createElement('label'); search.className='register-search';
  search.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></svg><input id="log-search" type="search" placeholder="Search KM, defect, corridor…" aria-label="Search inspection records" autocomplete="off">'; scopes.after(search);
  let searchTimer;
  $('log-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(applyEntryFilters,120);});
  const chips=document.createElement('div'); chips.id='log-active-filters'; chips.className='register-filter-chips'; chips.setAttribute('aria-label','Active filters'); search.after(chips);
  const toolbar=document.createElement('div'); toolbar.className='register-toolbar';
  const result=document.createElement('div'); result.className='register-result'; result.append(head.querySelector('.ds-chip'));
  const coverage=document.createElement('small'); coverage.id='log-result-coverage'; result.append(coverage);
  const filterButton=button('log-filter-button','Filter'); filterButton.setAttribute('aria-haspopup','dialog');
  filterButton.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8z"/></svg><span>Filter</span>';
  const dataButton=button('log-data-actions-button','Data Actions'); dataButton.setAttribute('aria-haspopup','dialog');
  toolbar.append(result,filterButton,dataButton); chips.after(toolbar);
  const actions=$('log-select-actions'),toggle=$('select-toggle-btn'),bulkMount=$('log-bulk-actions');
  actions.append(toggle); toolbar.after(actions); actions.after(bulkMount);
  actions.prepend($('my-record-controls'));
  document.querySelector('#my-record-controls [role="group"]').remove();
  const selectAll=$('bulk-select-all-btn'),deleteSelected=$('bulk-delete-btn'); bulkMount.append(selectAll,deleteSelected);
  bulkMount.after($('my-record-status'));
  $('bulk-actions-bar').hidden=true;
  const legacyCount=document.querySelector('.count-bar'); legacyCount.hidden=true; $('last-time').hidden=true; document.querySelector('.count-divider').hidden=true;
  $('log-list').classList.add('inspection-record-list');

  // Existing field nodes are moved, keeping their options and handlers intact.
  const sheet=document.createElement('dialog'); sheet.id='log-filter-sheet'; sheet.className='register-sheet'; sheet.setAttribute('aria-labelledby','log-filter-title');
  sheet.innerHTML='<div class="register-sheet-head"><h2 id="log-filter-title">Filters</h2><button type="button" class="register-close" aria-label="Close filters">×</button></div><div class="register-sheet-fields"></div><p class="register-sheet-note">Filters apply to available records, including bounded loaded history.</p><div class="register-sheet-footer"><button type="button" id="log-filter-reset">Reset</button><button type="button" id="log-filter-apply">Apply Filters</button></div>';
  document.body.append(sheet); const fields=sheet.querySelector('.register-sheet-fields');
  sheet.querySelector('.register-sheet-note').append(' Device-photo filters show device records only; submitted photo availability is checked in details.');
  const field=(label,input)=>{const row=document.createElement('label');row.className='register-filter-row';const title=document.createElement('span');title.textContent=label;row.append(title,input);fields.append(row);return row;};
  const dates=document.createElement('div'); dates.className='register-date-range';
  const from=$('entry-filter-from'),to=$('entry-filter-to'); dates.append(from,to);
  const dateRow=document.createElement('fieldset');dateRow.className='register-date-field';dateRow.innerHTML='<legend>Date range</legend>';dateRow.append(dates);fields.append(dateRow);
  field('Defect type',$('entry-filter-type'));
  const select=(name,label,options)=>{const input=document.createElement('select');input.id='log-'+name; input.setAttribute('aria-label',label);input.replaceChildren(...options.map(([v,t])=>new Option(t,v)));return field(label,input);};
  select('corridor','Corridor',[['','All corridors']]);select('bound','Bound',[['','All bounds']]);select('lane','Lane / position',[['','All lanes']]);
  const inspectorRow=field('Inspector',$('entry-filter-inspector'));
  const sourceRow=field('Source / import batch',$('entry-filter-source'));
  const photoRow=select('photo','Photo on device',[['','Any device photo'],['with','With device photo'],['without','Without device photo']]);
  select('status','Inspection status',[['','All inspection states'],['device','Saved on device'],['waiting','Waiting to submit'],['submitting','Submitting inspection'],['submitted','Inspection submitted'],['review','Needs review'],['imported','Imported']]);
  const filterIDs=['entry-filter-from','entry-filter-to','entry-filter-type','entry-filter-source','entry-filter-inspector','log-search','log-corridor','log-bound','log-lane','log-photo','log-status'];
  const keyOf=id=>id.startsWith('entry-filter-')?id.slice(13):id.slice(4);
  let filterApplied=false;
  const restoreFilters=f=>{for(const id of filterIDs) $(id).value=f[keyOf(id)]||'';};
  const draftCount=()=>{
    const f=getLogFilters(true),archive=Boolean(f.source&&!['mine'].includes(f.source));
    inspectorRow.hidden=myLogEnabled()&&!archive;$('entry-filter-inspector').disabled=myLogEnabled()&&!archive;
    from.max=to.value;to.min=from.value;$('log-filter-apply').textContent=`Apply Filters (${logRegisterItems(f).length})`;
  };
  sheet.addEventListener('change',event=>{event.stopImmediatePropagation();if(event.target.id==='entry-filter-source')syncFilterOptions(getLogFilters(true));draftCount();},true);
  filterButton.addEventListener('click',()=>{
    clearTimeout(searchTimer); window.logFilterBaseline=getLogFilters(); filterApplied=false; syncFilterOptions();draftCount();sheet.showModal();
  });
  sheet.querySelector('.register-close').onclick=()=>sheet.close();
  sheet.addEventListener('close',()=>{if(!filterApplied&&window.logFilterBaseline)restoreFilters(window.logFilterBaseline);window.logFilterBaseline=null;sync();filterButton.focus();});
  $('log-filter-reset').onclick=()=>{const f=getLogFilters(true);restoreFilters({search:f.search,source:['','mine','imported'].includes(f.source)?f.source:'imported'});draftCount();};
  $('log-filter-apply').onclick=()=>{if(!from.checkValidity()||!to.checkValidity()){from.reportValidity();to.reportValidity();return;}filterApplied=true;window.logFilterBaseline=null;sheet.close();applyEntryFilters();};
  document.querySelector('.entry-filters').hidden=true; document.querySelector('.sharing-filters').hidden=true;
  $('entry-filter-clear').hidden=true;
  const optionSet=(id,label,values)=>{const input=$(id),previous=input.value;const list=[...new Set(values.filter(v=>v!==null&&v!==undefined&&String(v)!=='').map(String))].sort();if(previous&&!list.includes(previous))list.push(previous);input.replaceChildren(new Option(label,''),...list.map(v=>new Option(v,v)));input.value=previous;};
  function syncFilterOptions(f=getLogFilters()){
    const team=myLogEnabled()&&logRecordScope==='team',archive=Boolean(f.source&&!['mine'].includes(f.source));
    const rows=logRegisterItems({source:f.source||''}).map(item=>item.local||SPOTITMyRecords.cloudDisplay(item.cloud));
    optionSet('log-corridor','All corridors',rows.map(e=>e.expressway));optionSet('log-bound','All bounds',rows.map(e=>e.bound));optionSet('log-lane','All lanes',rows.map(e=>e.lane));
    inspectorRow.hidden=myLogEnabled()&&!archive;sourceRow.hidden=team;photoRow.hidden=team;
    $('log-photo').disabled=team;
    if(team) $('log-photo').value='';
  }

  const data=document.createElement('dialog');data.id='log-data-actions';data.className='register-sheet register-data-sheet';data.setAttribute('aria-labelledby','log-data-title');
  data.innerHTML='<div class="register-sheet-head"><h2 id="log-data-title">Data Actions</h2><button type="button" class="register-close" aria-label="Close data actions">×</button></div><div class="register-data-body"><h3>Import on this device</h3><p>Excel (.xlsx) or supported Photos ZIP (.zip). Review duplicates and conflicts before importing.</p><div id="register-import-options"></div><h3>Export records on this device</h3><label class="register-filter-row"><span>Export scope</span><select id="log-export-scope"><option value="filtered">Filtered device records</option><option value="selected">Selected device records</option><option value="all">All eligible device records</option></select></label><p id="export-scope" role="status"></p><div class="export-format-options"></div><p>Excel with photos: Native in-cell photos for offline viewing. Submitted records from other devices and Team history are excluded. Photos come only from this device.</p></div>';
  document.body.append(data);
  const importButton=$('import-btn');importButton.textContent='Import Excel / Photos ZIP';data.querySelector('#register-import-options').append(importButton,$('import-history-btn'));
  for(const [id,text]of [['export-btn','Excel file'],['backup-btn','Excel with photos']]){const b=$(id);b.textContent=text;data.querySelector('.export-format-options').append(b);b.addEventListener('click',()=>{logExportMode=$('log-export-scope').value;data.close();},{capture:true});}
  for(const b of [importButton,$('import-history-btn')])b.addEventListener('click',()=>data.close(),{capture:true});
  data.querySelector('.register-close').onclick=()=>data.close();data.addEventListener('close',()=>dataButton.focus());
  window.closeLogRegisterSheets=()=>{if(sheet.open)sheet.close();if(data.open)data.close();};
  const exportScopeCount=()=>{
    importButton.disabled=!canViewTeamRecords()||sharingBusy;
    const mode=$('log-export-scope').value,f=mode==='all'?{}:getLogFilters();
    const device=mode==='all'?accessibleEntries():logRegisterItems(f).filter(item=>item.local).map(item=>item.local);
    const selected=device.filter(e=>selectedEntryIds.has(e.id));const count=mode==='selected'?selected.length:device.length;
    const blocked=myLogEnabled()&&logRecordScope==='team';
    $('export-scope').textContent=blocked?'Team history is read only. Open My Records or Imported for device exports.':`Export ${count} ${mode} ${count===1?'record':'records'} on this device.`;
    for(const id of ['export-btn','backup-btn'])$(id).disabled=blocked||!count||sharingBusy;
  };
  dataButton.addEventListener('click',()=>{$('log-export-scope').value=selectedEntryIds.size?'selected':'filtered';exportScopeCount();data.showModal();});
  $('log-export-scope').onchange=exportScopeCount;
  for(const element of view.querySelectorAll('.log-data-row,.log-hint-row'))if(!element.contains(bulkMount)&&!element.contains(actions))element.hidden=true;
  const names={from:'From',to:'To',type:'Defect',inspector:'Inspector',corridor:'Corridor',bound:'Bound',lane:'Lane',photo:'Device photo',status:'Inspection',search:'Search'};
  function sync(){
    const f=getLogFilters(),team=myLogEnabled()&&logRecordScope==='team',archive=Boolean(f.source&&!['mine'].includes(f.source));
    $('log-scope-my').textContent=authDisplayState?.mode==='guest'?'Device records':'My Records';
    $('log-scope-my').setAttribute('aria-pressed',String(!team&&!archive));$('log-scope-team').setAttribute('aria-pressed',String(team));imported.setAttribute('aria-pressed',String(archive));
    $('log-scope-team').hidden=authDisplayState?.mode==='guest';$('log-scope-team').disabled=!cloudRecordStore?.syncScope();imported.hidden=authDisplayState?.mode==='guest';imported.disabled=!canViewTeamRecords();
    const visible=visibleEntries();const shownCount = document.querySelectorAll('#log-list .log-entry').length;
    const n=visible.filter(e=>selectedEntryIds.has(e.id)).length;
    actions.classList.toggle('selection-mode',selectMode);toggle.textContent=selectMode?'Cancel':'Select';toggle.classList.toggle('active',selectMode);toggle.removeAttribute('aria-checked');toggle.setAttribute('aria-label',selectMode?'Cancel entry selection':'Select multiple device records');toggle.disabled=team||!visible.length;
    $('log-records-chip').textContent=selectMode?`${n} of ${visible.length} selected`:`${shownCount} ${shownCount===1?'inspection':'inspections'}`;
    badge.textContent=shownCount.toLocaleString('en-US');bulkMount.hidden=!selectMode;selectAll.hidden=!selectMode;deleteSelected.hidden=!selectMode;deleteSelected.textContent=`Delete (${n})`;deleteSelected.disabled=!n;
    const total=logRegisterItems({source:f.source||''}).length;
    coverage.textContent=team?`Filtered from ${total} loaded team records`:myLogEnabled()&&!archive?`From ${total} device and loaded records`:`From ${total} records on this device`;
    if(archive) $('my-record-status').textContent='Imported archive · Records and photos on this device.';
    else if(!myLogEnabled()) $('my-record-status').textContent=SPOTITLogRegister.historyUnavailable(inspectionContext(),navigator.onLine!==false);
    chips.replaceChildren();for(const [key,label]of Object.entries(names)){if(!f[key])continue;const id=key==='search'||['corridor','bound','lane','photo','status'].includes(key)?'log-'+key:'entry-filter-'+key;const input=$(id),value=input.tagName==='SELECT'?input.selectedOptions[0]?.textContent||f[key]:f[key];const chip=button('',`${label}: ${value} ×`);chip.setAttribute('aria-label',`Remove ${label.toLowerCase()} filter`);chip.onclick=()=>{input.value='';applyEntryFilters();};chips.append(chip);}
    if(f.source&&!['mine','imported'].includes(f.source)){const chip=button('','Import batch ×');chip.onclick=()=>{$('entry-filter-source').value='imported';applyEntryFilters();};chips.append(chip);}
    if(chips.children.length){const clear=button('log-clear-all','Clear all');clear.onclick=()=>{restoreFilters({source:archive?'imported':f.source});applyEntryFilters();};chips.append(clear);}chips.hidden=!chips.children.length;
    if(data.open)exportScopeCount();
  }
  window.syncLogRegisterControls=()=>{queueMicrotask(sync);};
  new MutationObserver(sync).observe($('log-list'),{childList:true});
  new MutationObserver(()=>{if(data.open)exportScopeCount();}).observe($('my-record-status'),{childList:true});
  sync();
});
