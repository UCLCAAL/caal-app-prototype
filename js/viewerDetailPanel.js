/* A selected record survives minimising; closing a record clears the drawer. */
(function (root) {
  'use strict';
  function createViewerDetailPanel({shell, pane, toggle, minimise, notifyResize, focusFallback}) {
    let selectedKey = null;
    let isOpen = false;
    function expanded(value) {
      const open = value && selectedKey !== null;
      isOpen = open;
      shell.classList.toggle('details-collapsed', !open);
      pane.inert = !open;
      pane.setAttribute('aria-hidden', String(!open));
      toggle.setAttribute('aria-expanded', String(open));
      toggle.hidden = selectedKey === null;
      const action = open ? 'Minimise record details' : 'Show record details';
      toggle.setAttribute('aria-label', action);
      toggle.setAttribute('title', action);
      notifyResize();
    }
    function open() { expanded(true); }
    function collapse() {
      const restoreFocus = pane.contains(root.document?.activeElement);
      expanded(false);
      if (restoreFocus && !toggle.hidden) toggle.focus();
    }
    function clear() {
      const restoreFocus = pane.contains(root.document?.activeElement);
      selectedKey = null;
      expanded(false);
      if (restoreFocus) focusFallback?.focus();
    }
    function select(key) {
      const changed = selectedKey !== key;
      selectedKey = key;
      if (changed) open();
    }
    toggle.addEventListener('click', () => isOpen ? collapse() : open());
    minimise.addEventListener('click', collapse);
    pane.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); collapse(); }
    });
    shell.addEventListener('transitionend', event => {
      if (event.target === shell) notifyResize();
    });
    expanded(false);
    return {open, minimise: collapse, clear, select};
  }
  if (typeof module !== 'undefined') module.exports = {createViewerDetailPanel};
  if (!root.document) return;
  const shell = root.document.querySelector('[data-viewer-drawer]');
  if (!shell) return;
  const edgeToggle = root.document.getElementById('viewerDetailToggle');
  // Reuse the previous update's controls so both pages need no new auth markup patch.
  shell.append(edgeToggle);
  edgeToggle.className = 'viewer-detail-edge-toggle';
  edgeToggle.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path d="m4 6 6 6-6 6m8-12 6 6-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  root.document.getElementById('viewerDetailMinimise').hidden = true;
  let frame;
  const notifyResize = () => {
    root.cancelAnimationFrame(frame);
    frame = root.requestAnimationFrame(() => root.dispatchEvent(new root.Event('viewer:layoutchange')));
  };
  root.viewerDetailPanel = createViewerDetailPanel({
    shell, pane: root.document.getElementById('viewerDetailPane'),
    toggle: root.document.getElementById('viewerDetailToggle'),
    minimise: root.document.getElementById('viewerDetailMinimise'), notifyResize,
    focusFallback: shell.querySelector('input')
  });
  // Grid animation changes container dimensions without a window resize.
  if (root.ResizeObserver) new root.ResizeObserver(notifyResize).observe(shell.querySelector('.map-pane'));
})(typeof window !== 'undefined' ? window : globalThis);
