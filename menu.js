/* menu.js
   Right-click context menu on gates and probe badges.
   Responsibilities:
     - Listen for contextmenu events on the SVG canvas
     - Hit-test probes and nodes under the cursor
     - Build and show a small floating menu
     - Provide "查看真值地图" (calls window.openTruthMap from truth-map.js)
       and "Copy value" actions
     - Suppress accidental probe clicks (redirect to right-click)

   Load after: wire.js
   Load before: truth-map.js  (window.openTruthMap resolved at call-time, not load-time)
*/
(function () {
  'use strict';

  var NW = 90, NH = 54;   /* must match app.js portPos */

  /* ── Menu element ───────────────────────────────────────────────── */
  var menuEl = null;

  function removeMenu() {
    if (menuEl && menuEl.parentNode) menuEl.parentNode.removeChild(menuEl);
    menuEl = null;
  }

  function showMenu(node, clientX, clientY) {
    removeMenu();

    var menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.style.left = clientX + 'px';
    menu.style.top  = clientY + 'px';

    /* Title row */
    var title = document.createElement('div');
    title.className   = 'ctx-title';
    title.textContent = node.name + '  (' + node.type + ')';
    menu.appendChild(title);

    /* Helper to add a menu item */
    function item(label, fn) {
      var b = document.createElement('button');
      b.textContent = label;
      b.onclick = function () { removeMenu(); fn(); };
      menu.appendChild(b);
    }

    item('查看真值地图', function () {
      /* truth-map.js sets window.openTruthMap at load-time.
         The call here is lazy, so load order doesn't matter.        */
      if (typeof window.openTruthMap === 'function')
        window.openTruthMap(node.id);
      else
        alert('truth-map.js 未加载');
    });

    item('Copy value', function () {
      copyText(truthString(node.id, getTruthTables()), '已复制探针 01');
    });

    document.body.appendChild(menu);
    menuEl = menu;
  }

  /* ── Hit-testing ────────────────────────────────────────────────── */
  function probeHitTest(pt) {
    var truth = getTruthTables();
    var q     = (document.getElementById('truthSearch') || {}).value || '';
    var selT  = getSelectedTruth(truth);
    var hlS   = document.getElementById('highlightSameTruth') &&
                document.getElementById('highlightSameTruth').checked;
    var nodes = exportObj().nodes;

    for (var i = nodes.length - 1; i >= 0; i--) {
      var n   = nodes[i];
      var txt = truthString(n.id, truth);
      var same  = hlS && selT && txt === selT && (!selected || selected.id !== n.id);
      var match = q && searchMatches(txt, q);
      if (!shouldShowProbe(n, same, match)) continue;

      var pp = shortProbeText(txt);
      var px = n.x + 96, py = n.y - 8, pw = Math.max(32, pp.length * 7 + 10);
      if (pt.x >= px && pt.x <= px + pw && pt.y >= py && pt.y <= py + 19) return n;
    }
    return null;
  }

  function nodeHitTest(pt) {
    return exportObj().nodes.slice().reverse().find(function (n) {
      return pt.x >= n.x && pt.x <= n.x + NW && pt.y >= n.y && pt.y <= n.y + NH;
    }) || null;
  }

  /* ── SVG event listeners ────────────────────────────────────────── */

  /* Suppress normal left-click on probe badges (they have their own
     onclick for copy; showing a "use right-click" hint is friendlier). */
  svg.addEventListener('click', function (e) {
    removeMenu();
    if (e.target && (e.target.classList.contains('probe') || e.target.classList.contains('probeBg'))) {
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      setStatus('探针请右键：查看真值地图 / Copy value');
    }
  }, true);

  /* Right-click → show context menu */
  svg.addEventListener('contextmenu', function (e) {
    var pt   = screenToWorld(e.clientX, e.clientY);
    var node = probeHitTest(pt) || nodeHitTest(pt);
    if (!node) return;

    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    showMenu(node, e.clientX, e.clientY);
  }, true);

  /* Close menu when clicking anywhere outside it */
  document.addEventListener('mousedown', function (e) {
    if (menuEl && !menuEl.contains(e.target)) removeMenu();
  });

  /* Expose lastContextNodeId so freeze.js can append its own items */
  var lastCtxNodeId = null;
  document.addEventListener('contextmenu', function (e) {
    var pt   = screenToWorld(e.clientX, e.clientY);
    var node = nodeHitTest(pt);
    lastCtxNodeId = node ? node.id : null;
  }, true);
  window._getLastCtxNodeId = function () { return lastCtxNodeId; };
})();
