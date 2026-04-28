// ziptree.js — Zip Tree + Zip-Zip Tree core
// Zip Tree: Tarjan, Levy, Timmel 2021
// Zip-Zip Tree: Gila, Goodrich, Tarjan 2024

// ─── Rank generation ─────────────────────────────────────────────────────────

export function geometricRank() {
  let k = 0;
  while (Math.random() < 0.5) k++;
  return k;
}

// Zip-zip rank: pair (r1, r2) where r1 ~ Geometric(1/2), r2 ~ Uniform[1, log^c(n)]
// We use a fixed secondary range of 1..64 (sufficient for trees up to ~2^64 nodes).
// In the visualizer we keep c=3, range = max(1, floor(log2(n)^3)) but cap at 1024.
export function zipZipRank(n = 16) {
  const r1 = geometricRank();
  const logn = Math.max(2, Math.log2(Math.max(n, 2)));
  const range = Math.max(1, Math.floor(logn * logn * logn)); // log^3(n)
  const r2 = Math.floor(Math.random() * range) + 1;
  return { r1, r2 };
}

// ─── Rank comparison ─────────────────────────────────────────────────────────

// For regular zip trees: rank is a plain number.
// For zip-zip trees: rank is {r1, r2}; compared lexicographically.
// Returns >0 if a > b, <0 if a < b, 0 if equal.
export function rankCmp(a, b) {
  if (typeof a === 'number') return a - b;
  // Zip-zip: lexicographic on (r1, r2)
  if (a.r1 !== b.r1) return a.r1 - b.r1;
  return a.r2 - b.r2;
}

export function rankLabel(rank) {
  if (typeof rank === 'number') return `r=${rank}`;
  return `(${rank.r1},${rank.r2})`;
}

// For coloring nodes by primary rank (r1 or rank itself)
export function primaryRank(rank) {
  return typeof rank === 'number' ? rank : rank.r1;
}

// ─── Key comparison ───────────────────────────────────────────────────────────

function cmp(a, b) {
  const na = Number(a), nb = Number(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

// ─── Zip-Zip tie-breaking ────────────────────────────────────────────────────
// The zip-zip paper uses the same tie-breaking as zip trees (smaller key wins)
// but only after both r1 and r2 are compared. We encode this in rankCmp above.
// When rankCmp returns 0 (extremely rare), we fall back to smaller key wins,
// matching the original zip tree tie-breaking rule.

// Combined comparator: returns positive if x should be ABOVE cur (x displaces cur).
// For left path (x.key < cur.key): x displaces if x.rank >= cur.rank (non-strict).
// For right path (x.key > cur.key): x displaces if x.rank > cur.rank (strict).
function displaces(xRank, curRank, xKeyLtCurKey) {
  const d = rankCmp(xRank, curRank);
  return xKeyLtCurKey ? d >= 0 : d > 0;
}

// ─── Unzip ────────────────────────────────────────────────────────────────────

function unzip(node, xkey) {
  if (!node) return [null, null];
  if (cmp(node.key, xkey) < 0) {
    const [p, q] = unzip(node.right, xkey);
    return [{ ...node, right: p }, q];
  } else {
    const [p, q] = unzip(node.left, xkey);
    return [p, { ...node, left: q }];
  }
}

// ─── Insert ───────────────────────────────────────────────────────────────────

export function insertNode(root, x) {
  x = { ...x, left: null, right: null };

  function ins(cur) {
    if (!cur) return x;
    const goLeft = cmp(x.key, cur.key) < 0;
    if (displaces(x.rank, cur.rank, goLeft)) {
      const [p, q] = unzip(cur, x.key);
      x.left = p; x.right = q;
      return x;
    }
    if (goLeft) return { ...cur, left: ins(cur.left) };
    return { ...cur, right: ins(cur.right) };
  }
  return ins(root);
}

// ─── Zip ──────────────────────────────────────────────────────────────────────

function zip(x, y) {
  if (!x) return y;
  if (!y) return x;
  // Tie → smaller key (x, which is the left/P path) wins — matches zip tree rule.
  if (rankCmp(x.rank, y.rank) >= 0) return { ...x, right: zip(x.right, y) };
  return { ...y, left: zip(x, y.left) };
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function deleteNode(root, key) {
  function del(cur) {
    if (!cur) return null;
    const c = cmp(key, cur.key);
    if (c === 0) return zip(cur.left, cur.right);
    if (c < 0) return { ...cur, left: del(cur.left) };
    return { ...cur, right: del(cur.right) };
  }
  return del(root);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function findNode(root, key) {
  if (!root) return null;
  const c = cmp(key, root.key);
  if (c === 0) return root;
  return c < 0 ? findNode(root.left, key) : findNode(root.right, key);
}

export function treeHeight(root) {
  if (!root) return 0;
  return 1 + Math.max(treeHeight(root.left), treeHeight(root.right));
}

export function flattenNodes(root, out = []) {
  if (!root) return out;
  flattenNodes(root.left, out);
  out.push(root);
  flattenNodes(root.right, out);
  return out;
}

// In-order index layout → evenly spaced x positions
export function layoutTree(root) {
  const positions = {};
  let counter = 0;
  const H = 60, V = 80, R = 26;

  function idx(node) {
    if (!node) return;
    idx(node.left);
    node._i = counter++;
    idx(node.right);
  }
  idx(root);

  function assign(node, depth) {
    if (!node) return;
    assign(node.left, depth + 1);
    assign(node.right, depth + 1);
    positions[node.key] = { x: node._i * H, y: depth * V + R * 2 };
  }
  assign(root, 0);

  const xs = Object.values(positions).map(p => p.x);
  return { positions, minX: xs.length ? Math.min(...xs) : 0, R };
}

export function buildEdges(root, positions) {
  const edges = [];
  function go(node) {
    if (!node) return;
    if (node.left  && positions[node.left.key])  edges.push({ from: node.key, to: node.left.key });
    if (node.right && positions[node.right.key]) edges.push({ from: node.key, to: node.right.key });
    go(node.left);
    go(node.right);
  }
  go(root);
  return edges;
}

// ─── Zip-Zip: r1-rank group detection ────────────────────────────────────────
// Returns a Set of keys that share the same r1-rank as the given node
// and form a connected subtree (the r1-rank group as defined in the paper).
export function getRankGroups(root) {
  // Map from r1-rank → array of keys in that group
  const groups = new Map();
  function walk(node) {
    if (!node) return;
    const r1 = primaryRank(node.rank);
    if (!groups.has(r1)) groups.set(r1, []);
    groups.get(r1).push(node.key);
    walk(node.left);
    walk(node.right);
  }
  walk(root);
  return groups;
}