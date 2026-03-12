// app.js
import {
    geometricRank, insertNode, deleteNode, findNode,
    treeHeight, flattenNodes, layoutTree, buildEdges
  } from './ziptree.js';
  
  // ─── State ────────────────────────────────────────────────────────────────────
  
  let root = null;
  let rankMode = 'random';   // 'random' | 'manual'
  let offset = { x: 0, y: 0 };
  let zoom = 1;
  let dragging = false;
  let dragStart = null;
  let pendingDel = null;          // key being deleted (pre-removal)
  let newKey = null;              // key just inserted (pop-in)
  
  // ─── DOM refs ─────────────────────────────────────────────────────────────────
  
  const keyInput     = document.getElementById('key-input');
  const rankInput    = document.getElementById('rank-input');
  const rankRow      = document.getElementById('rank-manual-row');
  const btnRandom    = document.getElementById('btn-mode-random');
  const btnManual    = document.getElementById('btn-mode-manual');
  const btnInsert    = document.getElementById('btn-insert');
  const btnDelete    = document.getElementById('btn-delete');
  const btnExample   = document.getElementById('btn-example');
  const btnClear     = document.getElementById('btn-clear');
  const svgEl        = document.getElementById('tree-svg');
  const logPanel     = document.getElementById('log-panel');
  
  const statNodes    = document.getElementById('stat-nodes');
  const statHeight   = document.getElementById('stat-height');
  const statRoot     = document.getElementById('stat-root');
  const statMaxRank  = document.getElementById('stat-maxrank');
  
  // ─── Colors ───────────────────────────────────────────────────────────────────
  
  const RANK_COLORS = ['#2d9e5f','#3b72d4','#9055d4','#c94a9a','#d94040','#c07a10','#1a9e9e','#6a9e1a','#4a7ab4','#a04040'];
  const rankColor = r => RANK_COLORS[r % RANK_COLORS.length];
  
  // ─── Render ───────────────────────────────────────────────────────────────────
  
  function render() {
    const nodes = flattenNodes(root);  
    // Stats
    statNodes.textContent   = nodes.length;
    statHeight.textContent  = root ? treeHeight(root) : 0;
    statRoot.textContent    = root ? `${root.key} (r=${root.rank})` : '—';
    statMaxRank.textContent = nodes.length ? Math.max(...nodes.map(n => n.rank)) : '—';
  
    // Build layout
    const { positions, minX, R } = root
      ? layoutTree(root)
      : { positions: {}, minX: 0, R: 26 };
    const edges = root ? buildEdges(root, positions) : [];
    const tx = -minX + 70;
  
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
    const g = svg('g', { transform: `translate(${offset.x + 80}, ${offset.y + 46}) scale(${zoom})` });
    const inner = svg('g', { transform: `translate(${tx}, 0)` });
  
    // Edges
    for (const e of edges) {
      const f = positions[e.from], t = positions[e.to];
      if (!f || !t) continue;
      inner.appendChild(svg('line', {
        x1: f.x, y1: f.y, x2: t.x, y2: t.y,
        stroke: '#d0d0c4', 'stroke-width': '1.5',
      }));
    }
  
    // Nodes
    for (const n of nodes) {
      const p = positions[n.key];
      if (!p) continue;
      const c = rankColor(n.rank);
      const isDel = pendingDel === n.key;
      const isNew = newKey === n.key;
  
      const cls = isDel ? 'node-del' : isNew ? 'node-new' : '';
  
      const group = svg('g', {
        transform: `translate(${p.x}, ${p.y})`,
        class: cls,
        style: 'cursor: pointer;',
      });
  
      // Outer ring (subtle)
      group.appendChild(svg('circle', {
        r: R + 3, fill: 'none', stroke: c, 'stroke-width': '.5', opacity: '.2'
      }));
      // Body
      group.appendChild(svg('circle', {
        r: R, fill: `${c}18`, stroke: c,
        'stroke-width': '1.5',
      }));
      // Key label
      const keyText = svgText(n.key, {
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        dy: '-4', 'font-size': n.key.length > 2 ? '9' : '13',
        'font-weight': '600', fill: c,
      });
      group.appendChild(keyText);
      // Rank label
      const rankText = svgText(`r=${n.rank}`, {
        'text-anchor': 'middle', 'dominant-baseline': 'middle',
        dy: '10', 'font-size': '8.5',
        fill: c, opacity: '.6',
      });
      group.appendChild(rankText);
  
      // Click to select
      group.addEventListener('click', () => {
        keyInput.value = n.key;
      });
  
      inner.appendChild(group);
    }
  
    g.appendChild(inner);
    svgEl.appendChild(g);
  }
  
  // ─── Helpers ──────────────────────────────────────────────────────────────────
  
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
  
  function addLog(msg, type = 'info') {
    const entry = document.createElement('div');
    entry.className = `log-entry log-${type}`;
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = type === 'insert' ? '↑' : type === 'delete' ? '↓' : type === 'error' ? '✕' : '·';
    const text = document.createElement('span');
    text.textContent = msg;
    entry.appendChild(icon);
    entry.appendChild(text);
    logPanel.insertBefore(entry, logPanel.children[1]); // after title
    // trim
    while (logPanel.children.length > 41) logPanel.removeChild(logPanel.lastChild);
  }
  
  // ─── Operations ───────────────────────────────────────────────────────────────
  
  function doInsert() {
    const key = keyInput.value.trim();
    if (!key) return addLog('Enter a key', 'warn');
    if (findNode(root, key)) return addLog(`"${key}" already exists`, 'error');
  
    let rank;
    if (rankMode === 'manual') {
      rank = parseInt(rankInput.value, 10);
      if (isNaN(rank)){
        rank = 0;
      }
      else if (rank < 0 || rank > 20){
        return addLog('Rank must be an integer 0–20', 'error');
      }
        
    } else {
      rank = geometricRank();
    }
  
    const node = { key, rank, left: null, right: null };
    root = insertNode(root, node);
    newKey = key;
    setTimeout(() => { newKey = null; render(); }, 600);
    addLog(`insert("${key}",  rank = ${rank})`, 'insert');
    keyInput.value = '';
    rankInput.value = '';
  }
  
  function doDelete() {
    const key = keyInput.value.trim();
    if (!key) return addLog('Enter a key', 'warn');
    if (!findNode(root, key)) return addLog(`"${key}" not found`, 'error');
  
    pendingDel = key;
    addLog(`delete("${key}")`, 'delete');
    setTimeout(() => {
      root = deleteNode(root, key);
      pendingDel = null;
      render();
    }, 400);
    keyInput.value = '';
  }
  
  function loadExample() {
    const items = [
      {key:'F',rank:4},{key:'S',rank:4},{key:'D',rank:2},{key:'H',rank:2},
      {key:'X',rank:2},{key:'M',rank:2},{key:'G',rank:0},{key:'J',rank:0},{key:'L',rank:1},
    ];
    root = null;
    for (const n of items) root = insertNode(root, { ...n, left: null, right: null });
    addLog('Loaded Figure 1 (Tarjan et al. 2022)', 'info');
    render();
  }
  
  // pan and zoom
  const canvasEl = document.getElementById('tree-canvas');
  
  canvasEl.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    dragging = true;
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
  
  // rank mode
  function setRankMode(mode) {
    rankMode = mode;
    btnRandom.classList.toggle('active', mode === 'random');
    btnManual.classList.toggle('active', mode === 'manual');
    rankRow.style.display = mode === 'manual' ? 'block' : 'none';
  }
  
  btnRandom.addEventListener('click', () => setRankMode('random'));
  btnManual.addEventListener('click', () => setRankMode('manual'));
  
  // insert/delete click listeners
  btnInsert.addEventListener('click', doInsert);
  btnDelete.addEventListener('click', doDelete);
  // insert if pressed enter
  keyInput.addEventListener('keydown', e => { if (e.key === 'Enter') doInsert(); });
  btnExample.addEventListener('click', loadExample);
  btnClear.addEventListener('click', () => {
    root = null;
    pendingDel = null;
    newKey = null;
    addLog('Tree cleared', 'info');
    render();
  });
  
  // ─── Init ─────────────────────────────────────────────────────────────────────
  
  setRankMode('random');
  render();
  