import { useMemo } from 'react';
import {
  buildClusterNetwork,
  curvedEdgePath,
  type NetworkGraph,
} from './clusterNetworkGraph';

const VIEW_W = 1000;
const VIEW_H = 1000;

type ClusterNetworkBackgroundProps = {
  className?: string;
};

/**
 * Clustered person-style network graph for login hero (matches mobile auth background).
 */
export function ClusterNetworkBackground({ className = '' }: ClusterNetworkBackgroundProps) {
  const graph = useMemo(() => buildClusterNetwork(VIEW_W, VIEW_H), []);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`.trim()} aria-hidden>
      <svg
        className="h-full w-full"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="login-net-glow" cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={VIEW_W} height={VIEW_H} fill="url(#login-net-glow)" />
        <NetworkEdges graph={graph} />
        <NetworkNodes graph={graph} />
      </svg>
    </div>
  );
}

function NetworkEdges({ graph }: { graph: NetworkGraph }) {
  return (
    <g fill="none">
      {graph.edges.map((edge, i) => {
        const a = graph.nodes[edge.from];
        const b = graph.nodes[edge.to];
        const d = curvedEdgePath(a.x, a.y, b.x, b.y, edge.isBridge, i % 2 === 0);
        return (
          <path
            key={`e-${i}`}
            d={d}
            stroke={edge.isBridge ? 'rgba(34, 211, 238, 0.22)' : 'rgba(56, 189, 248, 0.3)'}
            strokeWidth={edge.isBridge ? 0.75 : 0.95}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

function NetworkNodes({ graph }: { graph: NetworkGraph }) {
  return (
    <g>
      {graph.nodes.map((node, i) =>
        node.isHub ? (
          <g key={`n-${i}`}>
            <circle cx={node.x} cy={node.y} r={node.r + 5} fill="rgba(125, 211, 252, 0.18)" />
            <circle cx={node.x} cy={node.y} r={node.r} fill="rgba(125, 211, 252, 0.7)" />
            <circle
              cx={node.x}
              cy={node.y}
              r={node.r * 0.45}
              fill="rgba(255, 255, 255, 0.85)"
            />
          </g>
        ) : (
          <g key={`n-${i}`}>
            <circle cx={node.x} cy={node.y} r={node.r + 3} fill="rgba(56, 189, 248, 0.15)" />
            <circle cx={node.x} cy={node.y} r={node.r} fill="rgba(56, 189, 248, 0.55)" />
          </g>
        )
      )}
    </g>
  );
}
