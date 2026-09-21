/* Reuse existing export handlers and stable-ID selection; no format changes. */
document.addEventListener('DOMContentLoaded', () => {
  // Match the reference's iconography: import is an UP arrow (upload), export
  // is a DOWN arrow (download). This was previously inverted.
  const icon = direction => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v6h16v-6M12 3v12${direction === 'in' ? 'M7 8l5-5 5 5' : 'M7 10l5 5 5-5'}"/></svg>`;
  const header = document.querySelector('.log-header');
  header.classList.add('log-toolbar');
  const badge=document.createElement('span');badge.id='log-count-badge';badge.className='log-count-badge';badge.setAttribute('role','status');
  header.querySelector('h2').append(badge);
  document.getElementById('import-btn').innerHTML = `${icon('in')}<span>Import</span>`;
  const exportMenu = document.createElement('button');
  exportMenu.type = 'button'; exportMenu.id = 'export-menu-btn';
  exportMenu.className = 'ds-btn ds-btn-primary';
  exportMenu.innerHTML = `${icon('out')}<span>Export</span>`;
  exportMenu.setAttribute('aria-haspopup','dialog');
  // The Log tab's data card hosts Export AND the selection controls; fall back
  // to the register toolbar if that mount point is absent (older shell/tests).
  const exportMount = document.getElementById('log-export-actions') || header;
  exportMount.append(exportMenu);
  const dialog = document.createElement('dialog');
  dialog.className = 'sharing-dialog export-format-dialog';
  dialog.setAttribute('aria-labelledby','export-format-title');
  // The export card's explanatory line moved in here, so the Log tab can show
  // a bare action row instead of a card.
  dialog.innerHTML = '<h2 id="export-format-title">Export inspections</h2><p id="export-scope"></p><p class="export-hint">Use Excel for review, or a backup for a complete restore.</p><div class="export-format-options"></div><form method="dialog"><button value="cancel">Cancel</button></form>';
  document.body.append(dialog);
  const options = dialog.querySelector('.export-format-options');
  for(const [id,title,description] of [['export-btn','Excel file only','Inspection records without photo files'],['backup-btn','Excel with photos','Native in-cell photos for offline viewing']]){
    const button = document.getElementById(id); options.append(button);
    button.innerHTML = `<strong>${title}</strong><span>${description}</span>`;
    button.addEventListener('click',()=>dialog.close(),{capture:true});
  }
  document.querySelector('.export-actions')?.remove();
  exportMenu.addEventListener('click',()=>{
    const scope = KMTrackEntryFilters.exportScope(entries,getLogFilters(),selectedEntryIds);
    const kind = selectedEntryIds.size ? 'selected' : Object.values(getLogFilters()).some(Boolean) ? 'filtered' : 'saved';
    document.getElementById('export-scope').textContent = `Export ${scope.entries.length} ${kind} ${scope.entries.length === 1 ? 'entry' : 'entries'}.`;
    dialog.showModal();
  });
  const filters = document.querySelector('.entry-filters');
  filters.classList.add('log-date-filters');
  const menu = document.createElement('details'); menu.className = 'log-filter-menu';
  menu.innerHTML = '<summary aria-label="Defect filters" title="Defect filters"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6 7v6l-4 2v-8z"/></svg></summary><div class="log-filter-options"></div>';
  const filterOptions = menu.querySelector('div');
  filterOptions.append(document.getElementById('entry-filter-type').parentElement,document.getElementById('entry-filter-clear'));
  filters.append(menu);
  document.getElementById('entry-filter-type').addEventListener('change',()=>{menu.open=false;});
  document.getElementById('entry-filter-clear').addEventListener('click',()=>{menu.open=false;});
  document.addEventListener('click',event=>{if(!menu.contains(event.target)) menu.open=false;});
  menu.addEventListener('keydown',event=>{if(event.key === 'Escape'){menu.open=false;menu.querySelector('summary').focus();}});
  const source = document.querySelector('.sharing-filters');
  const toggle = document.getElementById('select-toggle-btn');
  toggle.textContent = 'Select';
  const sourceFields = source.querySelector('.sharing-filter-fields');
  filterOptions.insertBefore(sourceFields,document.getElementById('entry-filter-clear'));
  source.remove();
  menu.querySelector('summary').setAttribute('aria-label','Inspection filters');
  menu.querySelector('summary').title='Inspection filters';
  const importHistory=document.getElementById('import-history-btn');
  importHistory.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
  importHistory.setAttribute('aria-label','Imported files');
  importHistory.title='Imported files';
  const importMount=document.getElementById('log-import-actions');
  if(!importMount) header.append(importHistory);
  const list=document.getElementById('log-list');list.classList.add('inspection-record-list');
  const selectAll=document.getElementById('bulk-select-all-btn'),deleteSelected=document.getElementById('bulk-delete-btn');
  // The old `.log-action-footer` panel is gone. Select sits with the list it
  // acts on, in the register toolbar. The Capture tab hides this group via
  // `.inspection-view .log-select-actions`, so Select is a Log-tab affordance.
  // Select pairs with the records chip in the Log tab's head. The mount is
  // already the `.log-select-actions` flex item, so the count/toggle go straight
  // into it; older shells without the mount get a wrapper in the toolbar.
  // `actions` must stay in scope: sync() toggles `selection-mode` on it.
  // Select joins Export and Import in the data row, flushed right. The bulk
  // actions get a row of their own ABOVE that one, revealed on click.
  const selectMount=document.getElementById('log-select-actions');
  const bulkMount=document.getElementById('log-bulk-actions');
  let actions=selectMount;
  if(!actions){
    actions=document.createElement('div');actions.className='log-select-actions';
    header.append(actions);
  }
  actions.append(toggle);
  (bulkMount || actions).append(selectAll,deleteSelected);
  document.getElementById('bulk-actions-bar').hidden=true;
  const legacyCount=document.querySelector('.count-bar');legacyCount.classList.add('log-result-count');legacyCount.hidden=true;
  document.getElementById('last-time').hidden=true;
  document.querySelector('.count-divider').hidden=true;
  selectAll.hidden=true;deleteSelected.hidden=true;
  const sync = () => {
    const visible = visibleEntries(), n = visible.filter(entry=>selectedEntryIds.has(entry.id)).length;
    const all = n > 0 && n === visible.length;
    actions.classList.toggle('selection-mode',selectMode);
    toggle.classList.toggle('active',selectMode);
    toggle.removeAttribute('role');
    toggle.removeAttribute('aria-checked');
    toggle.setAttribute('aria-label',selectMode ? 'Cancel entry selection' : 'Select multiple entries');
    toggle.textContent = selectMode ? 'Cancel' : 'Select';
    toggle.title = toggle.getAttribute('aria-label'); toggle.disabled = !visible.length;
    /* The records chip IS the selection readout, so there is no separate
       "N selected" text competing with it. "records" is dropped while selecting
       so the chip still fits beside the title without wrapping — measured at
       371px needed vs 358px available when the word is kept. */
    const chip=document.getElementById('log-records-chip');
    if(chip) chip.textContent = selectMode
      ? `${n} of ${visible.length} selected`
      : `${visible.length} ${visible.length === 1 ? 'record' : 'records'}`;
    badge.textContent=visible.length.toLocaleString('en-US');
    badge.setAttribute('aria-label',`${visible.length} ${Object.values(getLogFilters()).some(Boolean)?'filtered ':''}${visible.length===1?'entry':'entries'}`);
    if(bulkMount) bulkMount.hidden=!selectMode;
    selectAll.hidden=!selectMode;
    deleteSelected.hidden=!selectMode;
    deleteSelected.textContent=`Delete (${n})`;
    deleteSelected.setAttribute('aria-label',`Delete ${n} selected entries`);
    exportMenu.querySelector('span').textContent=n ? 'Export selected' : 'Export';
    exportMenu.disabled = !visible.length || sharingBusy || document.getElementById('export-btn').disabled;
    menu.classList.toggle('filtered',Object.values(getLogFilters()).some(Boolean));
  };
  new MutationObserver(sync).observe(document.getElementById('log-list'),{childList:true});
  new MutationObserver(sync).observe(document.getElementById('export-btn'),{attributes:true,attributeFilter:['disabled']});
  sync();
});
