/* truth-map.js
   Truth-table map popup modal.
   Responsibilities:
     - Build the axis-strip (drag chips to reorder row / col inputs)
     - Build the folded grid (corner reveal buttons for input names)
     - Modal header drag + minimize
     - Expose window.openTruthMap(nodeId) for menu.js to call

   Load after: menu.js
   Load before: freeze.js  (no hard dependency)
*/
(function () {
  'use strict';

  /* ── Module state ───────────────────────────────────────────────── */
  var tmOverlay = null;   /* the dim overlay / floating container */
  var tmModal   = null;   /* the modal div */
  var tmNodeId  = null;   /* which node we're showing */
  var tmLayout  = null;   /* { rowIds: [], colIds: [] } */
  var axisDrag  = null;   /* chip drag state */
  var modalDrag = null;   /* { sx, sy, l, t } header drag */

  /* ── Layout helpers ─────────────────────────────────────────────── */
  function normalizeLayout(truth) {
    var safe   = truth.inputNodes.slice(0, 12);
    var allIds = safe.map(function (n) { return n.id; });
    var used   = {};

    if (!tmLayout) {
      var mid = Math.floor(allIds.length / 2);
      tmLayout = { rowIds: allIds.slice(0, mid), colIds: allIds.slice(mid) };
    }

    var row = [], col = [];
    tmLayout.rowIds.forEach(function (id) { if (allIds.indexOf(id) >= 0 && !used[id]) { row.push(id); used[id] = true; } });
    tmLayout.colIds.forEach(function (id) { if (allIds.indexOf(id) >= 0 && !used[id]) { col.push(id); used[id] = true; } });
    allIds.forEach(function (id) {
      if (!used[id]) { (row.length < Math.floor(allIds.length / 2) ? row : col).push(id); used[id] = true; }
    });
    tmLayout = { rowIds: row, colIds: col };
  }

  function bits(index, width) {
    var b = [];
    for (var i = 0; i < width; i++) b.push((index >> (width - 1 - i)) & 1);
    return b;
  }

  function inputById(truth, id) { return truth.inputNodes.find(function (n) { return n.id === id; }); }
  function inputName(truth, id) { var n = inputById(truth, id); return n ? n.name : id; }

  function truthRowFor(truth, assignment) {
    var idx = 0;
    truth.inputNodes.slice(0, 12).forEach(function (n) { idx = (idx << 1) | Number(assignment[n.id] || 0); });
    return idx;
  }

  function moveToAxis(id, axis, position) {
    var row = tmLayout.rowIds.filter(function (x) { return x !== id; });
    var col = tmLayout.colIds.filter(function (x) { return x !== id; });
    var list = axis === 'row' ? row : col;
    list.splice(Math.max(0, Math.min(position, list.length)), 0, id);
    tmLayout = { rowIds: row, colIds: col };
  }

  /* ── Axis strip (drag-to-reorder input chips) ───────────────────── */
  function buildStrip(container, truth) {
    container.innerHTML = '';

    function makeGroup(axisName, ids) {
      var grp = document.createElement('div');
      grp.className  = 'tm-axis-group';
      grp.dataset.axis = axisName;

      var lbl = document.createElement('span');
      lbl.className   = 'tm-axis-lbl';
      lbl.textContent = axisName === 'row' ? '行' : '列';
      grp.appendChild(lbl);

      ids.forEach(function (id) {
        var chip = document.createElement('div');
        chip.className   = 'tm-chip tm-chip-' + axisName;
        chip.draggable   = true;
        chip.dataset.id  = id;
        chip.textContent = inputName(truth, id);

        chip.ondragstart = function (e) {
          axisDrag = { id: id, fromAxis: axisName };
          chip.classList.add('tm-dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', id);
        };
        chip.ondragover = function (e) {
          if (!axisDrag || axisDrag.id === id) return;
          e.preventDefault();
          var r = chip.getBoundingClientRect();
          chip.classList.remove('tm-dropbefore', 'tm-dropafter');
          chip.classList.add(e.clientX < r.left + r.width / 2 ? 'tm-dropbefore' : 'tm-dropafter');
        };
        chip.ondragleave = function () { chip.classList.remove('tm-dropbefore', 'tm-dropafter'); };
        chip.ondrop = function (e) {
          if (!axisDrag) return;
          e.preventDefault(); e.stopPropagation();
          chip.classList.remove('tm-dropbefore', 'tm-dropafter');
          var chips = Array.prototype.slice.call(grp.querySelectorAll('.tm-chip'));
          var idx   = chips.indexOf(chip);
          if (e.clientX >= chip.getBoundingClientRect().left + chip.getBoundingClientRect().width / 2) idx++;
          moveToAxis(axisDrag.id, axisName, idx);
          axisDrag = null;
          refreshModal();
        };
        chip.ondragend = function () {
          axisDrag = null;
          document.querySelectorAll('.tm-chip').forEach(function (c) {
            c.classList.remove('tm-dragging', 'tm-dropbefore', 'tm-dropafter');
          });
          document.querySelectorAll('.tm-axis-group').forEach(function (g) {
            g.classList.remove('tm-drop-target');
          });
        };
        grp.appendChild(chip);
      });

      grp.ondragover = function (e) {
        if (!axisDrag) return; e.preventDefault(); grp.classList.add('tm-drop-target');
      };
      grp.ondragleave = function (e) {
        if (!grp.contains(e.relatedTarget)) grp.classList.remove('tm-drop-target');
      };
      grp.ondrop = function (e) {
        if (!axisDrag) return; e.preventDefault(); e.stopPropagation();
        grp.classList.remove('tm-drop-target');
        var list = axisName === 'row' ? tmLayout.rowIds : tmLayout.colIds;
        moveToAxis(axisDrag.id, axisName, list.length);
        axisDrag = null; refreshModal();
      };
      return grp;
    }

    container.appendChild(makeGroup('row', tmLayout.rowIds));
    var sep = document.createElement('div'); sep.className = 'tm-axis-sep'; container.appendChild(sep);
    container.appendChild(makeGroup('col', tmLayout.colIds));
  }

  /* ── Folded grid ────────────────────────────────────────────────── */
  function buildGrid(container, nodeId, truth) {
    container.innerHTML = '';

    var rowInputs = tmLayout.rowIds.map(function (id) { return inputById(truth, id); }).filter(Boolean);
    var colInputs = tmLayout.colIds.map(function (id) { return inputById(truth, id); }).filter(Boolean);
    var rowCount  = rowInputs.length ? (1 << rowInputs.length) : 1;
    var colCount  = colInputs.length ? (1 << colInputs.length) : 1;

    var rowCombos = [], colCombos = [];
    for (var r = 0; r < rowCount; r++) {
      var rb = rowInputs.length ? bits(r, rowInputs.length) : [];
      rowCombos.push({ bits: rb, label: rb.length ? rb.join('') : '∅' });
    }
    for (var c = 0; c < colCount; c++) {
      var cb = colInputs.length ? bits(c, colInputs.length) : [];
      colCombos.push({ bits: cb, label: cb.length ? cb.join('') : '∅' });
    }

    var table = document.createElement('table');
    table.className = 'tm-grid';

    /* Header row with corner cell */
    var htr    = document.createElement('tr');
    var corner = document.createElement('th');
    corner.className = 'tm-corner';

    function makeAxisReveal(axisName, inputs) {
      var wrap   = document.createElement('div'); wrap.className = 'tm-corner-axis';
      var btn    = document.createElement('span');
      btn.className   = 'tm-corner-btn tm-corner-btn-' + axisName;
      btn.textContent = axisName === 'row' ? '行' : '列';
      var detail = document.createElement('div');
      detail.className   = 'tm-corner-detail tm-detail-' + axisName;
      detail.textContent = inputs.length ? inputs.map(function (n) { return n.name; }).join('  ') : '(空)';
      btn.onclick = function (e) {
        e.stopPropagation();
        var open = detail.classList.toggle('tm-open');
        btn.classList.toggle('tm-active', open);
      };
      wrap.appendChild(btn); wrap.appendChild(detail);
      return wrap;
    }

    corner.appendChild(makeAxisReveal('row', rowInputs));
    var cSep = document.createElement('div'); cSep.className = 'tm-corner-sep'; corner.appendChild(cSep);
    corner.appendChild(makeAxisReveal('col', colInputs));
    htr.appendChild(corner);

    colCombos.forEach(function (combo) {
      var td = document.createElement('td');
      td.className   = 'tm-col-combo';
      td.textContent = combo.label;
      td.title = colInputs.map(function (inp, i) { return inp.name + '=' + combo.bits[i]; }).join(', ') || '∅';
      htr.appendChild(td);
    });
    table.appendChild(htr);

    /* Data rows */
    rowCombos.forEach(function (rowCombo) {
      var tr = document.createElement('tr');
      var rl = document.createElement('th');
      rl.className   = 'tm-row-combo';
      rl.textContent = rowCombo.label;
      rl.title = rowInputs.map(function (inp, i) { return inp.name + '=' + rowCombo.bits[i]; }).join(', ') || '∅';
      tr.appendChild(rl);

      colCombos.forEach(function (colCombo) {
        var assignment = {};
        rowInputs.forEach(function (inp, i) { assignment[inp.id] = rowCombo.bits[i] !== undefined ? rowCombo.bits[i] : 0; });
        colInputs.forEach(function (inp, i) { assignment[inp.id] = colCombo.bits[i] !== undefined ? colCombo.bits[i] : 0; });

        var ri  = truthRowFor(truth, assignment);
        var raw = (truth.values[nodeId] || [])[ri];
        var val = (raw === undefined || raw === null) ? '?' : String(raw);

        var td = document.createElement('td');
        td.className   = 'tm-cell ' + (val === '1' ? 'v1' : val === '0' ? 'v0' : 'vq');
        td.textContent = val;
        td.title = truth.inputNodes.slice(0, 12)
          .map(function (n) { return n.name + '=' + (assignment[n.id] !== undefined ? assignment[n.id] : '?'); })
          .join(', ');
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });

    container.appendChild(table);
  }

  /* ── Modal header drag ──────────────────────────────────────────── */
  function startModalDrag(e) {
    if (e.button !== 0 || (e.target.tagName === 'BUTTON')) return;
    if (!tmModal) return;
    var r = tmModal.getBoundingClientRect();
    tmOverlay.classList.add('floating');
    tmModal.style.left = r.left + 'px';
    tmModal.style.top  = r.top  + 'px';
    modalDrag = { sx: e.clientX, sy: e.clientY, l: r.left, t: r.top };
    e.preventDefault();
  }

  window.addEventListener('mousemove', function (e) {
    if (!modalDrag || !tmModal) return;
    var l = modalDrag.l + e.clientX - modalDrag.sx;
    var t = modalDrag.t + e.clientY - modalDrag.sy;
    var r = tmModal.getBoundingClientRect();
    tmModal.style.left   = Math.max(0, Math.min(window.innerWidth  - Math.min(80, r.width),  l)) + 'px';
    tmModal.style.top    = Math.max(0, Math.min(window.innerHeight - 46,                      t)) + 'px';
    tmModal.style.bottom = 'auto';
  });
  window.addEventListener('mouseup', function () { modalDrag = null; });

  /* ── Close + refresh ────────────────────────────────────────────── */
  function closeTruthMap() {
    if (tmOverlay && tmOverlay.parentNode) tmOverlay.parentNode.removeChild(tmOverlay);
    tmOverlay = null; tmModal = null; tmNodeId = null; modalDrag = null;
  }

  function refreshModal() {
    if (!tmModal || !tmNodeId) return;
    var truth   = getTruthTables();
    normalizeLayout(truth);
    var strip   = tmModal.querySelector('.tm-axis-strip');
    var content = tmModal.querySelector('.tm-content');
    if (strip)   buildStrip(strip, truth);
    if (content) buildGrid(content, tmNodeId, truth);
  }

  /* ── Open modal ─────────────────────────────────────────────────── */
  function openTruthMap(nodeId) {
    var truth = getTruthTables();
    normalizeLayout(truth);

    var node = exportObj().nodes.find(function (n) { return n.id === nodeId; });
    if (!node) return;
    closeTruthMap();
    tmNodeId = nodeId;

    /* Overlay */
    var overlay = document.createElement('div');
    overlay.className = 'tm-overlay';

    /* Modal */
    var modal = document.createElement('div');
    modal.className = 'tm-modal';
    overlay.appendChild(modal);

    /* Header */
    var hdr = document.createElement('div');
    hdr.className   = 'tm-header';
    hdr.onmousedown = startModalDrag;

    var titleDiv = document.createElement('div'); titleDiv.className = 'tm-title';
    var h3       = document.createElement('h3');  h3.textContent = '真值地图  ·  ' + node.name; titleDiv.appendChild(h3);
    var sub      = document.createElement('div'); sub.className = 'tm-sub'; sub.textContent = node.type; titleDiv.appendChild(sub);
    hdr.appendChild(titleDiv);

    var hbtns = document.createElement('div'); hbtns.className = 'tm-hbtns';
    function hBtn(lbl, fn) { var b = document.createElement('button'); b.textContent = lbl; b.onclick = fn; hbtns.appendChild(b); }

    hBtn('复制 01', function () { copyText(truthString(nodeId, getTruthTables()), '已复制'); });

    var minBtn = document.createElement('button'); minBtn.textContent = '最小化';
    minBtn.onclick = function () {
      var r   = modal.getBoundingClientRect();
      overlay.classList.add('floating');
      overlay.classList.toggle('minimized');
      var min = overlay.classList.contains('minimized');
      if (min) {
        modal.style.left   = Math.min(r.left, window.innerWidth - 260) + 'px';
        modal.style.top    = Math.min(r.top,  window.innerHeight - 48) + 'px';
        modal.style.bottom = 'auto';
        modal.style.width  = '240px';
        minBtn.textContent = '恢复';
      } else {
        modal.style.width  = '';
        minBtn.textContent = '最小化';
      }
    };
    hbtns.appendChild(minBtn);
    hBtn('×', closeTruthMap);
    hdr.appendChild(hbtns);
    modal.appendChild(hdr);

    /* Axis strip */
    var strip = document.createElement('div'); strip.className = 'tm-axis-strip'; modal.appendChild(strip);

    /* Grid content */
    var content = document.createElement('div'); content.className = 'tm-content'; modal.appendChild(content);

    /* Close on overlay click (not floating/minimized) */
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay &&
          !overlay.classList.contains('minimized') &&
          !overlay.classList.contains('floating'))
        closeTruthMap();
    });

    document.body.appendChild(overlay);
    tmOverlay = overlay;
    tmModal   = modal;

    buildStrip(strip, truth);
    buildGrid(content, nodeId, truth);
  }

  /* ── Public API ─────────────────────────────────────────────────── */
  window.openTruthMap = openTruthMap;
})();
