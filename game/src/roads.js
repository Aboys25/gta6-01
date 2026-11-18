// Road graph for Solmarina: a grid of avenues (x) and streets (z), the single
// source of truth for traffic, police, missions, the minimap and collisions.
// Blocks are the rectangles between roads; buildings and props live inside them.
export const AVENUES = [-270, -180, -90, 0, 90, 180, 270];
export const STREETS = [-180, -120, -60, 0, 60, 120, 180];
export const ROAD_HALF = 7;          // half the drivable width of a road
export const BLOCK_PAD = 11;         // sidewalk width around each block
export const WORLD = { minX: -330, maxX: 330, minZ: -240, maxZ: 300 };
export const BEACH_Z = 216;          // south of this: sand, then sea
export const SEA_Z = 252;

export const NODES = [];
for (const z of STREETS) for (const x of AVENUES) NODES.push({ x, z });
export function nodeIndex(ix, iz) { return iz * AVENUES.length + ix; }
export function nodeAt(ix, iz) { return NODES[nodeIndex(ix, iz)]; }

// Adjacent node indices (grid neighbours) for BFS routing.
export function neighbours(idx) {
  const ix = idx % AVENUES.length, iz = Math.floor(idx / AVENUES.length);
  const out = [];
  if (ix > 0) out.push(idx - 1);
  if (ix < AVENUES.length - 1) out.push(idx + 1);
  if (iz > 0) out.push(idx - AVENUES.length);
  if (iz < STREETS.length - 1) out.push(idx + AVENUES.length);
  return out;
}

// Shortest path (node index list) between two nodes, BFS on a 7x7 grid.
export function findPath(fromIdx, toIdx) {
  if (fromIdx === toIdx) return [fromIdx];
  const prev = new Int16Array(NODES.length).fill(-1);
  const queue = [fromIdx]; prev[fromIdx] = fromIdx;
  while (queue.length) {
    const cur = queue.shift();
    for (const n of neighbours(cur)) {
      if (prev[n] !== -1) continue;
      prev[n] = cur;
      if (n === toIdx) {
        const path = [n]; let c = n;
        while (c !== fromIdx) { c = prev[c]; path.unshift(c); }
        return path;
      }
      queue.push(n);
    }
  }
  return [fromIdx, toIdx];
}

export function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    const dx = NODES[i].x - x, dz = NODES[i].z - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Closest point on any road centreline, and which road it sits on.
export function snapToRoad(x, z) {
  let best = { x, z, d: Infinity, along: 'x', line: 0 };
  for (const ax of AVENUES) {
    const d = Math.abs(x - ax);
    if (d < best.d) best = { x: ax, z: Math.max(STREETS[0], Math.min(STREETS[STREETS.length - 1], z)), d, along: 'z', line: ax };
  }
  for (const sz of STREETS) {
    const d = Math.abs(z - sz);
    if (d < best.d) best = { x: Math.max(AVENUES[0], Math.min(AVENUES[AVENUES.length - 1], x)), z: sz, d, along: 'x', line: sz };
  }
  return best;
}

export function onRoad(x, z, margin = ROAD_HALF) {
  return snapToRoad(x, z).d <= margin;
}

// Buildable blocks: rectangles between neighbouring avenues/streets.
export function buildBlocks() {
  const blocks = [];
  for (let iz = 0; iz < STREETS.length - 1; iz++) {
    for (let ix = 0; ix < AVENUES.length - 1; ix++) {
      const x0 = AVENUES[ix] + BLOCK_PAD, x1 = AVENUES[ix + 1] - BLOCK_PAD;
      const z0 = STREETS[iz] + BLOCK_PAD, z1 = STREETS[iz + 1] - BLOCK_PAD;
      blocks.push({ x0, x1, z0, z1, ix, iz, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 });
    }
  }
  return blocks;
}

// The central park occupies the middle block; the marina occupies the south row.
export function isParkBlock(b) { return b.ix === 3 && b.iz === 3; }
export function isMarinaBlock(b) { return b.iz === STREETS.length - 2; }

// Axis-aligned collision: true when point (with radius r) is inside a block rect.
export function insideBlock(blocks, x, z, r) {
  for (const b of blocks) {
    if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return b;
  }
  return null;
}
