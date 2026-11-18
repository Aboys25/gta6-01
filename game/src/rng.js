// Seeded random streams for Solmarina: deterministic world generation.
// Every generator takes its own stream so adding a feature never reshuffles
// an earlier one. Runtime gameplay may use Math.random; world layout never does.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeStreams(seed) {
  return {
    buildings: mulberry32(seed * 101 + 11),
    props: mulberry32(seed * 211 + 23),
    traffic: mulberry32(seed * 307 + 37),
    peds: mulberry32(seed * 401 + 41),
    palette: mulberry32(seed * 503 + 53),
  };
}

export function pick(rng, list) { return list[Math.floor(rng() * list.length) % list.length]; }
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function rangeInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
export function chance(rng, p) { return rng() < p; }
