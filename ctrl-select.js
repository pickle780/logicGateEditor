/* ctrl-select.js
   Ctrl / Cmd click and box-select multi-selection.
   Responsibilities:
     - Ctrl+click a node → toggle it in/out of multi-selection
     - Ctrl+drag on empty canvas → additive box-select (keeps existing selection)
     - Releasing Ctrl has no effect; clicking empty area normally clears selection

   Load after: freeze.js  (last addon in the chain)
*/
(function () {
  'use strict';
  if (typeof render !== 'function' || !svg) return;

  /* Guard: only install once even if the file is somehow loaded twice. */
  if (svg.dataset.ctrlSelectReady) return;
  svg.dataset.ctrlSelectReady = '1';

  var NW = 90, NH = 54;   /* must match portPos() in app.js */

  /* ── Helpers ────────────────────────────────────────────────────── */
  function allNodes() {
    return (typeof exportObj === 'function' ? exportObj().nodes : (circuit || {}).nodes) || [];
  }

  function nodeAtPt(pt) {
    return allNodes().slice().reverse().find(function (n) {
      return pt.x >= n.x && pt.x <= n.x + NW && pt.y >= n.y && pt.y <= n.y + NH;
    }) || null;
  }

  /* Snapshot current selection (multi + single) into a Set of ids.  */
  function snapshotIds() {
    var s = new Set();
    if (typeof multiSelectedIds !== 'undefined' && multiSelectedIds)
      multiSelectedIds.forEach(function (id) { if (nodeAtPt({x: 0, y: 0}) !== null || true) s.add(id); });
    if (typeof selected !== 'undefined' && selected && selected.type === 'node')
      s.add(selected.id);
    return s;
  }

  function mergeIds(ids) {
    if (!ids || !multiSelectedIds) return;
    ids.forEach(function (id) {
      if (allNodes().some(function (n) { return n.id === id; })) multiSelectedIds.add(id);
    });
    if (multiSelectedIds.size) selected = null;
  }

  /* ── Ctrl box-select state ──────────────────────────────────────── */
  var ctrlBox = null;   /* { baseIds: Set }  active during Ctrl drag */

  /* ── SVG capture-phase mousedown ────────────────────────────────── */
  svg.addEventListener('mousedown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return;
    if (e.target && e.target.classList && e.target.classList.contains('port')) return;

    var pt   = screenToWorld(e.clientX, e.clientY);
    var node = nodeAtPt(pt);

    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();

    if (node) {
      /* ── Toggle single node ─────────────────────────────────────── */
      /* If there's a current single-selection, move it into multiSelectedIds first. */
      if (typeof selected !== 'undefined' && selected && selected.type === 'node' &&
          selected.id !== node.id && !multiSelectedIds.has(selected.id))
        multiSelectedIds.add(selected.id);

      if (multiSelectedIds.has(node.id)) {
        multiSelectedIds.delete(node.id);
      } else if (typeof selected !== 'undefined' && selected &&
                 selected.type === 'node' && selected.id === node.id &&
                 multiSelectedIds.size === 0) {
        selected = null;
      } else {
        multiSelectedIds.add(node.id);
      }

      if (multiSelectedIds.size) selected = null;
      if (typeof setStatus === 'function') setStatus('Ctrl 多选：' + node.name);
      render();

    } else if (e.target === svg) {
      /* ── Start additive box-select ──────────────────────────────── */
      var pos = screenToWorld(e.clientX, e.clientY);
      ctrlBox     = { baseIds: snapshotIds() };
      selectionBox = { startX: pos.x, startY: pos.y, x: pos.x, y: pos.y, active: true };
      connectFrom  = null;
      ghostPoint   = null;
      mergeIds(ctrlBox.baseIds);
      if (typeof setStatus === 'function') setStatus('Ctrl 框选：追加到当前选择，不清空已有选择');
      render();
    }
  }, true);

  /* Prevent the Ctrl+click from also firing a normal click event     */
  svg.addEventListener('click', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  }, true);

  /* ── Global mouse handlers for Ctrl box-select ──────────────────── */
  window.addEventListener('mousemove', function () {
    if (!ctrlBox) return;
    mergeIds(ctrlBox.baseIds);
    render();
  });

  window.addEventListener('mouseup', function () {
    if (!ctrlBox) return;
    mergeIds(ctrlBox.baseIds);
    ctrlBox = null;
    render();
  });
})();
