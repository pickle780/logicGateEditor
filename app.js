const svg = document.getElementById('svg');
const wrap = document.getElementById('canvasWrap');
const world = document.getElementById('world');

let circuit = { folder: 'untitled', nodes: [], wires: [] };
let templates = {};
let idSeq = 1;

let selected = null;
let multiSelectedIds = new Set();

let connectFrom = null;
let ghostPoint = null;

let draggingNode = null;
let draggingGroup = null;

let panning = false;
let panStart = null;
let spaceDown = false;

let selectionBox = null;
let clipboard = null;
let pastePreview = null;
let replacePreview = null;

let maskPopupEl = null;
let maskMinDotEl = null;
let lastMaskStats = null;
let expandedMaskGroups = {};
let maskHighlight = null;
let maskPopupState = {
  x: null,
  y: null,
  minimized: false,
  collapsed: false,
  dragging: false,
  dragOffsetX: 0,
  dragOffsetY: 0
};

let mouseWorld = { x: 0, y: 0 };

let view = { x: 40, y: 40, scale: 1 };
let canvas = { width: 2200, height: 1400 };

const colors = {
  input: '#166534',
  output: '#7c2d12',
  nand: '#1d4ed8',
  and: '#0f766e',
  nor: '#9333ea',
  or: '#2563eb',
  xor: '#be185d',
  not: '#ca8a04'
};

function uid(prefix) {
  var id = prefix + idSeq.toString(36);
  idSeq += 1;
  return id;
}

function setStatus(text) {
  document.getElementById('status').textContent = text;
}

function closeMaskPopup() {
  if (maskPopupEl && maskPopupEl.parentNode) {
    maskPopupEl.parentNode.removeChild(maskPopupEl);
  }

  if (maskMinDotEl && maskMinDotEl.parentNode) {
    maskMinDotEl.parentNode.removeChild(maskMinDotEl);
  }

  maskPopupEl = null;
  maskMinDotEl = null;
  lastMaskStats = null;
  expandedMaskGroups = {};
  maskPopupState.minimized = false;
  maskPopupState.collapsed = false;
}

function closeMaskPopupOnStructureChange() {
  closeMaskPopup();
  clearMaskHighlight(false);
}

function clearMaskHighlight(shouldRender) {
  maskHighlight = null;

  if (shouldRender !== false) {
    render();
  }
}

function gateLabel(type) {
  return type.toUpperCase();
}

function updateWorldTransform() {
  world.style.width = canvas.width + 'px';
  world.style.height = canvas.height + 'px';
  world.style.transform = 'translate(' + view.x + 'px,' + view.y + 'px) scale(' + view.scale + ')';
  document.getElementById('zoomText').textContent = Math.round(view.scale * 100) + '%';
}

function updateCanvasSize() {
  canvas.width = Math.max(800, Number(document.getElementById('canvasWidth').value || 2200));
  canvas.height = Math.max(600, Number(document.getElementById('canvasHeight').value || 1400));
  updateWorldTransform();
  render();
}

function expandCanvas() {
  canvas.width = Math.round(canvas.width * 1.5);
  canvas.height = Math.round(canvas.height * 1.5);
  document.getElementById('canvasWidth').value = canvas.width;
  document.getElementById('canvasHeight').value = canvas.height;
  updateWorldTransform();
  render();
}

function screenToWorld(clientX, clientY) {
  var rect = wrap.getBoundingClientRect();

  return {
    x: (clientX - rect.left - view.x) / view.scale,
    y: (clientY - rect.top - view.y) / view.scale
  };
}

function zoomAt(clientX, clientY, factor) {
  var before = screenToWorld(clientX, clientY);

  view.scale = Math.max(0.15, Math.min(4, view.scale * factor));

  var rect = wrap.getBoundingClientRect();

  view.x = clientX - rect.left - before.x * view.scale;
  view.y = clientY - rect.top - before.y * view.scale;

  updateWorldTransform();
}

function zoomBy(factor) {
  var rect = wrap.getBoundingClientRect();
  zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
}

function resetView() {
  view = { x: 40, y: 40, scale: 1 };
  updateWorldTransform();
}

function fitView() {
  var rect = wrap.getBoundingClientRect();

  view.scale = Math.max(
    0.15,
    Math.min(2, Math.min(rect.width / canvas.width, rect.height / canvas.height) * 0.95)
  );

  view.x = (rect.width - canvas.width * view.scale) / 2;
  view.y = (rect.height - canvas.height * view.scale) / 2;

  updateWorldTransform();
}

function centerViewOnPoint(worldX, worldY) {
  var rect = wrap.getBoundingClientRect();

  view.x = rect.width / 2 - worldX * view.scale;
  view.y = rect.height / 2 - worldY * view.scale;

  updateWorldTransform();
}

function getNodesBounds(nodes) {
  var minX = Infinity;
  var minY = Infinity;
  var maxX = -Infinity;
  var maxY = -Infinity;

  nodes.forEach(function(node) {
    var x1 = node.x;
    var y1 = node.y;
    var x2 = node.x + 90;
    var y2 = node.y + 54;

    if (x1 < minX) minX = x1;
    if (y1 < minY) minY = y1;
    if (x2 > maxX) maxX = x2;
    if (y2 > maxY) maxY = y2;
  });

    var cx = (minX + maxX) / 2;
    var cy = (minY + maxY) / 2;

    return {
      x: cx,
      y: cy,
      cx: cx,
      cy: cy,
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY
    };
}

wrap.addEventListener('wheel', function(event) {
  event.preventDefault();

  var factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  zoomAt(event.clientX, event.clientY, factor);
}, { passive: false });

wrap.addEventListener('mousedown', function(event) {
  if (event.button === 1 || spaceDown) {
    event.preventDefault();

    panning = true;
    panStart = {
      x: event.clientX,
      y: event.clientY,
      vx: view.x,
      vy: view.y
    };

    return;
  }

  if (event.button === 0 && replacePreview) {
    confirmReplacePreview();
    return;
  }

  if (event.button === 0 && pastePreview) {
    confirmPasteAtMouse();
    return;
  }

  if (event.button === 0 && event.target === svg) {
    var pos = screenToWorld(event.clientX, event.clientY);

    selectionBox = {
      startX: pos.x,
      startY: pos.y,
      x: pos.x,
      y: pos.y,
      active: true
    };

    selected = null;
    connectFrom = null;
    ghostPoint = null;
    multiSelectedIds.clear();

    render();
  }
});

wrap.addEventListener('dragover', function(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

wrap.addEventListener('drop', function(event) {
  event.preventDefault();

  var type = event.dataTransfer.getData('text/plain') || selectedComponentType();
  var pos = screenToWorld(event.clientX, event.clientY);

  addNode(type, pos.x - 45, pos.y - 27);
});

window.addEventListener('keydown', function(event) {
  var tag = event.target.tagName && event.target.tagName.toLowerCase();
  var typing = tag === 'input' || tag === 'textarea' || tag === 'select';

  if ((event.ctrlKey || event.metaKey) && !typing) {
    var shortcut = event.key.toLowerCase();

    if (shortcut === 'c') {
      copySelectedObjects();
      event.preventDefault();
      return;
    }

    if (shortcut === 'v') {
      startPastePreview();
      event.preventDefault();
      return;
    }
  }

  if (event.code === 'Space' && !typing) {
    spaceDown = true;
    wrap.style.cursor = 'grab';
    event.preventDefault();
    return;
  }

  if (event.key === 'Escape') {
    if (replacePreview) {
      cancelReplacePreview();
      return;
    }

    if (pastePreview) {
      pastePreview = null;
      setStatus('已取消粘贴/导入');
      render();
      return;
    }

    connectFrom = null;
    ghostPoint = null;
    selectionBox = null;

    setStatus('已取消操作');
    render();
    return;
  }

  if ((event.key === 'Delete' || event.key === 'Backspace') && !typing) {
    deleteSelected();
    event.preventDefault();
    return;
  }

  if (typing) return;

  var step = event.shiftKey ? 80 : 30;
  var key = event.key.toLowerCase();

  if (key === 'w') {
    view.y += step;
    updateWorldTransform();
    event.preventDefault();
  } else if (key === 's') {
    view.y -= step;
    updateWorldTransform();
    event.preventDefault();
  } else if (key === 'a') {
    view.x += step;
    updateWorldTransform();
    event.preventDefault();
  } else if (key === 'd') {
    view.x -= step;
    updateWorldTransform();
    event.preventDefault();
  }
});

window.addEventListener('keyup', function(event) {
  if (event.code === 'Space') {
    spaceDown = false;
    wrap.style.cursor = 'default';
  }
});

window.addEventListener('mousemove', function(event) {
  if (maskPopupState.dragging && maskPopupEl) {
    maskPopupState.x = event.clientX - maskPopupState.dragOffsetX;
    maskPopupState.y = event.clientY - maskPopupState.dragOffsetY;

    maskPopupEl.style.left = maskPopupState.x + 'px';
    maskPopupEl.style.top = maskPopupState.y + 'px';
    maskPopupEl.style.right = 'auto';
    maskPopupEl.style.bottom = 'auto';
    return;
  }

  mouseWorld = screenToWorld(event.clientX, event.clientY);

  if (replacePreview) {
    replacePreview.x = mouseWorld.x;
    replacePreview.y = mouseWorld.y;
    render();
    return;
  }

  if (pastePreview) {
    pastePreview.x = mouseWorld.x;
    pastePreview.y = mouseWorld.y;
    render();
    return;
  }

  if (selectionBox) {
    selectionBox.x = mouseWorld.x;
    selectionBox.y = mouseWorld.y;

    var rect = getSelectionRect();
    multiSelectedIds.clear();

    circuit.nodes.forEach(function(node) {
      if (nodeIntersectsRect(node, rect)) {
        multiSelectedIds.add(node.id);
      }
    });

    render();
    return;
  }

  if (connectFrom) {
    ghostPoint = mouseWorld;
    render();
  }

  if (draggingGroup) {
    var dx = mouseWorld.x - draggingGroup.startX;
    var dy = mouseWorld.y - draggingGroup.startY;

    draggingGroup.nodes.forEach(function(snapshot) {
      var node = findNode(snapshot.id);

      if (node) {
        node.x = snapshot.x + dx;
        node.y = snapshot.y + dy;
      }
    });

    render();
    return;
  }

  if (draggingNode) {
    draggingNode.node.x = mouseWorld.x - draggingNode.dx;
    draggingNode.node.y = mouseWorld.y - draggingNode.dy;

    render();
    return;
  }

  if (panning && panStart) {
    view.x = panStart.vx + event.clientX - panStart.x;
    view.y = panStart.vy + event.clientY - panStart.y;

    updateWorldTransform();
  }
});

window.addEventListener('mouseup', function() {
  maskPopupState.dragging = false;

  draggingNode = null;
  draggingGroup = null;
  panning = false;
  panStart = null;

  if (selectionBox) {
    var count = multiSelectedIds.size;
    selectionBox = null;
    selected = null;

    if (count) {
      setStatus('已框选 ' + count + ' 个节点，可拖动任意选中节点整体移动，Ctrl+C 复制');
    } else {
      setStatus('未框选到节点');
    }

    render();
  }
});

function portDefs(node) {
  if (node.type === 'input') {
    return { in: [], out: ['out'] };
  }

  if (node.type === 'output') {
    return { in: ['in'], out: [] };
  }

  if (node.type === 'not') {
    return { in: ['in'], out: ['out'] };
  }

  return { in: ['a', 'b'], out: ['out'] };
}

function portPos(node, port, kind) {
  var w = 90;
  var h = 54;

  if (kind === 'out') {
    return {
      x: node.x + w,
      y: node.y + h / 2
    };
  }

  var inputs = portDefs(node).in;
  var index = inputs.indexOf(port);

  return {
    x: node.x,
    y: node.y + (inputs.length === 1 ? h / 2 : (index === 0 ? 18 : 36))
  };
}

function addNode(type, x, y, name) {
  closeMaskPopupOnStructureChange();

  var center = screenToWorld(
    wrap.getBoundingClientRect().left + wrap.clientWidth / 2,
                             wrap.getBoundingClientRect().top + wrap.clientHeight / 2
  );

  var node = {
    id: uid('n'),
    type: type,
    x: x == null ? center.x + Math.random() * 80 : x,
    y: y == null ? center.y + Math.random() * 80 : y,
    name: name || gateLabel(type) + circuit.nodes.filter(function(item) {
      return item.type === type;
    }).length
  };

  circuit.nodes.push(node);
  render();
  return node;
}

function findNode(id) {
  return circuit.nodes.find(function(node) {
    return node.id === id;
  });
}

function addWire(fromNode, fromPort, toNode, toPort) {
  if (!fromNode || !toNode) return;
  if (fromNode.id === toNode.id) return;

  circuit.wires = circuit.wires.filter(function(wire) {
    return !(wire.to.node === toNode.id && wire.to.port === toPort);
  });

  circuit.wires.push({
    id: uid('w'),
                     from: {
                       node: fromNode.id,
                       port: fromPort
                     },
                     to: {
                       node: toNode.id,
                       port: toPort
                     }
  });

  connectFrom = null;
  ghostPoint = null;

  render();
}

function deleteSelected() {
  if (multiSelectedIds.size) {
    closeMaskPopupOnStructureChange();

    var ids = new Set(multiSelectedIds);

    circuit.wires = circuit.wires.filter(function(wire) {
      return !ids.has(wire.from.node) && !ids.has(wire.to.node);
    });

    circuit.nodes = circuit.nodes.filter(function(node) {
      return !ids.has(node.id);
    });

    multiSelectedIds.clear();
    selected = null;
    render();
    return;
  }

  if (!selected) return;

  if (selected.type === 'node') {
    closeMaskPopupOnStructureChange();

    circuit.wires = circuit.wires.filter(function(wire) {
      return wire.from.node !== selected.id && wire.to.node !== selected.id;
    });

    circuit.nodes = circuit.nodes.filter(function(node) {
      return node.id !== selected.id;
    });
  } else if (selected.type === 'wire') {
    circuit.wires = circuit.wires.filter(function(wire) {
      return wire.id !== selected.id;
    });
  }

  selected = null;
  render();
}

function disconnectSelectedWire() {
  if (!selected || selected.type !== 'wire') {
    alert('请先选中一条连线');
    return;
  }

  circuit.wires = circuit.wires.filter(function(wire) {
    return wire.id !== selected.id;
  });

  selected = null;
  render();
}

function clearSelection() {
  selected = null;
  multiSelectedIds.clear();
  connectFrom = null;
  ghostPoint = null;
  selectionBox = null;
  render();
}

function newCircuit() {
  if (confirm('清空当前电路？')) {
    closeMaskPopupOnStructureChange();
    newCircuitNoConfirm();
    render();
  }
}

function newCircuitNoConfirm() {
  closeMaskPopupOnStructureChange();

  circuit = { folder: 'untitled', nodes: [], wires: [] };
  idSeq = 1;
  selected = null;
  multiSelectedIds.clear();
  connectFrom = null;
  ghostPoint = null;
  pastePreview = null;
  replacePreview = null;
}

function drawPath(a, b) {
  var dx = Math.max(60, Math.abs(b.x - a.x) / 2);
  return 'M' + a.x + ',' + a.y +
  ' C' + (a.x + dx) + ',' + a.y +
  ' ' + (b.x - dx) + ',' + b.y +
  ' ' + b.x + ',' + b.y;
}

function evalGate(type, a, b) {
  if (type === 'not') {
    if (a === '?') return '?';
    return Number(a) ? 0 : 1;
  }

  if (a === '?' || b === '?') return '?';

  var x = Number(a);
  var y = Number(b);

  if (type === 'nand') return x && y ? 0 : 1;
  if (type === 'and') return x && y ? 1 : 0;
  if (type === 'nor') return x || y ? 0 : 1;
  if (type === 'or') return x || y ? 1 : 0;
  if (type === 'xor') return x !== y ? 1 : 0;

  return '?';
}

function getTruthTables() {
  var inputs = circuit.nodes
  .filter(function(node) {
    return node.type === 'input';
  })
  .sort(function(a, b) {
    return a.y - b.y || a.x - b.x;
  });

  var inputCount = inputs.length;
  var safe = Math.min(inputCount, 12);
  var rows = 1 << safe;
  var values = {};

  circuit.nodes.forEach(function(node) {
    values[node.id] = Array(rows).fill('?');
  });

  for (var row = 0; row < rows; row += 1) {
    inputs.forEach(function(node, index) {
      values[node.id][row] = index >= safe ? '?' : (row >> (safe - 1 - index)) & 1;
    });
  }

  function getIn(node, port, row) {
    var wire = circuit.wires.find(function(item) {
      return item.to.node === node.id && item.to.port === port;
    });

    if (!wire) return '?';
    if (!values[wire.from.node]) return '?';

    return values[wire.from.node][row];
  }

  for (var iteration = 0; iteration < circuit.nodes.length + 5; iteration += 1) {
    circuit.nodes.forEach(function(node) {
      if (node.type === 'output') {
        for (var row = 0; row < rows; row += 1) {
          values[node.id][row] = getIn(node, 'in', row);
        }
      } else if (node.type === 'not') {
        for (var row2 = 0; row2 < rows; row2 += 1) {
          values[node.id][row2] = evalGate('not', getIn(node, 'in', row2));
        }
      } else if (['nand', 'and', 'nor', 'or', 'xor'].indexOf(node.type) >= 0) {
        for (var row3 = 0; row3 < rows; row3 += 1) {
          values[node.id][row3] = evalGate(
            node.type,
            getIn(node, 'a', row3),
                                           getIn(node, 'b', row3)
          );
        }
      }
    });
  }

  return {
    inputNodes: inputs,
    values: values,
    rows: rows,
    inputCount: inputCount
  };
}

function truthString(id, truth) {
  return (truth.values[id] || []).join('');
}

function shortProbeText(text) {
  return text.length > 96 ? text.slice(0, 96) + '…' : text;
}

function searchMatches(text, query) {
  query = query.trim();

  if (!query) return false;

  for (var i = 0; i < query.length; i += 1) {
    if (i >= text.length) return false;
    if (query[i] !== '?' && query[i] !== text[i]) return false;
  }

  return true;
}

function getSelectedTruth(truth) {
  return selected && selected.type === 'node' ? truthString(selected.id, truth) : null;
}

function shouldShowProbe(node, same, match) {
  return document.getElementById('showAllProbes').checked ||
  (
    document.getElementById('showSelectedProbe').checked &&
    selected &&
    selected.type === 'node' &&
    selected.id === node.id
  ) ||
  same ||
  match;
}

function normalizeExtractMask(mask, length) {
  mask = (mask || '').replace(/\s+/g, '');

  if (!mask) return '';

  var result = '';

  for (var i = 0; i < Math.min(mask.length, length); i += 1) {
    result += mask[i] === '1' ? '1' : '0';
  }

  while (result.length < length) {
    result += '0';
  }

  return result;
}

function extractByMask(text, mask) {
  if (!mask) return text;

  var result = '';

  for (var i = 0; i < text.length && i < mask.length; i += 1) {
    if (mask[i] === '1') {
      result += text[i];
    }
  }

  return result;
}

function maskCountRange() {
  var minInput = document.getElementById('maskMinCount');
  var maxInput = document.getElementById('maskMaxCount');

  var min = minInput ? Number(minInput.value || 1) : 1;
  var max = maxInput && maxInput.value !== '' ? Number(maxInput.value) : Infinity;

  if (!min || min < 1) min = 1;
  if (max < min) max = Infinity;

  return { min: min, max: max };
}

function buildMaskStats() {
  var truth = getTruthTables();
  var rawMaskInput = document.getElementById('truthMask') ? document.getElementById('truthMask').value : '';
  var mask = normalizeExtractMask(rawMaskInput, truth.rows);
  var range = maskCountRange();

  var groups = {};
  var allRows = [];
  var rows = [];

  circuit.nodes.forEach(function(node) {
    var original = truthString(node.id, truth);
    var extracted = extractByMask(original, mask);

    if (!groups[extracted]) {
      groups[extracted] = {
        extracted: extracted,
        count: 0,
        originalSet: {},
        items: []
      };
    }

    groups[extracted].count += 1;
    groups[extracted].originalSet[original] = true;
    groups[extracted].items.push({
      nodeId: node.id,
      name: node.name,
      type: node.type,
      original: original,
      extracted: extracted
    });
  });

  Object.keys(groups).sort().forEach(function(key) {
    groups[key].originalCount = Object.keys(groups[key].originalSet).length;
    allRows.push(groups[key]);

    if (groups[key].count >= range.min && groups[key].count <= range.max) {
      rows.push(groups[key]);
    }
  });

  return {
    rawMask: rawMaskInput,
    mask: mask,
    truthRows: truth.rows,
    inputCount: truth.inputCount,
    rows: rows,
    allRows: allRows,
    range: range
  };
}

function openMaskPopup() {
  lastMaskStats = buildMaskStats();
  maskPopupState.minimized = false;
  renderMaskPopup();
}

function renderMaskPopup() {
  if (!lastMaskStats) return;

  if (maskPopupEl && maskPopupEl.parentNode) {
    maskPopupEl.parentNode.removeChild(maskPopupEl);
  }

  if (maskMinDotEl && maskMinDotEl.parentNode) {
    maskMinDotEl.parentNode.removeChild(maskMinDotEl);
    maskMinDotEl = null;
  }

  maskPopupEl = document.createElement('div');
  maskPopupEl.style.position = 'fixed';
  maskPopupEl.style.width = maskPopupState.collapsed ? '520px' : '760px';
  maskPopupEl.style.maxWidth = 'calc(100vw - 48px)';
  maskPopupEl.style.maxHeight = '76vh';
  maskPopupEl.style.background = '#020617';
  maskPopupEl.style.border = '1px solid #38bdf8';
  maskPopupEl.style.borderRadius = '12px';
  maskPopupEl.style.boxShadow = '0 18px 60px rgba(0,0,0,0.45)';
  maskPopupEl.style.zIndex = '9999';
  maskPopupEl.style.color = '#e5e7eb';
  maskPopupEl.style.display = 'flex';
  maskPopupEl.style.flexDirection = 'column';
  maskPopupEl.style.overflow = 'hidden';

  if (maskPopupState.x == null || maskPopupState.y == null) {
    maskPopupState.x = 24;
    maskPopupState.y = 24;
  }

  maskPopupEl.style.left = maskPopupState.x + 'px';
  maskPopupEl.style.top = maskPopupState.y + 'px';
  maskPopupEl.style.right = 'auto';
  maskPopupEl.style.bottom = 'auto';

  var header = document.createElement('div');
  header.style.padding = '12px';
  header.style.borderBottom = maskPopupState.collapsed ? '0' : '1px solid #334155';
  header.style.display = 'grid';
  header.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
  header.style.gap = '12px';
  header.style.alignItems = 'start';
  header.style.cursor = 'move';

  header.onmousedown = function(event) {
    if (
      event.target.tagName === 'BUTTON' ||
      event.target.tagName === 'SELECT' ||
      event.target.tagName === 'INPUT'
    ) {
      return;
    }

    var rect = maskPopupEl.getBoundingClientRect();
    maskPopupState.dragging = true;
    maskPopupState.dragOffsetX = event.clientX - rect.left;
    maskPopupState.dragOffsetY = event.clientY - rect.top;
    maskPopupState.x = rect.left;
    maskPopupState.y = rect.top;
    event.preventDefault();
  };

  var title = document.createElement('div');
  title.style.minWidth = '0';
  title.style.overflow = 'hidden';

  var maskText = lastMaskStats.mask || '空，未提取，使用完整探针';

  title.innerHTML =
  '<b>Mask 提取统计</b><br>' +
  '<div style="font-size:12px;color:#94a3b8;line-height:1.5;min-width:0;">' +
  '<div>输入数：' + lastMaskStats.inputCount +
  '，探针长度：' + lastMaskStats.truthRows +
  '，数量范围：' + lastMaskStats.range.min + ' 到 ' +
  (lastMaskStats.range.max === Infinity ? '不限' : lastMaskStats.range.max) +
  '</div>' +
  '<div style="max-height:42px;overflow:auto;word-break:break-all;font-family:ui-monospace,Consolas,monospace;">Mask：' +
  escapeHtml(maskText) +
  '</div>' +
  '</div>';

  var controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.alignItems = 'center';
  controls.style.justifyContent = 'flex-end';
  controls.style.gap = '6px';
  controls.style.flexWrap = 'wrap';
  controls.style.maxWidth = '360px';

  var modeLabel = document.createElement('span');
  modeLabel.textContent = '点击原始探针：';
  modeLabel.style.fontSize = '12px';
  modeLabel.style.color = '#94a3b8';

  var modeSelect = document.createElement('select');
  modeSelect.id = 'maskProbeClickMode';
  modeSelect.style.width = '170px';
  modeSelect.style.margin = '0';
  modeSelect.innerHTML =
  '<option value="extracted">高亮同提取结果</option>' +
  '<option value="original">高亮同原始探针</option>';

  var exportBtn = document.createElement('button');
  exportBtn.textContent = '导出 CSV';
  exportBtn.onclick = exportMaskCsv;

  var refreshBtn = document.createElement('button');
  refreshBtn.textContent = '刷新';
  refreshBtn.onclick = function() {
    lastMaskStats = buildMaskStats();
    renderMaskPopup();
  };

  var collapseBtn = document.createElement('button');
  collapseBtn.textContent = maskPopupState.collapsed ? '展开' : '折叠';
  collapseBtn.onclick = toggleMaskPopupCollapsed;

  var minimizeBtn = document.createElement('button');
  minimizeBtn.textContent = '最小化';
  minimizeBtn.onclick = minimizeMaskPopup;

  var clearBtn = document.createElement('button');
  clearBtn.textContent = '清空高亮';
  clearBtn.onclick = function() {
    clearMaskHighlight(true);
  };

  var closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭';
  closeBtn.onclick = closeMaskPopup;

  if (!maskPopupState.collapsed) {
    controls.appendChild(modeLabel);
    controls.appendChild(modeSelect);
    controls.appendChild(exportBtn);
    controls.appendChild(refreshBtn);
  }

  controls.appendChild(collapseBtn);
  controls.appendChild(minimizeBtn);
  controls.appendChild(clearBtn);
  controls.appendChild(closeBtn);

  header.appendChild(title);
  header.appendChild(controls);

  var body = document.createElement('div');
  body.style.overflow = 'auto';
  body.style.padding = '12px';

  var table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.fontSize = '12px';
  table.style.tableLayout = 'fixed';

  var thead = document.createElement('thead');
  thead.innerHTML =
  '<tr>' +
  '<th style="width:38%;text-align:left;border-bottom:1px solid #334155;padding:6px">提取结果</th>' +
  '<th style="width:12%;text-align:right;border-bottom:1px solid #334155;padding:6px">数量</th>' +
  '<th style="width:18%;text-align:right;border-bottom:1px solid #334155;padding:6px">原始探针种类</th>' +
  '<th style="width:32%;text-align:left;border-bottom:1px solid #334155;padding:6px">操作</th>' +
  '</tr>';

  var tbody = document.createElement('tbody');

  if (!lastMaskStats.rows.length) {
    var emptyTr = document.createElement('tr');
    emptyTr.innerHTML = '<td colspan="4" style="padding:12px;color:#94a3b8">没有符合数量范围的结果。</td>';
    tbody.appendChild(emptyTr);
  }

  lastMaskStats.rows.forEach(function(group) {
    var tr = document.createElement('tr');

    var isOpen = !!expandedMaskGroups[group.extracted];

    tr.innerHTML =
    '<td style="border-bottom:1px solid #1e293b;padding:6px;font-family:ui-monospace,Consolas,monospace;cursor:pointer;color:#67e8f9;word-break:break-all;max-width:0;overflow:hidden">' +
    escapeHtml(group.extracted || '(空)') +
    '</td>' +
    '<td style="border-bottom:1px solid #1e293b;padding:6px;text-align:right">' +
    group.count +
    '</td>' +
    '<td style="border-bottom:1px solid #1e293b;padding:6px;text-align:right">' +
    group.originalCount +
    '</td>' +
    '<td style="border-bottom:1px solid #1e293b;padding:6px;white-space:normal">' +
    '<button data-action="toggle">' + (isOpen ? '收起' : '展开') + '</button>' +
    '<button data-action="highlight">高亮同提取结果</button>' +
    '</td>';

  tr.children[0].onclick = function() {
    highlightMaskExtracted(group.extracted);
  };

  tr.querySelector('[data-action="toggle"]').onclick = function() {
    expandedMaskGroups[group.extracted] = !expandedMaskGroups[group.extracted];
    renderMaskPopup();
  };

  tr.querySelector('[data-action="highlight"]').onclick = function() {
    highlightMaskExtracted(group.extracted);
  };

  tbody.appendChild(tr);

  if (isOpen) {
    var detailTr = document.createElement('tr');
    var detailTd = document.createElement('td');
    detailTd.colSpan = 4;
    detailTd.style.padding = '10px';
    detailTd.style.background = '#0b1220';
    detailTd.style.borderBottom = '1px solid #1e293b';

    detailTd.appendChild(buildMaskDetailTable(group));
    detailTr.appendChild(detailTd);
    tbody.appendChild(detailTr);
  }
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  body.appendChild(table);

  maskPopupEl.appendChild(header);

  if (!maskPopupState.collapsed) {
    maskPopupEl.appendChild(body);
  }

  document.body.appendChild(maskPopupEl);
}

function toggleMaskPopupCollapsed() {
  maskPopupState.collapsed = !maskPopupState.collapsed;
  renderMaskPopup();
}

function minimizeMaskPopup() {
  if (maskPopupEl && maskPopupEl.parentNode) {
    var rect = maskPopupEl.getBoundingClientRect();
    maskPopupState.x = rect.left;
    maskPopupState.y = rect.top;
    maskPopupEl.parentNode.removeChild(maskPopupEl);
    maskPopupEl = null;
  }

  maskPopupState.minimized = true;

  maskMinDotEl = document.createElement('div');
  maskMinDotEl.className = 'mask-min-dot';
  maskMinDotEl.title = '点击恢复 Mask 统计表';
  maskMinDotEl.onclick = function() {
    maskPopupState.minimized = false;
    if (maskMinDotEl && maskMinDotEl.parentNode) {
      maskMinDotEl.parentNode.removeChild(maskMinDotEl);
      maskMinDotEl = null;
    }
    renderMaskPopup();
  };

  document.body.appendChild(maskMinDotEl);
}

function buildMaskDetailTable(group) {
  var wrapDiv = document.createElement('div');

  var title = document.createElement('div');
  title.style.marginBottom = '8px';
  title.style.color = '#cbd5e1';
  title.innerHTML =
  '<b>明细，' + group.count + ' 个节点</b>' +
  '<span style="color:#94a3b8;font-size:12px">，提取结果：' +
  escapeHtml(group.extracted || '(空)') +
  '</span>';

  var tableWrap = document.createElement('div');
  tableWrap.style.width = '100%';
  tableWrap.style.overflowX = 'auto';

  var table = document.createElement('table');
  table.style.width = '100%';
  table.style.minWidth = '640px';
  table.style.borderCollapse = 'collapse';
  table.style.fontSize = '12px';
  table.style.tableLayout = 'fixed';

  table.innerHTML =
  '<thead>' +
  '<tr>' +
  '<th style="width:18%;text-align:left;border-bottom:1px solid #334155;padding:6px">节点</th>' +
  '<th style="width:12%;text-align:left;border-bottom:1px solid #334155;padding:6px">类型</th>' +
  '<th style="width:50%;text-align:left;border-bottom:1px solid #334155;padding:6px">原始探针</th>' +
  '<th style="width:20%;text-align:left;border-bottom:1px solid #334155;padding:6px">操作</th>' +
  '</tr>' +
  '</thead>';

  var tbody = document.createElement('tbody');

  group.items.forEach(function(item) {
    var tr = document.createElement('tr');

    var nodeTd = document.createElement('td');
    nodeTd.style.borderBottom = '1px solid #1e293b';
    nodeTd.style.padding = '6px';
    nodeTd.style.wordBreak = 'break-all';
    nodeTd.textContent = item.name;

    var typeTd = document.createElement('td');
    typeTd.style.borderBottom = '1px solid #1e293b';
    typeTd.style.padding = '6px';
    typeTd.textContent = item.type;

    var originalTd = document.createElement('td');
    originalTd.style.borderBottom = '1px solid #1e293b';
    originalTd.style.padding = '6px';

    var originalInner = document.createElement('div');
    originalInner.style.fontFamily = 'ui-monospace,Consolas,monospace';
    originalInner.style.color = '#fbbf24';
    originalInner.style.cursor = 'pointer';
    originalInner.style.whiteSpace = 'nowrap';
    originalInner.style.overflowX = 'auto';
    originalInner.style.maxWidth = '100%';
    originalInner.textContent = item.original;
    originalInner.title = '点击后按下拉框模式高亮同类';

    originalInner.onclick = function() {
      var select = document.getElementById('maskProbeClickMode');
      var mode = select ? select.value : 'extracted';

      if (mode === 'original') {
        highlightMaskOriginal(item.original, item.nodeId);
      } else {
        highlightMaskExtracted(group.extracted, item.nodeId);
      }
    };

    originalTd.appendChild(originalInner);

    var opTd = document.createElement('td');
    opTd.style.borderBottom = '1px solid #1e293b';
    opTd.style.padding = '6px';
    opTd.style.whiteSpace = 'normal';

    var locateBtn = document.createElement('button');
    locateBtn.textContent = '定位';
    locateBtn.onclick = function() {
      locateNode(item.nodeId);
    };

    var highlightBtn = document.createElement('button');
    highlightBtn.textContent = '高亮';
    highlightBtn.onclick = function() {
      var select = document.getElementById('maskProbeClickMode');
      var mode = select ? select.value : 'extracted';

      if (mode === 'original') {
        highlightMaskOriginal(item.original, item.nodeId);
      } else {
        highlightMaskExtracted(group.extracted, item.nodeId);
      }
    };

    opTd.appendChild(locateBtn);
    opTd.appendChild(highlightBtn);

    tr.appendChild(nodeTd);
    tr.appendChild(typeTd);
    tr.appendChild(originalTd);
    tr.appendChild(opTd);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);

  wrapDiv.appendChild(title);
  wrapDiv.appendChild(tableWrap);

  return wrapDiv;
}

function highlightMaskExtracted(extracted, focusNodeId) {
  maskHighlight = {
    mode: 'extracted',
    value: extracted,
    focusNodeId: focusNodeId || null
  };

  setStatus('已高亮同提取结果：' + extracted);
  render();
}

function highlightMaskOriginal(original, focusNodeId) {
  maskHighlight = {
    mode: 'original',
    value: original,
    focusNodeId: focusNodeId || null
  };

  setStatus('已高亮同原始探针：' + original);
  render();
}

function locateNode(nodeId) {
  var node = findNode(nodeId);
  if (!node) return;

  centerViewOnPoint(node.x + 45, node.y + 27);

  selected = {
    type: 'node',
    id: node.id
  };

  multiSelectedIds.clear();

  setStatus('已定位节点：' + node.name);
  render();
}

function escapeHtml(text) {
  return String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');
}

function csvEscape(value) {
  value = String(value == null ? '' : value);

  if (/[",\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }

  return value;
}

function exportMaskCsv() {
  if (!lastMaskStats) {
    lastMaskStats = buildMaskStats();
  }

  var lines = [];
  lines.push([
    'mask_raw',
    'mask_normalized',
    'extracted',
    'node_name',
    'node_type',
    'node_id',
    'original_probe'
  ].join(','));

  lastMaskStats.rows.forEach(function(group) {
    group.items.forEach(function(item) {
      lines.push([
        csvEscape(lastMaskStats.rawMask),
                 csvEscape(lastMaskStats.mask),
                 csvEscape(group.extracted),
                 csvEscape(item.name),
                 csvEscape(item.type),
                 csvEscape(item.nodeId),
                 csvEscape(item.original)
      ].join(','));
    });
  });

  var blob = new Blob([lines.join('\n')], {
    type: 'text/csv;charset=utf-8'
  });

  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'mask_stats_detail.csv';
  link.click();
}

function getSelectionRect() {
  if (!selectionBox) return null;

  return {
    x: Math.min(selectionBox.startX, selectionBox.x),
    y: Math.min(selectionBox.startY, selectionBox.y),
    w: Math.abs(selectionBox.x - selectionBox.startX),
    h: Math.abs(selectionBox.y - selectionBox.startY)
  };
}

function nodeIntersectsRect(node, rect) {
  return !(
    node.x + 90 < rect.x ||
    node.x > rect.x + rect.w ||
    node.y + 54 < rect.y ||
    node.y > rect.y + rect.h
  );
}

function selectedNodeIdsForCopy() {
  if (multiSelectedIds.size) return new Set(multiSelectedIds);

  if (selected && selected.type === 'node') {
    return new Set([selected.id]);
  }

  return new Set();
}

function copySelectedObjects() {
  var ids = selectedNodeIdsForCopy();

  if (!ids.size) {
    setStatus('没有可复制的节点');
    return;
  }

  var nodes = circuit.nodes
  .filter(function(node) {
    return ids.has(node.id);
  })
  .map(function(node) {
    return Object.assign({}, node);
  });

  var internalWires = circuit.wires
  .filter(function(wire) {
    return ids.has(wire.from.node) && ids.has(wire.to.node);
  })
  .map(function(wire) {
    return Object.assign({}, wire);
  });

  var incomingWires = circuit.wires
  .filter(function(wire) {
    return !ids.has(wire.from.node) && ids.has(wire.to.node);
  })
  .map(function(wire) {
    return Object.assign({}, wire);
  });

  clipboard = {
    nodes: nodes,
    internalWires: internalWires,
    incomingWires: incomingWires,
    origin: getNodesBounds(nodes)
  };

  setStatus('已复制 ' + nodes.length + ' 个节点');
}

function startPastePreview() {
  if (!clipboard) {
    setStatus('剪贴板为空');
    return;
  }

  pastePreview = {
    x: mouseWorld.x,
    y: mouseWorld.y
  };

  selected = null;
  multiSelectedIds.clear();
  connectFrom = null;
  ghostPoint = null;

  setStatus('粘贴预览中，左键确认放置，Esc 取消');
  render();
}

function startImportPreview(importedObj) {
  var obj = normalize(importedObj);

  if (!obj.nodes || !obj.nodes.length) {
    alert('导入结构没有节点');
    return;
  }

  clipboard = {
    nodes: obj.nodes.map(function(node) {
      return Object.assign({}, node);
    }),
    internalWires: obj.wires.map(function(wire) {
      return Object.assign({}, wire);
    }),
    incomingWires: [],
    origin: getNodesBounds(obj.nodes)
  };

  pastePreview = {
    x: mouseWorld.x,
    y: mouseWorld.y
  };

  selected = null;
  multiSelectedIds.clear();
  connectFrom = null;
  ghostPoint = null;

  setStatus('导入预览中，移动鼠标后左键确认位置，Esc 取消');
  render();
}

function confirmPasteAtMouse() {
  if (!pastePreview || !clipboard) return;

  closeMaskPopupOnStructureChange();

  var offsetX = pastePreview.x - clipboard.origin.x;
  var offsetY = pastePreview.y - clipboard.origin.y;

  var idMap = {};
  var newIds = new Set();

  clipboard.nodes.forEach(function(oldNode) {
    var newNode = Object.assign({}, oldNode, {
      id: uid('n'),
                                x: oldNode.x + offsetX,
                                y: oldNode.y + offsetY,
                                name: oldNode.name + '_copy'
    });

    idMap[oldNode.id] = newNode.id;
    newIds.add(newNode.id);
    circuit.nodes.push(newNode);
  });

  clipboard.internalWires.forEach(function(oldWire) {
    if (!idMap[oldWire.from.node] || !idMap[oldWire.to.node]) return;

    circuit.wires.push({
      id: uid('w'),
                       from: {
                         node: idMap[oldWire.from.node],
                         port: oldWire.from.port
                       },
                       to: {
                         node: idMap[oldWire.to.node],
                         port: oldWire.to.port
                       }
    });
  });

  clipboard.incomingWires.forEach(function(oldWire) {
    if (findNode(oldWire.from.node) && idMap[oldWire.to.node]) {
      circuit.wires.push({
        id: uid('w'),
                         from: {
                           node: oldWire.from.node,
                           port: oldWire.from.port
                         },
                         to: {
                           node: idMap[oldWire.to.node],
                           port: oldWire.to.port
                         }
      });
    }
  });

  pastePreview = null;
  multiSelectedIds = newIds;
  selected = null;

  setStatus('已放置 ' + newIds.size + ' 个节点，输出到外部的连线已断开');
  render();
}

function drawSelectionBox() {
  var rect = getSelectionRect();
  if (!rect) return;

  var el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  el.setAttribute('class', 'selectionBox');
  el.setAttribute('x', rect.x);
  el.setAttribute('y', rect.y);
  el.setAttribute('width', rect.w);
  el.setAttribute('height', rect.h);
  svg.appendChild(el);
}

function drawPastePreview() {
  if (!pastePreview || !clipboard) return;

  var offsetX = pastePreview.x - clipboard.origin.x;
  var offsetY = pastePreview.y - clipboard.origin.y;

  clipboard.internalWires.forEach(function(wire) {
    var fromNode = clipboard.nodes.find(function(node) {
      return node.id === wire.from.node;
    });

    var toNode = clipboard.nodes.find(function(node) {
      return node.id === wire.to.node;
    });

    if (!fromNode || !toNode) return;

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    path.setAttribute(
      'd',
      drawPath(
        portPos(Object.assign({}, fromNode, {
          x: fromNode.x + offsetX,
          y: fromNode.y + offsetY
        }), wire.from.port, 'out'),
        portPos(Object.assign({}, toNode, {
          x: toNode.x + offsetX,
          y: toNode.y + offsetY
        }), wire.to.port, 'in')
      )
    );

    path.setAttribute('class', 'ghostWire');
    svg.appendChild(path);
  });

  clipboard.nodes.forEach(function(node) {
    drawNodeShape(
      Object.assign({}, node, {
        x: node.x + offsetX,
        y: node.y + offsetY,
        name: node.name + '_copy'
      }),
      0.65,
      true
    );
  });
}

function drawNodeShape(node, opacity, preview) {
  var group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');

  if (opacity) {
    group.setAttribute('opacity', opacity);
  }

  var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', 90);
  rect.setAttribute('height', 54);
  rect.setAttribute('rx', 12);
  rect.setAttribute('fill', colors[node.type] || '#334155');
  rect.setAttribute('stroke', preview ? '#22c55e' : '#93c5fd');
  rect.setAttribute('stroke-width', preview ? '3' : '1');
  group.appendChild(rect);

  var title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  title.setAttribute('x', 45);
  title.setAttribute('y', 24);
  title.setAttribute('text-anchor', 'middle');
  title.textContent = node.name;
  group.appendChild(title);

  var typeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  typeText.setAttribute('x', 45);
  typeText.setAttribute('y', 42);
  typeText.setAttribute('text-anchor', 'middle');
  typeText.setAttribute('fill', '#cbd5e1');
  typeText.textContent = node.type;
  group.appendChild(typeText);

  svg.appendChild(group);

  return group;
}

function render() {
  updateWorldTransform();
  svg.innerHTML = '';

  var truth = getTruthTables();
  var selectedTruth = getSelectedTruth(truth);
  var highlightSame = document.getElementById('highlightSameTruth').checked;
  var query = document.getElementById('truthSearch').value.trim();

  var sameIds = new Set();
  var matchIds = new Set();

  circuit.nodes.forEach(function(node) {
    var text = truthString(node.id, truth);

    if (
      highlightSame &&
      selectedTruth &&
      text === selectedTruth &&
      (!selected || selected.id !== node.id)
    ) {
      sameIds.add(node.id);
    }

    if (query && searchMatches(text, query)) {
      matchIds.add(node.id);
    }
  });

  circuit.wires.forEach(function(wire) {
    var fromNode = findNode(wire.from.node);
    var toNode = findNode(wire.to.node);

    if (!fromNode || !toNode) return;

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    path.setAttribute(
      'd',
      drawPath(
        portPos(fromNode, wire.from.port, 'out'),
               portPos(toNode, wire.to.port, 'in')
      )
    );

    var className = 'wire';

    if (selected && selected.type === 'wire' && selected.id === wire.id) {
      className += ' selected';
    }

    if (
      selected &&
      selected.type === 'node' &&
      (wire.from.node === selected.id || wire.to.node === selected.id)
    ) {
      className += ' highlight';
    }

    if (query && !matchIds.has(wire.from.node) && !matchIds.has(wire.to.node)) {
      className += ' dim';
    }

    path.setAttribute('class', className);

    path.onclick = function(event) {
      event.stopPropagation();

      selected = {
        type: 'wire',
        id: wire.id
      };

      multiSelectedIds.clear();
      connectFrom = null;
      ghostPoint = null;

      setStatus('已选中连线，双击或右键断开');
      render();
    };

    path.ondblclick = function(event) {
      event.stopPropagation();

      circuit.wires = circuit.wires.filter(function(item) {
        return item.id !== wire.id;
      });

      selected = null;

      setStatus('已断开连线');
      render();
    };

    path.oncontextmenu = function(event) {
      event.preventDefault();
      event.stopPropagation();

      circuit.wires = circuit.wires.filter(function(item) {
        return item.id !== wire.id;
      });

      selected = null;

      setStatus('已断开连线');
      render();
    };

    svg.appendChild(path);
  });

  if (connectFrom && ghostPoint) {
    var ghost = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    ghost.setAttribute(
      'd',
      drawPath(
        portPos(connectFrom.node, connectFrom.port, 'out'),
               ghostPoint
      )
    );

    ghost.setAttribute('class', 'ghostWire');
    svg.appendChild(ghost);
  }

  var extractedMap = {};
  if (maskHighlight && maskHighlight.mode === 'extracted') {
    var stats = lastMaskStats || buildMaskStats();
    stats.allRows.forEach(function(group) {
      group.items.forEach(function(item) {
        extractedMap[item.nodeId] = group.extracted;
      });
    });
  }

  circuit.nodes.forEach(function(node) {
    var text = truthString(node.id, truth);
    var same = sameIds.has(node.id);
    var match = matchIds.has(node.id);
    var multi = multiSelectedIds.has(node.id);

    var maskExtractMatch = false;
    var maskOriginalMatch = false;
    var maskFocus = false;

    if (maskHighlight) {
      if (maskHighlight.mode === 'extracted') {
        maskExtractMatch = extractedMap[node.id] === maskHighlight.value;
      }

      if (maskHighlight.mode === 'original') {
        maskOriginalMatch = text === maskHighlight.value;
      }

      maskFocus = maskHighlight.focusNodeId === node.id;
    }

    var group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    var className = 'node';

    if (selected && selected.type === 'node' && selected.id === node.id) {
      className += ' selected';
    }

    if (multi) {
      className += ' multiSelected';
    }

    if (same) {
      className += ' sameTruth';
    }

    if (match) {
      className += ' searchMatch';
    }

    if (maskExtractMatch) {
      className += ' maskExtractMatch';
    }

    if (maskOriginalMatch) {
      className += ' maskOriginalMatch';
    }

    if (maskFocus) {
      className += ' maskFocus';
    }

    group.setAttribute('class', className);
    group.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');

    group.onmousedown = function(event) {
      if (event.target.classList.contains('port')) return;

      event.stopPropagation();

      var pos = screenToWorld(event.clientX, event.clientY);

      if (multiSelectedIds.has(node.id)) {
        draggingGroup = {
          startX: pos.x,
          startY: pos.y,
          nodes: circuit.nodes
          .filter(function(item) {
            return multiSelectedIds.has(item.id);
          })
          .map(function(item) {
            return {
              id: item.id,
              x: item.x,
              y: item.y
            };
          })
        };

        selected = null;
      } else {
        draggingNode = {
          node: node,
          dx: pos.x - node.x,
          dy: pos.y - node.y
        };

        multiSelectedIds.clear();

        selected = {
          type: 'node',
          id: node.id
        };
      }

      connectFrom = null;
      ghostPoint = null;

      render();
    };

    group.ondblclick = function(event) {
      if (event.target.classList.contains('port')) return;

      event.stopPropagation();

      selected = {
        type: 'node',
        id: node.id
      };

      multiSelectedIds.clear();
      deleteSelected();
      setStatus('已删除节点');
    };

    var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', 90);
    rect.setAttribute('height', 54);
    rect.setAttribute('rx', 12);
    rect.setAttribute('fill', colors[node.type] || '#334155');
    rect.setAttribute('stroke', '#93c5fd');
    group.appendChild(rect);

    var title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('x', 45);
    title.setAttribute('y', 24);
    title.setAttribute('text-anchor', 'middle');
    title.textContent = node.name;
    group.appendChild(title);

    var typeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    typeText.setAttribute('x', 45);
    typeText.setAttribute('y', 42);
    typeText.setAttribute('text-anchor', 'middle');
    typeText.setAttribute('fill', '#cbd5e1');
    typeText.textContent = node.type;
    group.appendChild(typeText);

    portDefs(node).in.forEach(function(port) {
      var pos = portPos(
        Object.assign({}, node, { x: 0, y: 0 }),
                        port,
                        'in'
      );

      drawPort(group, pos.x, pos.y, port, 'in', node);
    });

    portDefs(node).out.forEach(function(port) {
      var pos = portPos(
        Object.assign({}, node, { x: 0, y: 0 }),
                        port,
                        'out'
      );

      drawPort(group, pos.x, pos.y, port, 'out', node);
    });

    svg.appendChild(group);

    if (shouldShowProbe(node, same, match || maskExtractMatch || maskOriginalMatch)) {
      var fullText = truthString(node.id, truth);
      var probeText = shortProbeText(fullText);
      var x = node.x + 96;
      var y = node.y - 8;
      var width = Math.max(32, probeText.length * 7 + 10);

      var bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('class', 'probeBg' + (match ? ' searchProbeBg' : ''));
      bg.setAttribute('x', x);
      bg.setAttribute('y', y);
      bg.setAttribute('width', width);
      bg.setAttribute('height', 19);

      bg.onclick = function(event) {
        event.stopPropagation();
        copyText(fullText, '已复制探针 01');
      };

      svg.appendChild(bg);

      var probe = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      probe.setAttribute('class', 'probe' + (match ? ' searchProbe' : ''));
      probe.setAttribute('x', x + 5);
      probe.setAttribute('y', y + 14);
      probe.textContent = probeText;

      probe.onclick = function(event) {
        event.stopPropagation();
        copyText(fullText, '已复制探针 01');
      };

      svg.appendChild(probe);
    }
  });

  drawSelectionBox();
  drawPastePreview();
  drawReplacePreview();

  svg.onclick = function(event) {
    if (replacePreview) {
      event.stopPropagation();
      confirmReplacePreview();
      return;
    }

    if (pastePreview) {
      event.stopPropagation();
      confirmPasteAtMouse();
      return;
    }

    if (selectionBox) {
      event.stopPropagation();
      return;
    }

    if (multiSelectedIds.size > 0) {
      event.stopPropagation();
      return;
    }

    if (!panning) {
      clearSelection();
    }
  };

  updatePanels(truth, sameIds, matchIds);
}

function drawPort(group, x, y, port, kind, node) {
  var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('class', 'port');
  circle.setAttribute('cx', x);
  circle.setAttribute('cy', y);
  circle.setAttribute('r', 7);
  circle.setAttribute('fill', kind === 'out' ? '#facc15' : '#38bdf8');

  circle.onclick = function(event) {
    event.stopPropagation();

    if (kind === 'out') {
      connectFrom = {
        node: node,
        port: port
      };

      ghostPoint = screenToWorld(event.clientX, event.clientY);
      selected = null;
      multiSelectedIds.clear();

      setStatus('已选择输出端口，点击目标输入端口');
      render();
      return;
    }

    if (kind === 'in') {
      if (connectFrom) {
        addWire(connectFrom.node, connectFrom.port, node, port);
        setStatus('已连接');
        return;
      }

      var old = circuit.wires.find(function(wire) {
        return wire.to.node === node.id && wire.to.port === port;
      });

      if (old) {
        var source = findNode(old.from.node);

        circuit.wires = circuit.wires.filter(function(wire) {
          return wire.id !== old.id;
        });

        if (source) {
          connectFrom = {
            node: source,
            port: old.from.port
          };

          ghostPoint = screenToWorld(event.clientX, event.clientY);
          selected = null;
          multiSelectedIds.clear();

          setStatus('已拿起这条连接');
          render();
        }
      }
    }
  };

  circle.oncontextmenu = function(event) {
    event.preventDefault();
    event.stopPropagation();

    if (kind === 'in') {
      circuit.wires = circuit.wires.filter(function(wire) {
        return !(wire.to.node === node.id && wire.to.port === port);
      });
    } else {
      circuit.wires = circuit.wires.filter(function(wire) {
        return !(wire.from.node === node.id && wire.from.port === port);
      });
    }

    selected = null;
    multiSelectedIds.clear();

    setStatus('已断开端口连接');
    render();
  };

  group.appendChild(circle);
}

function updatePanels(truth, sameIds, matchIds) {
  document.getElementById('info').innerHTML =
  '节点 ' + circuit.nodes.length + '，连线 ' + circuit.wires.length +
  '<br>输入 ' + truth.inputCount + '，探针长度 ' + truth.rows +
  (truth.inputCount > 12 ? '，超过 12 输入已限制显示' : '') +
  '<br>画布 ' + canvas.width + ' × ' + canvas.height +
  '，缩放 ' + Math.round(view.scale * 100) + '%' +
  '<br>选中：' + (
    selected
    ? selected.type + ' ' + selected.id
    : (multiSelectedIds.size ? '框选 ' + multiSelectedIds.size + ' 个节点' : '无')
  ) +
  '<br>相同 01 节点：' + sameIds.size;

  document.getElementById('exportText').value = JSON.stringify(exportObj(), null, 2);

  document.getElementById('selectedProbeText').value =
  selected && selected.type === 'node'
  ? truthString(selected.id, truth)
  : '';

  var query = document.getElementById('truthSearch').value.trim();

  document.getElementById('searchInfo').innerHTML = !query
  ? '未输入查找条件。'
  : (
    circuit.nodes
    .filter(function(node) {
      return matchIds.has(node.id);
    })
    .map(function(node) {
      return node.name + ' (' + node.type + ') = ' + truthString(node.id, truth);
    })
    .join('<br>') || '没有匹配节点。'
  );

  refreshTemplates();
}

function copyText(text, message) {
  if (!text) {
    alert('没有可复制内容');
    return;
  }

  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() {
      setStatus(message || '已复制');
    }).catch(function() {
      fallbackCopyText(text, message);
    });
  } else {
    fallbackCopyText(text, message);
  }
}

function fallbackCopyText(text, message) {
  var textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand('copy');
    setStatus(message || '已复制');
  } catch (error) {
    alert('复制失败');
  }

  document.body.removeChild(textarea);
}

function copySelectedProbe() {
  var truth = getTruthTables();

  if (!selected || selected.type !== 'node') {
    alert('请先选择一个节点');
    return;
  }

  copyText(truthString(selected.id, truth), '已复制选中节点探针 01');
}

function calculateAssumption() {
  var gate = document.getElementById('assumeGate').value;
  var a = document.getElementById('assumeA').value.trim();
  var b = document.getElementById('assumeB').value.trim();

  if (!a) {
    alert('请输入 a 信号');
    return;
  }

  var result = '';

  if (gate === 'not') {
    for (var i = 0; i < a.length; i += 1) {
      var ch = a[i];

      if (ch === '?') {
        result += '?';
      } else if (ch === '0' || ch === '1') {
        result += evalGate('not', ch);
      } else {
        result += '?';
      }
    }

    document.getElementById('assumeResult').value = result;
    return;
  }

  if (!b) {
    alert('该门需要 b 信号');
    return;
  }

  var len = Math.min(a.length, b.length);

  for (var j = 0; j < len; j += 1) {
    var ca = a[j];
    var cb = b[j];

    if (
      (ca !== '0' && ca !== '1' && ca !== '?') ||
      (cb !== '0' && cb !== '1' && cb !== '?')
    ) {
      result += '?';
    } else {
      result += evalGate(gate, ca, cb);
    }
  }

  document.getElementById('assumeResult').value = result;
}

function copyAssumptionResult() {
  var result = document.getElementById('assumeResult').value.trim();

  if (!result) {
    alert('没有可复制的假设结果');
    return;
  }

  copyText(result, '已复制假设计算结果');
}

function exportObj() {
  return {
    folder: (document.getElementById('exportFolder') && document.getElementById('exportFolder').value) || circuit.folder || 'circuit',
    version: 13,
    canvas: Object.assign({}, canvas),
    view: Object.assign({}, view),
    nodes: circuit.nodes.map(function(node) {
      return Object.assign({}, node);
    }),
    wires: circuit.wires.map(function(wire) {
      return Object.assign({}, wire);
    })
  };
}

function copyExport() {
  copyText(JSON.stringify(exportObj(), null, 2), '已复制导出 JSON');
}

function downloadExport() {
  var obj = exportObj();

  var blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: 'application/json'
  });

  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = obj.folder + '.json';
  link.click();
}

function downloadCanvas() {
  var obj = exportObj();
  obj.kind = 'logic_canvas';

  var blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: 'application/json'
  });

  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = (obj.folder || 'logic_canvas') + '_canvas.json';
  link.click();
}

function loadCanvasFile(event) {
  var file = event.target.files[0];
  if (!file) return;

  var reader = new FileReader();

  reader.onload = function() {
    try {
      var obj = JSON.parse(reader.result);
      importCanvasObject(obj);
      setStatus('已载入画布');
    } catch (error) {
      alert('载入画布失败，请检查 JSON');
    }
  };

  reader.readAsText(file);
  event.target.value = '';
}

function importCanvasObject(obj) {
  closeMaskPopupOnStructureChange();

  var normalized = normalize(obj);

  circuit = {
    folder: normalized.folder,
    nodes: normalized.nodes,
    wires: normalized.wires
  };

  canvas = normalized.canvas || canvas;
  view = normalized.view || view;

  document.getElementById('canvasWidth').value = canvas.width;
  document.getElementById('canvasHeight').value = canvas.height;

  idSeq = 1000;
  selected = null;
  multiSelectedIds.clear();
  connectFrom = null;
  ghostPoint = null;
  pastePreview = null;
  replacePreview = null;

  updateWorldTransform();
  render();
}

function readImport() {
  return JSON.parse(document.getElementById('importText').value);
}

function importFile(event) {
  var file = event.target.files[0];
  if (!file) return;

  var reader = new FileReader();

  reader.onload = function() {
    document.getElementById('importText').value = reader.result;
  };

  reader.readAsText(file);
}

function normalize(obj) {
  return {
    folder: obj.folder || 'imported',
    canvas: obj.canvas || {
      width: 2200,
      height: 1400
    },
    view: obj.view || {
      x: 40,
      y: 40,
      scale: 1
    },
    nodes: (obj.nodes || []).map(function(node) {
      return Object.assign({}, node);
    }),
    wires: (obj.wires || []).map(function(wire) {
      return Object.assign({}, wire);
    })
  };
}

function importAsCircuit() {
  try {
    startImportPreview(readImport());
  } catch (error) {
    alert('导入失败，请检查 JSON 格式');
  }
}

function importAsTemplate() {
  try {
    var obj = normalize(readImport());
    var name = obj.folder || prompt('模板名');

    templates[name] = obj;
    refreshTemplates();

    setStatus('已导入模板 ' + name);
  } catch (error) {
    alert('导入失败');
  }
}

function saveTemplateFromCurrent() {
  var name = document.getElementById('tplName').value.trim() || 'template';
  templates[name] = normalize(exportObj());
  refreshTemplates();
  setStatus('已保存模板 ' + name);
}

function refreshTemplates() {
  var select = document.getElementById('replaceSelect');
  if (!select) return;

  var oldValue = select.value;
  select.innerHTML = '';

  Object.keys(templates).forEach(function(key) {
    var option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    select.appendChild(option);
  });

  select.value = oldValue;

  var templateList = document.getElementById('templates');

  if (templateList) {
    templateList.innerHTML = Object.keys(templates).map(function(key) {
      return '<span class="pill">' + key + '</span>';
    }).join('');
  }
}

function replaceSelectedNode() {
  if (!selected || selected.type !== 'node') {
    alert('请先选择要替换的节点');
    return;
  }

  var template = templates[document.getElementById('replaceSelect').value];

  if (!template) {
    alert('没有模板');
    return;
  }

  var oldNode = findNode(selected.id);
  if (!oldNode) return;

  var templateInputs = template.nodes
  .filter(function(node) {
    return node.type === 'input';
  })
  .sort(function(a, b) {
    return a.y - b.y || a.x - b.x;
  });

  var templateOutputs = template.nodes
  .filter(function(node) {
    return node.type === 'output';
  })
  .sort(function(a, b) {
    return a.y - b.y || a.x - b.x;
  });

  var internalNodes = template.nodes.filter(function(node) {
    return node.type !== 'input' && node.type !== 'output';
  });

  if (!internalNodes.length) {
    alert('模板没有内部逻辑节点');
    return;
  }

  replacePreview = {
    oldNodeId: oldNode.id,
    template: template,
    templateInputs: templateInputs,
    templateOutputs: templateOutputs,
    internalNodes: internalNodes.map(function(node) {
      return Object.assign({}, node);
    }),
    origin: getNodesBounds(internalNodes),
    x: mouseWorld.x,
    y: mouseWorld.y
  };

  selected = null;
  multiSelectedIds.clear();
  connectFrom = null;
  ghostPoint = null;

  setStatus('替换预览中，移动鼠标选择位置，左键确认，Esc 取消');
  render();
}

function cancelReplacePreview() {
  replacePreview = null;
  setStatus('已取消替换预览');
  render();
}

function confirmReplacePreview() {
  if (!replacePreview) return;

  closeMaskPopupOnStructureChange();

  var preview = replacePreview;
  var oldNode = findNode(preview.oldNodeId);

  if (!oldNode) {
    replacePreview = null;
    alert('原节点不存在，无法完成替换');
    render();
    return;
  }

  var incomingWires = circuit.wires.filter(function(wire) {
    return wire.to.node === oldNode.id;
  });

  var outgoingWires = circuit.wires.filter(function(wire) {
    return wire.from.node === oldNode.id;
  });

  circuit.wires = circuit.wires.filter(function(wire) {
    return wire.from.node !== oldNode.id && wire.to.node !== oldNode.id;
  });

  circuit.nodes = circuit.nodes.filter(function(node) {
    return node.id !== oldNode.id;
  });

  var offsetX = preview.x - preview.origin.x;
  var offsetY = preview.y - preview.origin.y;

  var idMap = {};
  var newIds = new Set();

  preview.internalNodes.forEach(function(templateNode) {
    var newNode = {
      id: uid('n'),
                                type: templateNode.type,
                                x: templateNode.x + offsetX,
                                y: templateNode.y + offsetY,
                                name: templateNode.name
    };

    idMap[templateNode.id] = newNode.id;
    newIds.add(newNode.id);
    circuit.nodes.push(newNode);
  });

  preview.template.wires.forEach(function(templateWire) {
    if (idMap[templateWire.from.node] && idMap[templateWire.to.node]) {
      circuit.wires.push({
        id: uid('w'),
                         from: {
                           node: idMap[templateWire.from.node],
                           port: templateWire.from.port
                         },
                         to: {
                           node: idMap[templateWire.to.node],
                           port: templateWire.to.port
                         }
      });
    }
  });

  preview.templateInputs.forEach(function(inputNode, index) {
    var externalWire = incomingWires[index];
    if (!externalWire) return;

    preview.template.wires
    .filter(function(wire) {
      return wire.from.node === inputNode.id;
    })
    .forEach(function(wire) {
      if (idMap[wire.to.node]) {
        circuit.wires.push({
          id: uid('w'),
                           from: {
                             node: externalWire.from.node,
                             port: externalWire.from.port
                           },
                           to: {
                             node: idMap[wire.to.node],
                             port: wire.to.port
                           }
        });
      }
    });
  });

  preview.templateOutputs.forEach(function(outputNode, index) {
    var externalWire = outgoingWires[index];
    if (!externalWire) return;

    var innerWire = preview.template.wires.find(function(wire) {
      return wire.to.node === outputNode.id;
    });

    if (innerWire && idMap[innerWire.from.node]) {
      circuit.wires.push({
        id: uid('w'),
                         from: {
                           node: idMap[innerWire.from.node],
                           port: innerWire.from.port
                         },
                         to: {
                           node: externalWire.to.node,
                           port: externalWire.to.port
                         }
      });
    }
  });

  replacePreview = null;
  selected = null;
  multiSelectedIds = newIds;

  setStatus('已确认替换位置，放置 ' + newIds.size + ' 个内部节点');
  render();
}

function drawReplacePreview() {
  if (!replacePreview) return;

  var preview = replacePreview;
  var offsetX = preview.x - preview.origin.x;
  var offsetY = preview.y - preview.origin.y;

  preview.template.wires.forEach(function(wire) {
    var fromNode = preview.internalNodes.find(function(node) {
      return node.id === wire.from.node;
    });

    var toNode = preview.internalNodes.find(function(node) {
      return node.id === wire.to.node;
    });

    if (!fromNode || !toNode) return;

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

    path.setAttribute(
      'd',
      drawPath(
        portPos(Object.assign({}, fromNode, {
          x: fromNode.x + offsetX,
          y: fromNode.y + offsetY
        }), wire.from.port, 'out'),
        portPos(Object.assign({}, toNode, {
          x: toNode.x + offsetX,
          y: toNode.y + offsetY
        }), wire.to.port, 'in')
      )
    );

    path.setAttribute('class', 'ghostWire');
    svg.appendChild(path);
  });

  preview.internalNodes.forEach(function(node) {
    drawNodeShape(
      Object.assign({}, node, {
        x: node.x + offsetX,
        y: node.y + offsetY
      }),
      0.65,
      true
    );
  });
}

function autoLayout() {
  var inputs = circuit.nodes.filter(function(node) {
    return node.type === 'input';
  });

  var outputs = circuit.nodes.filter(function(node) {
    return node.type === 'output';
  });

  var gates = circuit.nodes.filter(function(node) {
    return node.type !== 'input' && node.type !== 'output';
  });

  inputs.forEach(function(node, index) {
    node.x = 80;
    node.y = 120 + index * 100;
  });

  gates.forEach(function(node, index) {
    node.x = 340 + (index % 4) * 180;
    node.y = 100 + Math.floor(index / 4) * 100;
  });

  outputs.forEach(function(node, index) {
    node.x = Math.max(1200, canvas.width - 260);
    node.y = 120 + index * 100;
  });

  render();
}

function clearTruthSearch() {
  document.getElementById('truthSearch').value = '';
  render();
}

function toggleRightPanel() {
  var app = document.getElementById('app');
  var button = document.getElementById('rightToggleBtn');

  app.classList.toggle('right-collapsed');
  button.textContent = app.classList.contains('right-collapsed') ? '展开' : '折叠';

  setTimeout(function() {
    updateWorldTransform();
  }, 220);
}

function toggleLeftPanel() {
  var app = document.getElementById('app');
  var button = document.querySelector('#leftPanel .miniBtn');

  app.classList.toggle('left-collapsed');
  button.textContent = app.classList.contains('left-collapsed') ? '展开' : '折叠';

  setTimeout(function() {
    updateWorldTransform();
  }, 220);
}

function selectedComponentType() {
  return document.getElementById('componentSelect').value;
}

function addSelectedComponentToCenter() {
  addNode(selectedComponentType());
}

function onComponentDragStart(event) {
  event.dataTransfer.setData('text/plain', selectedComponentType());
  event.dataTransfer.effectAllowed = 'copy';
}

function loadBuiltInXor() {
  newCircuitNoConfirm();

  var a = addNode('input', 80, 180, 'in0');
  var b = addNode('input', 80, 320, 'in1');

  var n1 = addNode('nand', 300, 250, 'n0');
  var n2 = addNode('nand', 500, 180, 'n1');
  var n3 = addNode('nand', 500, 320, 'n2');
  var n4 = addNode('nand', 700, 250, 'n3');

  var output = addNode('output', 920, 250, 'out0');

  addWire(a, 'out', n1, 'a');
  addWire(b, 'out', n1, 'b');

  addWire(a, 'out', n2, 'a');
  addWire(n1, 'out', n2, 'b');

  addWire(n1, 'out', n3, 'a');
  addWire(b, 'out', n3, 'b');

  addWire(n2, 'out', n4, 'a');
  addWire(n3, 'out', n4, 'b');

  addWire(n4, 'out', output, 'in');

  templates.xor_nand = normalize(exportObj());

  render();
  setStatus('已载入 4 NAND XOR 示例');
}

function loadSimpleGateExample() {
  newCircuitNoConfirm();

  var a = addNode('input', 80, 150, 'in0');
  var b = addNode('input', 80, 290, 'in1');

  var andGate = addNode('and', 320, 120, 'and0');
  var orGate = addNode('or', 320, 260, 'or0');
  var xorGate = addNode('xor', 560, 190, 'xor0');
  var output = addNode('output', 820, 190, 'out0');

  addWire(a, 'out', andGate, 'a');
  addWire(b, 'out', andGate, 'b');

  addWire(a, 'out', orGate, 'a');
  addWire(b, 'out', orGate, 'b');

  addWire(andGate, 'out', xorGate, 'a');
  addWire(orGate, 'out', xorGate, 'b');

  addWire(xorGate, 'out', output, 'in');

  render();
  setStatus('已载入普通门示例');
}

function loadDemoCircuit() {
  newCircuitNoConfirm();

  canvas = { width: 2200, height: 1400 };
  document.getElementById('canvasWidth').value = canvas.width;
  document.getElementById('canvasHeight').value = canvas.height;

  var a = addNode('input', 120, 180, 'A');
  var b = addNode('input', 120, 340, 'B');

  var and1 = addNode('and', 380, 160, 'A_AND_B');
  var or1 = addNode('or', 380, 360, 'A_OR_B');
  var xor1 = addNode('xor', 680, 260, 'RESULT_XOR');
  var not1 = addNode('not', 980, 260, 'NOT_RESULT');
  var out = addNode('output', 1260, 260, 'OUT');

  addWire(a, 'out', and1, 'a');
  addWire(b, 'out', and1, 'b');

  addWire(a, 'out', or1, 'a');
  addWire(b, 'out', or1, 'b');

  addWire(and1, 'out', xor1, 'a');
  addWire(or1, 'out', xor1, 'b');

  addWire(xor1, 'out', not1, 'in');
  addWire(not1, 'out', out, 'in');

  view = { x: 40, y: 40, scale: 1 };
  updateWorldTransform();
  render();
  setStatus('已载入 Demo 电路');
}

updateWorldTransform();
loadDemoCircuit();
