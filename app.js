// app.js
import {
  geometricRank, zipZipRank,
  insertNode, deleteNode, findNode,
  treeHeight, flattenNodes, layoutTree, buildEdges,
  rankLabel, primaryRank, getRankGroups,
} from './ziptree.js';

// ─── State ────────────────────────────────────────────────────────────────────

let root      = null;
let rankMode  = 'random';   // 'random' | 'manual'
let treeMode  = 'zip';      // 'zip' | 'zipzip'
let offset    = { x: 0, y: 0 };
let zoom      = 1;
let dragging  = false;
let dragStart = null;
let pendingDel = null;
let newKey     = null;
let nodeCount  = 0;         // tracked separately to size r2 range well

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const keyInput      = document.getElementById('key-input');
const rankInput     = document.getElementById('rank-input');
const rankRow       = document.getElementById('rank-manual-row');
const btnRandom     = document.getElementById('btn-mode-random');
const btnManual     = document.getElementById('btn-mode-manual');
const btnInsert     = document.getElementById('btn-insert');
const btnDelete     = document.getElementById('btn-delete');
const btnExample    = document.getElementById('btn-example');
const btnClear      = document.getElementById('btn-clear');
const svgEl         = document.getElementById('tree-svg');
const logPanel      = document.getElementById('log-panel');
const btnZip        = document.getElementById('btn-tree-zip');
const btnZipZip     = document.getElementById('btn-tree-zipzip');
const treeModeLabel = document.getElementById('tree-mode-label');
const rankInputLabel = document.getElementById('rank-input-label');
const rankHint      = document.getElementById('rank-hint');

const statNodes     = document.getElementById('stat-nodes');
const statHeight    = document.getElementById('stat-height');
const statRoot      = document.getElementById('stat-root');
const statMaxRank   = document.getElementById('stat-maxrank');

// ─── Colors ───────────────────────────────────────────────────────────────────

const RANK_COLORS = [
  '#2d9e5f','#3b72d4','#9055d4','#c94a9a',
  '#d94040','#c07a10','#1a9e9e','#6a9e1a',
  '#4a7ab4','#a04040',
];
const rankColor = r => RANK_COLORS[r % RANK_COLORS.length];

// Subtle highlight palette for r1-rank groups (zip-zip mode)
const GROUP_FILLS = [
  '#2d9e5f22','#3b72d422','#9055d422','#c94a9a22',
  '#d9404022','#c07a1022','#1a9e9e22','#6a9e1a22',
];

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  const nodes = flattenNodes(root);

  // Stats
  statNodes.textContent  = nodes.length;
  statHeight.textContent = root ? treeHeight(root) : 0;

  if (root) {
    statRoot.textContent    = `${root.key} (${rankLabel(root.rank)})`;
    const maxR1 = Math.max(...nodes.map(n => primaryRank(n.rank)));
    statMaxRank.textContent = treeMode === 'zipzip'
      ? `r1=${maxR1}`
      : maxR1;
  } else {
    statRoot.textContent    = '—';
    statMaxRank.textContent = '—';
  }

  // Layout
  const { positions, minX, R } = root
    ? layoutTree(root)
    : { positions: {}, minX: 0, R: 26 };
  const edges = root ? buildEdges(root, positions) : [];
  const tx = -minX + 70;

  // Rank groups (zip-zip only)
  const rankGroups = (treeMode === 'zipzip' && root)
    ? getRankGroups(root)
    : new Map();
  // Map each r1-rank to a group index for coloring
  const r1Ranks = [...rankGroups.keys()].sort((a, b) => a - b);
  const r1GroupIndex = new Map(r1Ranks.map((r, i) => [r, i]));

  // Clear SVG
  while (svgEl.firstChild) svgEl.removeChild(svgEl.lastChild);

  // Defs
  const defs = svg('defs');
  const pattern = svg('pattern', { id:'dots', width:'24', height:'24', patternUnits:'userSpaceOnUse' });
  pattern.appendChild(svg('circle', { cx:'0.8', cy:'0.8', r:'0.7', fill:'#e8e8e0' }));
  defs.appendChild(pattern);
  svgEl.appendChild(defs);

  // Dot background
  svgEl.appendChild(svg('rect', { width:'100%', height:'100%', fill:'url(#dots)' }));

  // Main group (pan + zoom)
  const g     = svg('g', { transform: `translate(${offset.x + 80}, ${offset.y + 46}) scale(${zoom})` });
  const inner = svg('g', { transform: `translate(${tx}, 0)` });

  // ── Rank-group halos (zip-zip mode) ──────────────────────────────────────
  if (treeMode === 'zipzip') {
    for (const [r1, keys] of rankGroups) {
      if (keys.length <= 1) continue; // solo nodes don't need highlight
      const gi = r1GroupIndex.get(r1) ?? 0;
      const fill = GROUP_FILLS[gi % GROUP_FILLS.length];
      const stroke = RANK_COLORS[gi % RANK_COLORS.length];
      // Draw a rounded rect behind all nodes in this group
      const pts = keys.map(k => positions[k]).filter(Boolean);
      if (!pts.length) continue;
      const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
      const pad = R + 8;
      const bx = Math.min(...xs) - pad, by = Math.min(...ys) - pad;
      const bw = Math.max(...xs) - Math.min(...xs) + pad * 2;
      const bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
      inner.appendChild(svg('rect', {
        x: bx, y: by, width: bw, height: bh,
        rx: 14, ry: 14,
        fill, stroke, 'stroke-width': '1',
        'stroke-dasharray': '4 3', opacity: '0.85',
      }));
    }
  }

  // ── Edges ────────────────────────────────────────────────────────────────
  for (const e of edges) {
    const f = positions[e.from], t = positions[e.to];
    if (!f || !t) continue;
    inner.appendChild(svg('line', {
      x1: f.x, y1: f.y, x2: t.x, y2: t.y,
      stroke: '#d0d0c4', 'stroke-width': '1.5',
    }));
  }

  // ── Nodes ────────────────────────────────────────────────────────────────
  for (const n of nodes) {
    const p = positions[n.key];
    if (!p) continue;
    const r1 = primaryRank(n.rank);
    const c  = rankColor(r1);
    const isDel = pendingDel === n.key;
    const isNew = newKey     === n.key;
    const cls   = isDel ? 'node-del' : isNew ? 'node-new' : '';

    const group = svg('g', {
      transform: `translate(${p.x}, ${p.y})`,
      class: cls,
      style: 'cursor: pointer;',
    });

    // Outer ring
    group.appendChild(svg('circle', {
      r: R + 3, fill: 'none', stroke: c,
      'stroke-width': '.5', opacity: '.2',
    }));
    // Body
    group.appendChild(svg('circle', {
      r: R, fill: `${c}18`, stroke: c, 'stroke-width': '1.5',
    }));
    // Key label
    group.appendChild(svgText(n.key, {
      'text-anchor': 'middle', 'dominant-baseline': 'middle',
      dy: treeMode === 'zipzip' ? '-7' : '-4',
      'font-size': n.key.length > 2 ? '9' : '13',
      'font-weight': '600', fill: c,
    }));
    // Rank label
    if (treeMode === 'zipzip') {
      // Show r1 and r2 on separate sub-lines
      group.appendChild(svgText(`r1=${n.rank.r1}`, {
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        dy: '6', 'font-size': '7.5', fill: c, opacity: '.75',
      }));
      group.appendChild(svgText(`r2=${n.rank.r2}`, {
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        dy: '16', 'font-size': '7.5', fill: c, opacity: '.55',
      }));
    } else {
      group.appendChild(svgText(`r=${n.rank}`, {
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        dy: '10', 'font-size': '8.5', fill: c, opacity: '.6',
      }));
    }

    // Click to select
    group.addEventListener('click', () => { keyInput.value = n.key; });
    inner.appendChild(group);
  }

  g.appendChild(inner);
  svgEl.appendChild(g);
}

// ─── SVG helpers ──────────────────────────────────────────────────────────────

function svg(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function svgText(content, attrs = {}) {
  const el = svg('text', attrs);
  el.textContent = content;
  return el;
}

// ─── Log ──────────────────────────────────────────────────────────────────────

function addLog(msg, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent =
    type === 'insert' ? '↑' :
    type === 'delete' ? '↓' :
    type === 'error'  ? '✕' : '·';
  const text = document.createElement('span');
  text.textContent = msg;
  entry.appendChild(icon);
  entry.appendChild(text);
  logPanel.insertBefore(entry, logPanel.children[1]);
  while (logPanel.children.length > 41) logPanel.removeChild(logPanel.lastChild);
}

// ─── Operations ───────────────────────────────────────────────────────────────

function makeRank() {
  if (treeMode === 'zipzip') return zipZipRank(nodeCount);
  return geometricRank();
}

function doInsert() {
  const key = keyInput.value.trim();
  if (!key) return addLog('Enter a key', 'warn');
  if (findNode(root, key)) return addLog(`"${key}" already exists`, 'error');

  let rank;
  if (rankMode === 'manual') {
    if (treeMode === 'zipzip') {
      // Parse "r1,r2" or just "r1"
      const raw = rankInput.value.trim();
      const parts = raw.split(',').map(s => parseInt(s.trim(), 10));
      const r1 = isNaN(parts[0]) ? 0 : Math.max(0, Math.min(20, parts[0]));
      const r2 = isNaN(parts[1]) ? 1 : Math.max(1, parts[1]);
      rank = { r1, r2 };
    } else {
      rank = parseInt(rankInput.value, 10);
      if (isNaN(rank)) rank = 0;
      else if (rank < 0 || rank > 20)
        return addLog('Rank must be an integer 0–20', 'error');
    }
  } else {
    rank = makeRank();
  }

  const node = { key, rank, left: null, right: null };
  root = insertNode(root, node);
  nodeCount++;
  newKey = key;
  setTimeout(() => { newKey = null; render(); }, 600);
  addLog(`insert("${key}",  rank = ${rankLabel(rank)})`, 'insert');
  keyInput.value  = '';
  rankInput.value = '';
  render();
}

function doDelete() {
  const key = keyInput.value.trim();
  if (!key) return addLog('Enter a key', 'warn');
  if (!findNode(root, key)) return addLog(`"${key}" not found`, 'error');

  pendingDel = key;
  addLog(`delete("${key}")`, 'delete');
  render();
  setTimeout(() => {
    root = deleteNode(root, key);
    nodeCount = Math.max(0, nodeCount - 1);
    pendingDel = null;
    render();
  }, 400);
  keyInput.value = '';
}

function loadExample() {
  root = null;
  nodeCount = 0;

  if (treeMode === 'zipzip') {
    // Example from zip-zip paper Figure 4
    const items = [
      { key:'-19', rank:{ r1:0, r2:33 } },
      { key:'-8',  rank:{ r1:1, r2:26 } },
      { key:'-4',  rank:{ r1:0, r2:31 } },
      { key:'-2',  rank:{ r1:0, r2:1  } },
      { key:'-1',  rank:{ r1:3, r2:13 } },
      { key:'2',   rank:{ r1:1, r2:1  } },
      { key:'5',   rank:{ r1:0, r2:23 } },
      { key:'7',   rank:{ r1:0, r2:46 } },
      { key:'12',  rank:{ r1:0, r2:13 } },
      { key:'16',  rank:{ r1:1, r2:49 } },
      { key:'21',  rank:{ r1:3, r2:31 } },
      { key:'22',  rank:{ r1:0, r2:21 } },
      { key:'29',  rank:{ r1:2, r2:20 } },
      { key:'52',  rank:{ r1:0, r2:2  } },
      { key:'55',  rank:{ r1:1, r2:38 } },
    ];
    for (const n of items) {
      root = insertNode(root, { ...n, left: null, right: null });
      nodeCount++;
    }
    addLog('Loaded Figure 4 (Gila, Goodrich, Tarjan 2024)', 'info');
  } else {
    // Original zip tree example (Figure 2 of Tarjan et al.)
    const items = [
      {key:'-19',rank:0},{key:'-8',rank:1},{key:'-4',rank:0},{key:'-2',rank:0},
      {key:'-1',rank:3},{key:'2',rank:1},{key:'5',rank:0},{key:'7',rank:0},
      {key:'12',rank:0},{key:'16',rank:1},{key:'21',rank:3},{key:'22',rank:0},
      {key:'29',rank:2},{key:'52',rank:0},{key:'55',rank:1},
    ];
    for (const n of items) {
      root = insertNode(root, { ...n, left: null, right: null });
      nodeCount++;
    }
    addLog('Loaded Figure 2 (Tarjan, Levy, Timmel 2021)', 'info');
  }
  render();
}

// ─── Tree mode ────────────────────────────────────────────────────────────────

function setTreeMode(mode) {
  treeMode = mode;
  btnZip.classList.toggle('active', mode === 'zip');
  btnZipZip.classList.toggle('active', mode === 'zipzip');

  const isZZ = mode === 'zipzip';
  treeModeLabel.textContent = isZZ ? 'Zip-Zip Tree' : 'Zip Tree';

  // Show/hide the rank-group legend
  document.getElementById('zipzip-legend').style.display = isZZ ? 'block' : 'none';

  // Update mode hint under tree toggle
  document.getElementById('tree-mode-hint').textContent = isZZ
    ? 'Rank pair (r1,r2) · Gila et al.'
    : 'Geometric rank · Tarjan et al.';

  // Update the manual rank hint
  rankInputLabel.textContent = isZZ ? 'RANK (r1, r2)' : 'RANK';
  rankHint.textContent = isZZ
    ? 'Enter r1,r2 e.g. "2,15"'
    : 'Integer 0–20';

  // Clear tree on mode switch — ranks are incompatible
  if (root) {
    root = null;
    nodeCount = 0;
    addLog(`Switched to ${isZZ ? 'Zip-Zip' : 'Zip'} mode — tree cleared`, 'info');
  }
  render();
}

// ─── Rank input mode ──────────────────────────────────────────────────────────

function setRankMode(mode) {
  rankMode = mode;
  btnRandom.classList.toggle('active', mode === 'random');
  btnManual.classList.toggle('active', mode === 'manual');
  rankRow.style.display = mode === 'manual' ? 'block' : 'none';
}

// ─── Pan & zoom ───────────────────────────────────────────────────────────────

const canvasEl = document.getElementById('tree-canvas');

canvasEl.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  dragging  = true;
  dragStart = { x: e.clientX - offset.x, y: e.clientY - offset.y };
});
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  offset = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
  render();
});
window.addEventListener('mouseup', () => { dragging = false; });

canvasEl.addEventListener('wheel', e => {
  e.preventDefault();
  zoom = Math.min(3, Math.max(0.2, zoom * (1 - e.deltaY * 0.0012)));
  render();
}, { passive: false });

// ─── Event wiring ─────────────────────────────────────────────────────────────

btnRandom.addEventListener('click', () => setRankMode('random'));
btnManual.addEventListener('click', () => setRankMode('manual'));
btnZip.addEventListener('click',    () => setTreeMode('zip'));
btnZipZip.addEventListener('click', () => setTreeMode('zipzip'));

btnInsert.addEventListener('click', doInsert);
btnDelete.addEventListener('click', doDelete);
keyInput.addEventListener('keydown', e => { if (e.key === 'Enter') doInsert(); });
btnExample.addEventListener('click', loadExample);
btnClear.addEventListener('click', () => {
  root      = null;
  nodeCount = 0;
  pendingDel = null;
  newKey     = null;
  addLog('Tree cleared', 'info');
  render();
});

// ─── Init ─────────────────────────────────────────────────────────────────────

setRankMode('random');
setTreeMode('zip');
render();