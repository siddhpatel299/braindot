// Simple force-directed graph layout simulation
// Runs a few iterations of repulsion + attraction to produce node positions.

export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isCurrent?: boolean;
  degree: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface LayoutResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Run a force-directed layout.
 * @param nodeIds array of node ids
 * @param edges array of {from, to}
 * @param currentId which node is the "current" one (gets bigger + centered)
 * @param width canvas width
 * @param height canvas height
 * @param iterations number of simulation steps (default 300)
 */
export function forceDirectedLayout(
  nodeIds: string[],
  edges: GraphEdge[],
  currentId: string | null,
  width: number,
  height: number,
  iterations: number = 300,
): LayoutResult {
  // Compute degree for each node
  const degree = new Map<string, number>();
  for (const id of nodeIds) degree.set(id, 0);
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1);
    degree.set(e.to, (degree.get(e.to) || 0) + 1);
  }

  // Initialize nodes in a rough circle, with current node at center
  const cx = width / 2;
  const cy = height / 2;
  const nodes: GraphNode[] = nodeIds.map((id, i) => {
    const angle = (i / Math.max(nodeIds.length, 1)) * Math.PI * 2;
    const r = Math.min(width, height) * 0.35;
    return {
      id,
      label: id,
      x: cx + Math.cos(angle) * r + (Math.random() - 0.5) * 20,
      y: cy + Math.sin(angle) * r + (Math.random() - 0.5) * 20,
      vx: 0,
      vy: 0,
      radius: 4 + Math.min((degree.get(id) || 0) * 1.5, 8),
      isCurrent: id === currentId,
      degree: degree.get(id) || 0,
    };
  });

  // If there's a current node, put it at center
  if (currentId) {
    const cur = nodes.find((n) => n.id === currentId);
    if (cur) {
      cur.x = cx;
      cur.y = cy;
    }
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Simulation
  const k = Math.sqrt((width * height) / Math.max(nodes.length, 1)) * 0.4; // ideal distance
  const repulsion = k * k * 2;
  const attraction = 1 / k;
  const damping = 0.85;
  const centerGravity = 0.01;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 1) dist = 1;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Attraction along edges
    for (const e of edges) {
      const a = nodeMap.get(e.from);
      const b = nodeMap.get(e.to);
      if (!a || !b) continue;
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      let dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) dist = 1;
      const force = attraction * dist;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }

    // Center gravity + apply velocity + damping + bounds
    for (const n of nodes) {
      // Pull toward center
      n.vx += (cx - n.x) * centerGravity;
      n.vy += (cy - n.y) * centerGravity;

      // Don't move the current node (keep it centered)
      if (n.isCurrent) {
        n.vx = 0;
        n.vy = 0;
        n.x = cx;
        n.y = cy;
        continue;
      }

      n.x += n.vx * 0.1;
      n.y += n.vy * 0.1;
      n.vx *= damping;
      n.vy *= damping;

      // Bounds
      const pad = n.radius + 5;
      if (n.x < pad) { n.x = pad; n.vx *= -0.5; }
      if (n.x > width - pad) { n.x = width - pad; n.vx *= -0.5; }
      if (n.y < pad) { n.y = pad; n.vy *= -0.5; }
      if (n.y > height - pad) { n.y = height - pad; n.vy *= -0.5; }
    }
  }

  return { nodes, edges };
}
