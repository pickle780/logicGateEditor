/* render.js
   Gate symbol drawing + main render() loop.
   Responsibilities:
     - Define SVG shapes for every gate type (AND/OR/NOT/etc.)
     - Override drawNodeShape (drag-ghost preview used by app.js)
     - Own the render() function that repaints the entire canvas

   Load after: app.js
   Load before: wire.js  (wire.js overrides drawPort; called at render-time)
   Communicates with wire.js via:
     - window._wireReset()  called at the start of each render()
     - drawPort()           called per port; wire.js installs its override after this file loads
*/
(function () {
  'use strict';
  if (typeof render !== 'function') return;

  /* ── Layout constants (must match portPos() in app.js) ─────────── */
  var NW    = 90;   /* node width  */
  var NH    = 54;   /* node height */
  var LBL_Y = 70;   /* gate-label baseline (below gate body) */
  var HIT_H = 78;   /* transparent hit-area height */

  /* ── SVG factory helpers ────────────────────────────────────────── */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  function ns(tag)     { return document.createElementNS(SVG_NS, tag); }
  function sa(el, obj) { Object.keys(obj).forEach(function (k) { el.setAttribute(k, obj[k]); }); return el; }

  function mkPath(g, d, cls)            { return g.appendChild(sa(ns('path'),   { d: d,   class: cls || 'gate-body' })); }
  function mkLine(g, x1,y1, x2,y2, cls){ return g.appendChild(sa(ns('line'),   { x1:x1,y1:y1,x2:x2,y2:y2, class: cls || 'gate-stub' })); }
  function mkCirc(g, cx,cy, r, cls)     { return g.appendChild(sa(ns('circle'), { cx:cx,cy:cy,r:r, class: cls || 'gate-bubble' })); }
  function mkRect(g, x,y, w,h, rx, cls){ return g.appendChild(sa(ns('rect'),   { x:x,y:y,width:w,height:h,rx:rx, class: cls || 'gate-body' })); }
  function mkText(g, str, x,y, cls, anchor) {
    var t = sa(ns('text'), { x:x,y:y, class: cls || 'gate-label', 'text-anchor': anchor || 'middle' });
    t.textContent = str; g.appendChild(t); return t;
  }

  /* ── Gate symbol shapes ─────────────────────────────────────────── */
  /*  Port positions fixed by app.js portPos() (h = 54 px):
        input-a  →  (0 , 18)      output  →  (90, 27)
        input-b  →  (0 , 36)
        single   →  (0 , 27)
      Gate bodies occupy roughly y = 5 … 49  (44 px tall).
      Aspect ratios are kept near 1:1 for a non-squished look.       */
  function drawSymbol(g, node) {
    var t = node.type;

    /* AND / NAND ─── left flat, right semicircle
       Body x = 15 … 62, arc center (40, 27) r = 22
       Ratio: 47 × 44 ≈ 1.07 : 1                                     */
    if (t === 'and' || t === 'nand') {
      mkLine(g,  0, 18, 15, 18);
      mkLine(g,  0, 36, 15, 36);
      mkPath(g, 'M15 5 L40 5 A22 22 0 0 1 40 49 L15 49 Z');
      if (t === 'nand') { mkCirc(g, 67, 27, 5); mkLine(g, 72, 27, NW, 27); }
      else                mkLine(g, 62, 27, NW, 27);
      return;
    }

    /* OR / NOR / XOR ─── concave left, pointed right tip at (64, 27)
       Ratio: 50 × 44 ≈ 1.09 : 1                                     */
    if (t === 'or' || t === 'nor' || t === 'xor') {
      mkLine(g,  0, 18, 19, 18);
      mkLine(g,  0, 36, 19, 36);
      if (t === 'xor') mkPath(g, 'M8 5 C18 17 18 37 8 49', 'gate-xor-arc');
      mkPath(g, 'M14 5 C28 5 50 10 64 27 C50 44 28 49 14 49 C22 38 22 16 14 5 Z');
      if (t === 'nor') { mkCirc(g, 69, 27, 5); mkLine(g, 74, 27, NW, 27); }
      else                mkLine(g, 64, 27, NW, 27);
      return;
    }

    /* NOT ─── triangle + inversion bubble                             */
    if (t === 'not') {
      mkLine(g, 0, 27, 15, 27);
      mkPath(g, 'M15 5 L15 49 L61 27 Z');
      mkCirc(g, 66, 27, 5);
      mkLine(g, 71, 27, NW, 27);
      return;
    }

    /* INPUT terminal ─── pill + output stub                           */
    if (t === 'input') {
      mkRect(g, 4, 7, 50, 40, 20, 'gate-terminal gate-input-box');
      mkText(g, node.name, 29, 31, 'gate-terminal-text');
      mkLine(g, 54, 27, NW, 27);
      return;
    }

    /* OUTPUT terminal ─── input stub + pill                          */
    if (t === 'output') {
      mkLine(g, 0, 27, 36, 27);
      mkRect(g, 36, 7, 50, 40, 20, 'gate-terminal gate-output-box');
      mkText(g, node.name, 61, 31, 'gate-terminal-text');
      return;
    }

    /* Fallback rectangle for unknown gate types                      */
    mkRect(g, 12, 6, 66, 42, 6, 'gate-body');
    mkText(g, node.type, NW / 2, NH / 2 + 4, 'gate-name-label');
  }

  /* ── Node body (hit-area + symbol + name label) ─────────────────── */
  function drawNodeBody(g, node) {
    /* Transparent rectangle absorbs pointer events so node-drag
       doesn't fall through to the canvas and start box-select.       */
    g.appendChild(sa(ns('rect'), { x:-10, y:-6, width:NW+20, height:HIT_H, rx:8, class:'gate-hit' }));

    var sym = sa(ns('g'), { class: 'gate-symbol' });
    drawSymbol(sym, node);
    g.appendChild(sym);

    if (node.type !== 'input' && node.type !== 'output')
      mkText(g, node.name, NW / 2, LBL_Y, 'gate-name-label');
  }

  /* ── drawNodeShape — app.js calls this for paste/replace preview ── */
  drawNodeShape = function (node, opacity, preview) {
    var g = sa(ns('g'), {
      class: 'node gate-node' + (preview ? ' preview' : ''),
      transform: 'translate(' + node.x + ',' + node.y + ')'
    });
    if (opacity) g.setAttribute('opacity', opacity);
    drawNodeBody(g, node);
    svg.appendChild(g);
    return g;
  };

  /* ── Main render ─────────────────────────────────────────────────── */
  render = function () {
    /* Tell wire.js to clear its port registry for this frame.        */
    if (typeof window._wireReset === 'function') window._wireReset();

    updateWorldTransform();
    svg.innerHTML = '';

    var truth    = getTruthTables();
    var selTruth = getSelectedTruth(truth);
    var hlSame   = document.getElementById('highlightSameTruth').checked;
    var q        = document.getElementById('truthSearch').value.trim();
    var sameIds  = new Set(), matchIds = new Set();

    circuit.nodes.forEach(function (node) {
      var txt = truthString(node.id, truth);
      if (hlSame && selTruth && txt === selTruth && (!selected || selected.id !== node.id))
        sameIds.add(node.id);
      if (q && searchMatches(txt, q))
        matchIds.add(node.id);
    });

    /* ── Wires ─────────────────────────────────────────────────────── */
    circuit.wires.forEach(function (wire) {
      var fn = findNode(wire.from.node), tn = findNode(wire.to.node);
      if (!fn || !tn) return;

      var cls = 'wire'
        + (selected && selected.type === 'wire' && selected.id === wire.id              ? ' selected'  : '')
        + (selected && selected.type === 'node' &&
           (wire.from.node === selected.id || wire.to.node === selected.id)             ? ' highlight' : '')
        + (q && !matchIds.has(wire.from.node) && !matchIds.has(wire.to.node)            ? ' dim'       : '');

      var p = sa(ns('path'), { d: drawPath(portPos(fn, wire.from.port, 'out'), portPos(tn, wire.to.port, 'in')), class: cls });

      p.onclick = function (e) {
        e.stopPropagation();
        selected = { type: 'wire', id: wire.id };
        multiSelectedIds.clear();
        connectFrom = null; ghostPoint = null;
        setStatus('已选中连线，双击或右键断开');
        render();
      };
      p.ondblclick = function (e) {
        e.stopPropagation();
        circuit.wires = circuit.wires.filter(function (x) { return x.id !== wire.id; });
        selected = null; setStatus('已断开连线'); render();
      };
      p.oncontextmenu = function (e) {
        e.preventDefault(); e.stopPropagation();
        circuit.wires = circuit.wires.filter(function (x) { return x.id !== wire.id; });
        selected = null; setStatus('已断开连线'); render();
      };
      svg.appendChild(p);
    });

    /* ── Legacy ghost wire (app.js connectFrom / ghostPoint) ─────── */
    if (connectFrom && ghostPoint)
      svg.appendChild(sa(ns('path'), {
        d: drawPath(portPos(connectFrom.node, connectFrom.port, 'out'), ghostPoint),
        class: 'ghostWire'
      }));

    /* ── Wire-drag ghost (owned by wire.js, drawn via its hook) ───── */
    if (typeof window._drawWireGhost === 'function') window._drawWireGhost();

    /* ── Mask extract map ──────────────────────────────────────────── */
    var extMap = {};
    if (maskHighlight && maskHighlight.mode === 'extracted') {
      var stats = lastMaskStats || buildMaskStats();
      stats.allRows.forEach(function (grp) {
        grp.items.forEach(function (item) { extMap[item.nodeId] = grp.extracted; });
      });
    }

    /* ── Nodes ─────────────────────────────────────────────────────── */
    circuit.nodes.forEach(function (node) {
      var txt  = truthString(node.id, truth);
      var sel  = !!(selected && selected.type === 'node' && selected.id === node.id);
      var multi = multiSelectedIds.has(node.id);
      var same  = sameIds.has(node.id);
      var match = matchIds.has(node.id);
      var mex   = !!(maskHighlight && maskHighlight.mode === 'extracted' && extMap[node.id] === maskHighlight.value);
      var mor   = !!(maskHighlight && maskHighlight.mode === 'original'  && txt  === maskHighlight.value);
      var mfoc  = !!(maskHighlight && maskHighlight.focusNodeId === node.id);

      var g = sa(ns('g'), {
        class: 'node gate-node'
          + (sel   ? ' selected'         : '')
          + (multi ? ' multiSelected'    : '')
          + (same  ? ' sameTruth'        : '')
          + (match ? ' searchMatch'      : '')
          + (mex   ? ' maskExtractMatch' : '')
          + (mor   ? ' maskOriginalMatch': '')
          + (mfoc  ? ' maskFocus'        : ''),
        transform: 'translate(' + node.x + ',' + node.y + ')'
      });

      g.onmousedown = function (e) {
        if (e.target.classList.contains('port')) return;
        e.stopPropagation();
        var pos = screenToWorld(e.clientX, e.clientY);
        if (multiSelectedIds.has(node.id)) {
          draggingGroup = {
            startX: pos.x, startY: pos.y,
            nodes: circuit.nodes
              .filter(function (n) { return multiSelectedIds.has(n.id); })
              .map(function (n)    { return { id: n.id, x: n.x, y: n.y }; })
          };
          selected = null;
        } else {
          draggingNode = { node: node, dx: pos.x - node.x, dy: pos.y - node.y };
          multiSelectedIds.clear();
          selected = { type: 'node', id: node.id };
        }
        connectFrom = null; ghostPoint = null; render();
      };

      g.ondblclick = function (e) {
        if (e.target.classList.contains('port')) return;
        e.stopPropagation();
        selected = { type: 'node', id: node.id };
        multiSelectedIds.clear();
        deleteSelected();
        setStatus('已删除节点');
      };

      drawNodeBody(g, node);

      /* Draw ports — drawPort is overridden by wire.js at load time.
         At render-time it will be wire.js's version.                 */
      portDefs(node).in.forEach(function (port) {
        var pp = portPos(Object.assign({}, node, { x: 0, y: 0 }), port, 'in');
        drawPort(g, pp.x, pp.y, port, 'in', node);
      });
      portDefs(node).out.forEach(function (port) {
        var pp = portPos(Object.assign({}, node, { x: 0, y: 0 }), port, 'out');
        drawPort(g, pp.x, pp.y, port, 'out', node);
      });

      svg.appendChild(g);

      /* ── Probe badge ───────────────────────────────────────────── */
      if (shouldShowProbe(node, same, match || mex || mor)) {
        var full = truthString(node.id, truth);
        var pt   = shortProbeText(full);
        var px   = node.x + 96, py = node.y - 8, pw = Math.max(32, pt.length * 7 + 10);

        var bg = sa(ns('rect'), { class: 'probeBg' + (match ? ' searchProbeBg' : ''), x:px, y:py, width:pw, height:19 });
        bg.onclick = function (e) { e.stopPropagation(); copyText(full, '已复制探针 01'); };
        svg.appendChild(bg);

        var prb = sa(ns('text'), { class: 'probe' + (match ? ' searchProbe' : ''), x: px+5, y: py+14 });
        prb.textContent = pt;
        prb.onclick = function (e) { e.stopPropagation(); copyText(full, '已复制探针 01'); };
        svg.appendChild(prb);
      }
    });

    drawSelectionBox();
    drawPastePreview();
    drawReplacePreview();

    svg.onclick = function (e) {
      if (replacePreview)         { e.stopPropagation(); confirmReplacePreview(); return; }
      if (pastePreview)           { e.stopPropagation(); confirmPasteAtMouse();   return; }
      if (selectionBox)           { e.stopPropagation(); return; }
      if (multiSelectedIds.size)  { e.stopPropagation(); return; }
      if (!panning) clearSelection();
    };

    updatePanels(truth, sameIds, matchIds);
  };

  render();
})();
