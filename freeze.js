/* freeze.js
   Freeze probe values so they stay stable during circuit edits.
   Responsibilities:
     - Intercept getTruthTables() to inject frozen snapshots
     - Wrap render() to draw freeze badges after each repaint
     - Build and maintain the Freeze panel in the left sidebar
     - Integrate with the context menu (add freeze items via MutationObserver)
     - Override copySelectedProbe() for multi-node support

   Load after: truth-map.js
   Load before: ctrl-select.js  (no hard dependency)
*/
(function () {
  'use strict';
  if (typeof getTruthTables !== 'function' || typeof render !== 'function') return;

  /* ── Preserve originals ─────────────────────────────────────────── */
  var origGetTruth          = getTruthTables;
  var origRender            = render;
  var origUpdateInfo        = typeof updateInfo        === 'function' ? updateInfo        : null;
  var origCopySelectedProbe = typeof copySelectedProbe === 'function' ? copySelectedProbe : null;

  /* ── Freeze state ───────────────────────────────────────────────── */
  var freezeOn = false;
  var frozen   = Object.create(null);
  /* frozen[nodeId] = { nodeId, name, type, value:'0101…', capturedAt:'HH:MM:SS' } */

  /* ── Node helpers ───────────────────────────────────────────────── */
  function allNodes()    { return (typeof exportObj === 'function' ? exportObj().nodes : (circuit || {}).nodes) || []; }
  function nodeById(id)  { return allNodes().find(function (n) { return n.id === id; }) || null; }
  function frozenCount() { return Object.keys(frozen).length; }
  function nowLabel() {
    var d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map(function (n) { return String(n).padStart(2, '0'); }).join(':');
  }

  /* Active selection ids (multi or single node) */
  function activeIds() {
    var ids = [];
    if (typeof multiSelectedIds !== 'undefined' && multiSelectedIds && multiSelectedIds.size)
      multiSelectedIds.forEach(function (id) { if (nodeById(id)) ids.push(id); });
    else if (typeof selected !== 'undefined' && selected && selected.type === 'node' && nodeById(selected.id))
      ids.push(selected.id);
    return ids;
  }

  /* ── Freeze / unfreeze actions ──────────────────────────────────── */
  function captureNode(nodeId) {
    var node = nodeById(nodeId); if (!node) return false;
    var truth = origGetTruth();
    frozen[nodeId] = {
      nodeId: nodeId, name: node.name, type: node.type,
      value: (truth.values[nodeId] || []).join(''),
      capturedAt: nowLabel()
    };
    return true;
  }

  function freezeNode(nodeId, silent) {
    if (!captureNode(nodeId)) return false;
    freezeOn = true;
    if (!silent && typeof setStatus === 'function')
      setStatus('已冻结 ' + (nodeById(nodeId) || {name: nodeId}).name + ' 的探针值');
    render(); return true;
  }

  function refreshFrozen(nodeId) {
    if (!captureNode(nodeId)) return false;
    freezeOn = true;
    if (typeof setStatus === 'function')
      setStatus('已刷新冻结值：' + (nodeById(nodeId) || {name: nodeId}).name);
    render(); return true;
  }

  function unfreezeNode(nodeId) {
    var snap = frozen[nodeId]; delete frozen[nodeId];
    if (typeof setStatus === 'function') setStatus(snap ? '已取消冻结 ' + snap.name : '已取消冻结');
    render();
  }

  function freezeSelected() {
    var ids = activeIds();
    if (!ids.length) { alert('请先选择一个或多个节点'); return; }
    var count = 0;
    ids.forEach(function (id) { if (freezeNode(id, true)) count++; });
    freezeOn = true;
    if (typeof setStatus === 'function') setStatus('已冻结 ' + count + ' 个选中节点');
    render();
  }

  function freezeAll() {
    var count = 0;
    allNodes().forEach(function (n) { if (freezeNode(n.id, true)) count++; });
    freezeOn = true;
    if (typeof setStatus === 'function') setStatus('已冻结所有节点：' + count + ' 个');
    render();
  }

  function clearFrozen() {
    frozen = Object.create(null);
    if (typeof setStatus === 'function') setStatus('已清空冻结探针');
    render();
  }

  function setFreezeOn(val) {
    freezeOn = !!val;
    if (typeof setStatus === 'function')
      setStatus(freezeOn ? 'Freeze Mode 已开启' : 'Freeze Mode 已关闭，恢复实时计算');
    render();
  }

  /* ── getTruthTables override ────────────────────────────────────── */
  /* Injects frozen snapshots into the result for display purposes.
     Unfrozen + new nodes are still computed normally by origGetTruth. */
  getTruthTables = function () {
    var truth = origGetTruth();
    if (!freezeOn) return truth;
    Object.keys(frozen).forEach(function (id) {
      var s = frozen[id];
      if (s && typeof s.value === 'string') truth.values[id] = s.value.split('');
    });
    return truth;
  };

  /* ── Freeze panel UI (injected into left sidebar) ───────────────── */
  var panelEl = null;

  function ensurePanel() {
    if (panelEl && panelEl.parentNode) return panelEl;

    var anchor = document.getElementById('highlightSameTruth');
    if (!anchor) return null;
    var label  = anchor.closest ? anchor.closest('label') : anchor.parentNode;
    var parent = label && label.parentNode ? label.parentNode : anchor.parentNode;

    panelEl = document.createElement('div');
    panelEl.id        = 'freezePanel';
    panelEl.className = 'freeze-panel';

    var h = document.createElement('h3'); h.textContent = 'Freeze Mode'; panelEl.appendChild(h);

    var row = document.createElement('label'); row.className = 'freeze-check-row';
    var chk = document.createElement('input'); chk.type = 'checkbox'; chk.id = 'freezeCheckbox';
    chk.onchange = function () { setFreezeOn(chk.checked); };
    row.appendChild(chk);
    var span = document.createElement('span'); span.textContent = '开启 Freeze Mode'; row.appendChild(span);
    panelEl.appendChild(row);

    var btns = document.createElement('div'); btns.className = 'freeze-buttons';
    function btn(txt, cls, fn, tip) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = txt;
      if (cls) b.className = cls; if (tip) b.title = tip;
      b.onclick = function (e) { e.preventDefault(); e.stopPropagation(); fn(); };
      btns.appendChild(b);
    }
    btn('冻结选中', 'ok',     freezeSelected, '支持框选和 Ctrl/Cmd 多选');
    btn('冻结全部', '',        freezeAll,      '冻结当前所有节点');
    btn('清空冻结', 'danger',  clearFrozen,    '清空所有冻结快照');
    panelEl.appendChild(btns);

    var hint = document.createElement('div'); hint.className = 'hint freeze-hint';
    hint.textContent = '冻结后被冻结节点显示快照值；新增节点和未冻结节点仍正常参与实时计算。';
    panelEl.appendChild(hint);

    if (label && label.nextSibling)
      parent.insertBefore(panelEl, label.nextSibling.nextSibling || label.nextSibling);
    else
      parent.appendChild(panelEl);

    return panelEl;
  }

  function updatePanel() {
    var panel = ensurePanel(); if (!panel) return;
    var chk = document.getElementById('freezeCheckbox');
    if (chk) chk.checked = freezeOn;
    var h = panel.querySelector('h3');
    if (h) h.textContent = 'Freeze Mode' + (frozenCount() ? ' · ' + frozenCount() : '');
    panel.classList.toggle('freeze-on', freezeOn);
  }

  /* ── Freeze badges (drawn on SVG over nodes) ────────────────────── */
  function drawFreezeBadges() {
    if (!svg) return;
    Object.keys(frozen).forEach(function (nodeId) {
      var node = nodeById(nodeId); if (!node) return;
      var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'freeze-badge' + (freezeOn ? '' : ' freeze-badge-off'));
      g.setAttribute('transform', 'translate(' + (node.x - 8) + ',' + (node.y - 13) + ')');

      var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', 24); rect.setAttribute('height', 18); rect.setAttribute('rx', 7);
      g.appendChild(rect);

      var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', 12); text.setAttribute('y', 13); text.setAttribute('text-anchor', 'middle');
      text.textContent = 'F'; g.appendChild(text);

      var title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = 'Frozen: ' + frozen[nodeId].name + ' = ' + frozen[nodeId].value; g.appendChild(title);

      svg.appendChild(g);
    });
  }

  /* ── Context-menu integration ───────────────────────────────────── */
  /* Watches for the .ctx-menu element to appear and appends freeze items. */
  new MutationObserver(function () {
    var menu = document.querySelector('.ctx-menu');
    if (!menu || menu.dataset.freezeReady) return;
    menu.dataset.freezeReady = '1';

    /* Get the node that was right-clicked via menu.js's exposed helper. */
    var nodeId = typeof window._getLastCtxNodeId === 'function' ? window._getLastCtxNodeId() : null;
    if (!nodeId || !nodeById(nodeId)) return;

    var sep = document.createElement('div'); sep.className = 'ctx-sep'; menu.appendChild(sep);

    function item(lbl, fn, active) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = lbl;
      if (active) b.className = 'freeze-menu-active';
      b.onclick = function (e) {
        e.preventDefault(); e.stopPropagation(); fn();
        if (menu.parentNode) menu.parentNode.removeChild(menu);
      };
      menu.appendChild(b);
    }

    if (frozen[nodeId]) {
      item('Refresh freeze value', function () { refreshFrozen(nodeId); });
      item('Unfreeze this node',   function () { unfreezeNode(nodeId); }, true);
    } else {
      item('Freeze this value', function () { freezeNode(nodeId); });
    }
    item(freezeOn ? 'Freeze Mode OFF' : 'Freeze Mode ON', function () { setFreezeOn(!freezeOn); }, freezeOn);
  }).observe(document.body, { childList: true, subtree: true });

  /* ── copySelectedProbe override ─────────────────────────────────── */
  copySelectedProbe = function () {
    var ids = activeIds();
    if (!ids.length) { if (origCopySelectedProbe) return origCopySelectedProbe(); alert('请先选择节点'); return; }
    var truth = getTruthTables();
    var text  = ids.map(function (id) {
      return (nodeById(id) || {name: id}).name + ': ' + truthString(id, truth);
    }).join('\n');
    copyText(text, ids.length > 1 ? '已复制多个探针 01' : '已复制探针 01');
  };

  if (origUpdateInfo) {
    updateInfo = function () {
      origUpdateInfo();
      var ta = document.getElementById('selectedProbeText'); if (!ta) return;
      var ids = activeIds(); if (!ids.length) return;
      var truth = getTruthTables();
      ta.value = ids.map(function (id) {
        return (nodeById(id) || {name: id}).name + ': ' + truthString(id, truth);
      }).join('\n');
    };
  }

  /* ── Wrap render ────────────────────────────────────────────────── */
  /* Add freeze badges + panel update after every repaint.            */
  render = function () {
    origRender();
    drawFreezeBadges();
    updatePanel();
    /* Sync selected-probe textarea */
    var ta = document.getElementById('selectedProbeText'); if (!ta) return;
    var ids = activeIds(); if (!ids.length) return;
    var truth = getTruthTables();
    ta.value = ids.map(function (id) {
      return (nodeById(id) || {name: id}).name + ': ' + truthString(id, truth);
    }).join('\n');
  };

  /* ── Public API ─────────────────────────────────────────────────── */
  window.freezeProbeValue     = freezeNode;
  window.unfreezeProbeValue   = unfreezeNode;
  window.freezeAllProbeValues = freezeAll;
  window.clearFrozenProbes    = clearFrozen;
  window.toggleFreezeMode     = function () { setFreezeOn(!freezeOn); };

  ensurePanel();
  render();
})();
