// ziptree.js — Zip Tree core (Tarjan, Levy, Timmel 2022)

export function geometricRank() {
    let k = 0;
    while (Math.random() < 0.5) k++;
    return k;
  }
  
  // Compare keys: numeric if both parse as numbers, lexicographic otherwise.
  // Returns negative, zero, or positive.
  function cmp(a, b) {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  
  // Unzip: split subtree rooted at `node` into two paths by xkey.
  // Returns [P, Q] where P has all keys < xkey, Q has all keys > xkey.
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
  
  // Insert x into tree. Walks down to find where x displaces a node
  // (rank tie-breaking: strict for left path, non-strict for right path),
  // then unzips the subtree there into x.left and x.right.
  export function insertNode(root, x) {
    x = { ...x, left: null, right: null };
  
    function ins(cur) {
      if (!cur) return x;
      if (cmp(x.key, cur.key) < 0) {
        if (x.rank >= cur.rank) {
          const [p, q] = unzip(cur, x.key);
          x.left = p; x.right = q;
          return x;
        }
        return { ...cur, left: ins(cur.left) };
      } else {
        if (x.rank > cur.rank) {
          const [p, q] = unzip(cur, x.key);
          x.left = p; x.right = q;
          return x;
        }
        return { ...cur, right: ins(cur.right) };
      }
    }
    return ins(root);
  }
  
  // Zip: merge two paths in non-increasing rank order; ties → smaller key (P) wins.
  function zip(x, y) {
    if (!x) return y;
    if (!y) return x;
    if (x.rank >= y.rank) return { ...x, right: zip(x.right, y) };
    return { ...y, left: zip(x, y.left) };
  }
  
  // Delete: find node, then zip its left and right subtrees.
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
  