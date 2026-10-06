/* More presentation only: reads existing state and retains existing controls. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SPOTITMore = api;
})(globalThis, function() {
  'use strict';
  const BUILD = 'v242';
  function route(value) {
    return ['more', 'settings-tab', 'settings-view', 'tools', 'tools-tab', 'tools-view'].includes(value) ? 'settings' : value;
  }
  function snapshot(state) {
    const entries = state.entries || [], counts = state.counts || {};
    const submitted = entries.filter(e => e.sync_status === 'synced' && e.remote_id === e.id);
    const stamps = submitted.map(e => Date.parse(e.synced_at)).filter(Number.isFinite);
    const last = stamps.length ? new Date(Math.max(...stamps)).toLocaleString('en-PH')
      : submitted.length ? 'Not available' : 'Never synced';
    return [
      ['App build', BUILD],
      ['Connection', state.online ? 'Online' : 'Offline'],
      ['Stationing alignment', state.alignment || 'Not loaded'],
      ['Interchange lines', state.ramps || 'Not loaded'],
      ['Dataset versions', 'Not available'],
      ['Last successful inspection sync (device records)', last],
      ['Local inspections (saved on device)', entries.length],
      ['Local photo references', new Set(entries.map(e => e.photoId).filter(Boolean)).size],
      ['Verified local photo bytes', 'Not checked'],
      ['Pending inspection sync', counts.pending ?? 'Unknown'],
      ['Submitting inspections', counts.syncing ?? 'Unknown'],
      ['Failed inspection sync', counts.failed ?? 'Unknown'],
      ['Review-needed inspections', counts.needs_review ?? 'Unknown'],
      ['Unsaved inspections', counts.unsaved ?? 'Unknown'],
      ['Photo transport', typeof state.photoTransport === 'boolean' ? state.photoTransport ? 'Enabled' : 'Disabled' : 'Unknown']
    ];
  }
  function profile(state) {
    const auth = state.auth || {}, p = auth.profile || {};
    return [['Display name', p.full_name || 'Not available'], ['Email', auth.email || 'No account signed in'],
      ['Role', p.role || 'Not available'], ['Assigned team', p.team || 'Not assigned'],
      ['Approval', typeof p.approved === 'boolean' ? p.approved ? 'Approved' : 'Pending approval' : 'Not available'],
      ['Account state', auth.mode === 'guest' ? 'Guest / Local Mode' : String(auth.mode || 'Unknown').replaceAll('-', ' ')],
      ['Cloud verification', auth.cloudVerified === true ? 'Verified online' : 'Not currently verified online']];
  }
  function mount(doc, read) {
    const homeNode = doc.getElementById('more-home'), screens = [...doc.querySelectorAll('.more-screen')];
    let active = null, opener = null, scheduled = false, generation = 0;
    const worker = [['Service worker', 'Checking'], ['Installed shell caches', 'Checking']];
    function values(id, rows) {
      const node = doc.getElementById(id);
      const signature = JSON.stringify(rows);
      if (node.dataset.values === signature) return;
      node.dataset.values = signature;
      node.replaceChildren(...rows.map(([label, value]) => {
        const row = doc.createElement('div'), dt = doc.createElement('dt'), dd = doc.createElement('dd');
        dt.textContent = label; dd.textContent = String(value); row.append(dt, dd); return row;
      }));
    }
    function refresh() {
      if (!active || doc.getElementById('settings-view').hidden) return;
      const state = read();
      values('more-profile-values', profile(state));
      values('more-diagnostic-values', [...snapshot(state), ...worker]);
      values('more-storage-values', [['Local storage', state.storageAvailable ? 'Writable' : 'Blocked'],
        ['Local inspections (saved on device)', state.entries.length],
        ['Local photo references', new Set(state.entries.map(e => e.photoId).filter(Boolean)).size],
        ['Photo bytes', 'Not checked'], ['Offline app shell', 'See Diagnostics for installed cache state']]);
    }
    async function inspectWorker() {
      const token = ++generation;
      let status = 'Not supported', names = 'Not available';
      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          status = !reg ? 'Not registered' : `${reg.active ? reg.active.state : 'No active worker'}; ${navigator.serviceWorker.controller ? 'controlling this page' : 'not controlling this page'}`;
        }
        if ('caches' in globalThis) {
          const shells = (await caches.keys()).filter(name => /^spotit-shell-v\d+$/.test(name));
          names = shells.length ? shells.join(', ') : 'No shell cache found';
        }
      } catch (_) { status = 'Not available'; }
      if (token !== generation) return;
      worker[0][1] = status; worker[1][1] = names; refresh();
    }
    function home(focus = false) {
      active = null; generation++; homeNode.hidden = false; screens.forEach(node => node.hidden = true);
      if (focus) (opener || doc.getElementById('more-heading')).focus();
    }
    doc.querySelectorAll('[data-more-open]').forEach(button => button.addEventListener('click', () => {
      opener = button; active = button.dataset.moreOpen; homeNode.hidden = true;
      screens.forEach(node => node.hidden = node.id !== `more-${active}`);
      if (active === 'datasets') doc.getElementById('dataset-drawer').open = true;
      refresh(); if (active === 'diagnostics') inspectWorker();
      doc.getElementById(`more-${active}-heading`).focus();
    }));
    doc.querySelectorAll('[data-more-back]').forEach(button => button.addEventListener('click', () => home(true)));
    doc.getElementById('settings-view').addEventListener('keydown', event => {
      if (event.key === 'Escape' && active) { event.preventDefault(); home(true); }
    });
    doc.getElementById('more-diagnostics-refresh').addEventListener('click', () => { refresh(); inspectWorker(); });
    const observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true; requestAnimationFrame(() => { scheduled = false; refresh(); });
    });
    ['calib-status', 'ramp-status', 'auth-settings-state', 'sync-menu', 'storage-pill-text'].forEach(id => {
      const node = doc.getElementById(id); if (node) observer.observe(node, {subtree:true, childList:true, characterData:true});
    });
    window.addEventListener('online', refresh); window.addEventListener('offline', refresh);
    home(); return {home, refresh};
  }
  return {BUILD, route, snapshot, profile, mount};
});
