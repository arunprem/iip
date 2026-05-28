/** Port of mobile `ai_network_background.dart` cluster layout (normalized 0–1 coords). */

export type ClusterSeed = {
  nx: number;
  ny: number;
  satellites: number;
  spread: number;
  randomSeed: number;
};

export const CLUSTER_SEEDS: ClusterSeed[] = [
  { nx: 0.18, ny: 0.26, satellites: 7, spread: 0.13, randomSeed: 11 },
  { nx: 0.78, ny: 0.2, satellites: 6, spread: 0.11, randomSeed: 23 },
  { nx: 0.52, ny: 0.4, satellites: 8, spread: 0.13, randomSeed: 37 },
  { nx: 0.32, ny: 0.58, satellites: 5, spread: 0.09, randomSeed: 51 },
  { nx: 0.84, ny: 0.52, satellites: 5, spread: 0.09, randomSeed: 67 },
  { nx: 0.14, ny: 0.78, satellites: 5, spread: 0.08, randomSeed: 79 },
  { nx: 0.5, ny: 0.86, satellites: 6, spread: 0.09, randomSeed: 91 },
  { nx: 0.86, ny: 0.8, satellites: 5, spread: 0.08, randomSeed: 103 },
];

export type GraphNode = {
  x: number;
  y: number;
  r: number;
  isHub: boolean;
};

export type GraphEdge = {
  from: number;
  to: number;
  isBridge: boolean;
};

export type NetworkGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

/** Dart-compatible LCG for matching satellite positions. */
function createRng(seed: number) {
  let state = seed & 0x7fffffff;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

export function buildClusterNetwork(width: number, height: number): NetworkGraph {
  const nodes: GraphNode[] = [];
  const clusterStart: number[] = [];
  const hubIndices: number[] = [];

  for (let c = 0; c < CLUSTER_SEEDS.length; c++) {
    clusterStart.push(nodes.length);
    const seed = CLUSTER_SEEDS[c];
    const rng = createRng(seed.randomSeed);
    const centerX = seed.nx * width;
    const centerY = seed.ny * height;
    const spread = seed.spread * width;

    hubIndices.push(nodes.length);
    nodes.push({ x: centerX, y: centerY, r: 4.2, isHub: true });

    for (let i = 0; i < seed.satellites; i++) {
      const angle = (2 * Math.PI * i) / seed.satellites + rng() * 0.5;
      const dist = spread * (0.38 + rng() * 0.5);
      nodes.push({
        x: centerX + Math.cos(angle) * dist,
        y: centerY + Math.sin(angle) * dist,
        r: 2 + rng() * 1,
        isHub: false,
      });
    }
  }

  const edges: GraphEdge[] = [];

  for (let c = 0; c < CLUSTER_SEEDS.length; c++) {
    const start = clusterStart[c];
    const hub = start;
    const count = 1 + CLUSTER_SEEDS[c].satellites;

    for (let i = 1; i < count; i++) {
      edges.push({ from: hub, to: start + i, isBridge: false });
      if (i < count - 1) {
        edges.push({ from: start + i, to: start + i + 1, isBridge: false });
      } else if (count > 2) {
        edges.push({ from: start + i, to: start + 1, isBridge: false });
      }
    }
  }

  for (let i = 0; i < hubIndices.length; i++) {
    const next = (i + 1) % hubIndices.length;
    edges.push({ from: hubIndices[i], to: hubIndices[next], isBridge: true });
  }

  edges.push({ from: hubIndices[0], to: hubIndices[2], isBridge: true });
  edges.push({ from: hubIndices[1], to: hubIndices[4], isBridge: true });

  if (hubIndices.length >= 8) {
    edges.push({ from: hubIndices[2], to: hubIndices[6], isBridge: true });
    edges.push({ from: hubIndices[3], to: hubIndices[5], isBridge: true });
    edges.push({ from: hubIndices[4], to: hubIndices[7], isBridge: true });
    edges.push({ from: hubIndices[5], to: hubIndices[6], isBridge: true });
    edges.push({ from: hubIndices[6], to: hubIndices[7], isBridge: true });
  }

  const bridgePairs: [number, number][] = [];
  if (clusterStart[0] + 2 < nodes.length) bridgePairs.push([clusterStart[0] + 2, hubIndices[2]]);
  if (clusterStart[3] + 1 < nodes.length) bridgePairs.push([clusterStart[3] + 1, hubIndices[1]]);
  if (hubIndices.length > 5) bridgePairs.push([hubIndices[5], hubIndices[2]]);
  if (hubIndices.length > 6) bridgePairs.push([hubIndices[6], hubIndices[4]]);

  for (const [from, to] of bridgePairs) {
    edges.push({ from, to, isBridge: true });
  }

  return { nodes, edges };
}

export function curvedEdgePath(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  longBridge: boolean,
  flip: boolean
): string {
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return `M ${ax} ${ay} L ${bx} ${by}`;

  const nx = -dy / len;
  const ny = dx / len;
  const bendFactor = longBridge ? 0.14 : 0.1;
  const bend = len * bendFactor * (flip ? 1 : -1);
  const cx = midX + nx * bend;
  const cy = midY + ny * bend;
  return `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
}
