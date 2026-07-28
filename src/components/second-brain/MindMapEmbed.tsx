'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { MindMapBlock, MindMapNode } from '@/types';
import { Network, Maximize2, Pencil, X, Plus, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { generateNodeId } from '@/utils/embeds';

interface MindMapEmbedProps {
  block: MindMapBlock;
  onUpdate: (block: MindMapBlock) => void;
  onRemove: () => void;
  onOpenNoteByTitle?: (title: string) => void;
}

export function MindMapEmbed({ block, onUpdate, onRemove, onOpenNoteByTitle }: MindMapEmbedProps) {
  const [editMode, setEditMode] = useState(false);
  const [showExpandModal, setShowExpandModal] = useState(false);

  const handleRemove = () => {
    if (confirm('Remove this mind map from the note?')) {
      onRemove();
    }
  };

  const handleAddNode = (parentId: string) => {
    const parent = block.nodes.find((n) => n.id === parentId);
    if (!parent) return;
    const newNode: MindMapNode = {
      id: generateNodeId(),
      label: 'New node',
      x: parent.x + (Math.random() - 0.5) * 80,
      y: parent.y + 60,
      parentId,
    };
    onUpdate({
      ...block,
      nodes: [...block.nodes, newNode],
    });
  };

  const handleRenameNode = (nodeId: string, label: string) => {
    onUpdate({
      ...block,
      nodes: block.nodes.map((n) => (n.id === nodeId ? { ...n, label } : n)),
    });
  };

  const handleMoveNode = (nodeId: string, x: number, y: number) => {
    onUpdate({
      ...block,
      nodes: block.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
    });
  };

  const handleDeleteNode = (nodeId: string) => {
    // Don't allow deleting the root node
    if (nodeId === block.nodes.find((n) => n.parentId === null)?.id) return;
    // Also delete children
    const toDelete = new Set<string>([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of block.nodes) {
        if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
          toDelete.add(n.id);
          changed = true;
        }
      }
    }
    onUpdate({
      ...block,
      nodes: block.nodes.filter((n) => !toDelete.has(n.id)),
    });
  };

  return (
    <>
      <div style={{
        border: '1px solid var(--bd2)',
        borderRadius: 8,
        overflow: 'hidden',
        margin: '16px 0',
        background: 'var(--bg)',
      }}>
        {/* Header */}
        <div style={{
          height: 32,
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--bd)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Network size={12} color="var(--t3)" />
            <span style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--t3)',
              fontWeight: 600,
            }}>
              mind map — embedded
            </span>
            {editMode && (
              <span style={{
                fontSize: 9,
                color: 'var(--acc2)',
                marginLeft: 4,
              }}>
                (edit mode — click a node to rename, + to add child)
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            <HeaderButton icon={Maximize2} title="Expand" onClick={() => setShowExpandModal(true)} />
            <HeaderButton icon={Pencil} title="Edit" active={editMode} onClick={() => setEditMode(!editMode)} />
            <HeaderButton icon={X} title="Remove" onClick={handleRemove} />
          </div>
        </div>

        {/* Canvas with dotted background */}
        <MindMapCanvas
          block={block}
          editMode={editMode}
          height={block.height}
          onAddNode={handleAddNode}
          onRenameNode={handleRenameNode}
          onDeleteNode={handleDeleteNode}
          onMoveNode={handleMoveNode}
          onOpenNoteByTitle={onOpenNoteByTitle}
        />
      </div>

      {/* Expand modal */}
      {showExpandModal && (
        <MindMapModal
          block={block}
          onUpdate={onUpdate}
          onClose={() => setShowExpandModal(false)}
        />
      )}
    </>
  );
}

function HeaderButton({
  icon: Icon,
  title,
  onClick,
  active,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 22,
        height: 22,
        borderRadius: 3,
        background: active ? 'var(--acc-bg)' : 'transparent',
        border: '1px solid ' + (active ? 'var(--acc-bd)' : 'transparent'),
        color: active ? 'var(--acc2)' : 'var(--t3)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'var(--bg3)';
          e.currentTarget.style.color = 'var(--t1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--t3)';
        }
      }}
    >
      <Icon size={12} strokeWidth={1.75} />
    </button>
  );
}

function MindMapCanvas({
  block,
  editMode,
  height,
  zoom = 1,
  onAddNode,
  onRenameNode,
  onDeleteNode,
  onMoveNode,
  onOpenNoteByTitle,
}: {
  block: MindMapBlock;
  editMode: boolean;
  height: number;
  zoom?: number;
  onAddNode: (parentId: string) => void;
  onRenameNode: (nodeId: string, label: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onMoveNode: (nodeId: string, x: number, y: number) => void;
  onOpenNoteByTitle?: (title: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth;
        if (w > 0) setContainerWidth(w);
      }
    };
    // Use ResizeObserver for more reliable measurement
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    measure();
    // Also re-measure after a delay (for modal open animation)
    const timer = setTimeout(measure, 100);
    const timer2 = setTimeout(measure, 300);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      clearTimeout(timer);
      clearTimeout(timer2);
      window.removeEventListener('resize', measure);
    };
  }, []);

  const cx = Math.max(containerWidth / 2, 300);
  const cy = Math.max(height / 2, 150);

  // Auto-layout nodes radially if they're clustered too close together.
  // This spreads nodes out to fill the available canvas space.
  const autoLayout = useMemo(() => {
    if (block.nodes.length <= 1) return block.nodes;
    // Check if nodes are too clustered (max offset < 250)
    const maxOffset = Math.max(...block.nodes.map((n) => Math.max(Math.abs(n.x), Math.abs(n.y))));
    if (maxOffset >= 250) return block.nodes; // already spread out

    // Compute radial layout using actual canvas dimensions
    const root = block.nodes.find((n) => n.parentId === null);
    if (!root) return block.nodes;
    // Use width-based radius — guard against NaN/undefined
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const effectiveWidth = Math.max(containerWidth, winW * 0.7, 600);
    const radius = Math.max(effectiveWidth * 0.3, 150);
    const children = block.nodes.filter((n) => n.parentId !== null);
    const result = [root]; // root stays at 0,0
    children.forEach((child, i) => {
      const angle = (i / children.length) * Math.PI * 2 - Math.PI / 2;
      result.push({
        ...child,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    });
    return result;
  }, [block.nodes, containerWidth, height]);

  // Node positions are relative to center — guard against NaN
  const nodePos = (n: MindMapNode) => {
    const layoutNode = autoLayout.find((an) => an.id === n.id) || n;
    const x = cx + (isNaN(layoutNode.x) ? 0 : layoutNode.x);
    const y = cy + (isNaN(layoutNode.y) ? 0 : layoutNode.y);
    return { x: isNaN(x) ? 0 : x, y: isNaN(y) ? 0 : y };
  };

  const rootNode = block.nodes.find((n) => n.parentId === null);

  // Handle node mouse down — start dragging
  const handleNodeMouseDown = useCallback((node: MindMapNode, e: React.MouseEvent) => {
    if (renamingId === node.id) return; // don't drag while renaming
    e.stopPropagation();
    e.preventDefault();
    setDraggingNode(node.id);
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: node.x,
      nodeY: node.y,
    });
  }, [renamingId]);

  // Handle mouse move on SVG — update node position if dragging
  const handleSvgMouseMove = useCallback((e: React.MouseEvent) => {
    if (!draggingNode || !dragStart) return;
    const dx = (e.clientX - dragStart.mouseX);
    const dy = (e.clientY - dragStart.mouseY);
    onMoveNode(draggingNode, dragStart.nodeX + dx, dragStart.nodeY + dy);
  }, [draggingNode, dragStart, onMoveNode]);

  // Handle mouse up — stop dragging
  const handleSvgMouseUp = useCallback(() => {
    setDraggingNode(null);
    setDragStart(null);
  }, []);

  const handleClick = (node: MindMapNode) => {
    if (editMode) {
      if (renamingId === node.id) {
        setRenamingId(null);
      } else {
        setRenamingId(node.id);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        height,
        background: 'radial-gradient(circle, #1a1a1d 0.5px, transparent 0.5px) 0 0/16px 16px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height={height}
        style={{ display: 'block', transform: zoom !== 1 ? `scale(${zoom})` : undefined, transformOrigin: 'center center' }}
        onMouseMove={handleSvgMouseMove}
        onMouseUp={handleSvgMouseUp}
        onMouseLeave={handleSvgMouseUp}
      >
        {/* Connector lines */}
        {block.nodes.map((node) => {
          if (!node.parentId) return null;
          const parent = block.nodes.find((n) => n.id === node.parentId);
          if (!parent) return null;
          const p1 = nodePos(parent);
          const p2 = nodePos(node);
          // Skip if either position is invalid
          if (isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)) return null;
          const isMainBranch = parent.parentId === null;
          // Curved bezier path
          const midY = (p1.y + p2.y) / 2;
          const path = `M ${p1.x} ${p1.y} C ${p1.x} ${midY}, ${p2.x} ${midY}, ${p2.x} ${p2.y}`;
          return (
            <path
              key={`edge-${node.id}`}
              d={path}
              fill="none"
              stroke={isMainBranch ? 'var(--acc-bd)' : 'var(--bd)'}
              strokeWidth={isMainBranch ? 1.3 : 1}
              opacity={0.7}
            />
          );
        })}

        {/* Nodes */}
        {block.nodes.map((node) => {
          const pos = nodePos(node);
          // Skip rendering if position is invalid (prevents NaN SVG errors)
          if (isNaN(pos.x) || isNaN(pos.y)) return null;
          const isRoot = node.parentId === null;
          const isBranch = !isRoot && node.parentId === rootNode?.id;
          const w = isRoot ? 140 : isBranch ? 130 : 110;
          const h = isRoot ? 40 : isBranch ? 36 : 30;
          const fill = isRoot ? 'var(--acc-bg)' : isBranch ? 'var(--bg1)' : 'var(--bg)';
          const stroke = isRoot ? 'var(--acc)' : isBranch ? 'var(--acc-bd)' : 'var(--bd)';
          const textColor = isRoot ? 'var(--acc2)' : isBranch ? 'var(--t1)' : 'var(--t2)';
          const fontSize = isRoot ? 12 : isBranch ? 11 : 10;
          const fontWeight = isRoot ? 700 : isBranch ? 600 : 400;
          const isDragging = draggingNode === node.id;
          const isHovered = hoveredNode === node.id;

          return (
            <g
              key={node.id}
              style={{
                cursor: isDragging ? 'grabbing' : 'grab',
                opacity: isDragging ? 0.8 : 1,
              }}
              onMouseDown={(e) => handleNodeMouseDown(node, e)}
              onClick={() => handleClick(node)}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
            >
              {/* Hover/drag highlight */}
              {(isHovered || isDragging) && (
                <rect
                  x={pos.x - w / 2 - 3}
                  y={pos.y - h / 2 - 3}
                  width={w + 6}
                  height={h + 6}
                  rx={7}
                  ry={7}
                  fill="none"
                  stroke={isRoot ? 'var(--acc2)' : '#534AB7'}
                  strokeWidth={1}
                  opacity={0.4}
                />
              )}
              <rect
                x={pos.x - w / 2}
                y={pos.y - h / 2}
                width={w}
                height={h}
                rx={5}
                ry={5}
                fill={fill}
                stroke={isDragging ? 'var(--acc)' : stroke}
                strokeWidth={isRoot ? 1.5 : 1}
              />
              {renamingId === node.id ? (
                <foreignObject
                  x={pos.x - w / 2 + 4}
                  y={pos.y - h / 2 + 4}
                  width={w - 8}
                  height={h - 8}
                >
                  <input
                    autoFocus
                    defaultValue={node.label}
                    onBlur={(e) => {
                      onRenameNode(node.id, e.target.value);
                      setRenamingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onRenameNode(node.id, (e.target as HTMLInputElement).value);
                        setRenamingId(null);
                      }
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      height: '100%',
                      background: 'var(--bg3)',
                      border: '1px solid var(--acc)',
                      borderRadius: 3,
                      color: 'var(--t1)',
                      fontSize,
                      fontFamily: 'inherit',
                      fontWeight,
                      outline: 'none',
                      textAlign: 'center',
                      padding: 0,
                    }}
                  />
                </foreignObject>
              ) : (
                <text
                  x={pos.x}
                  y={pos.y + 4}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fill={textColor}
                  fontFamily="JetBrains Mono"
                  fontWeight={fontWeight}
                >
                  {node.label.length > 16 ? node.label.slice(0, 14) + '…' : node.label}
                </text>
              )}
              {/* Add child button in edit mode */}
              {editMode && (
                <g
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddNode(node.id);
                  }}
                >
                  <circle
                    cx={pos.x + w / 2 - 4}
                    cy={pos.y - h / 2 + 4}
                    r={7}
                    fill="var(--acc)"
                    opacity={0.8}
                  />
                  <text
                    x={pos.x + w / 2 - 4}
                    y={pos.y - h / 2 + 7}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#fff"
                    fontWeight={700}
                  >
                    +
                  </text>
                </g>
              )}
              {/* Delete button in edit mode (not for root) */}
              {editMode && !isRoot && (
                <g
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNode(node.id);
                  }}
                >
                  <circle
                    cx={pos.x - w / 2 + 4}
                    cy={pos.y - h / 2 + 4}
                    r={7}
                    fill="var(--red)"
                    opacity={0.8}
                  />
                  <text
                    x={pos.x - w / 2 + 4}
                    y={pos.y - h / 2 + 7}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#fff"
                    fontWeight={700}
                  >
                    ×
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------- Full-screen modal ---------- */

function MindMapModal({
  block,
  onUpdate,
  onClose,
}: {
  block: MindMapBlock;
  onUpdate: (block: MindMapBlock) => void;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [editMode, setEditMode] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const handleAddNode = (parentId: string) => {
    const parent = block.nodes.find((n) => n.id === parentId);
    if (!parent) return;
    const newNode: MindMapNode = {
      id: generateNodeId(),
      label: 'New node',
      x: parent.x + (Math.random() - 0.5) * 80,
      y: parent.y + 60,
      parentId,
    };
    onUpdate({ ...block, nodes: [...block.nodes, newNode] });
  };

  const handleRenameNode = (nodeId: string, label: string) => {
    onUpdate({ ...block, nodes: block.nodes.map((n) => (n.id === nodeId ? { ...n, label } : n)) });
  };

  const handleMoveNode = (nodeId: string, x: number, y: number) => {
    onUpdate({ ...block, nodes: block.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)) });
  };

  const handleDeleteNode = (nodeId: string) => {
    if (nodeId === block.nodes.find((n) => n.parentId === null)?.id) return;
    const toDelete = new Set<string>([nodeId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of block.nodes) {
        if (n.parentId && toDelete.has(n.parentId) && !toDelete.has(n.id)) {
          toDelete.add(n.id);
          changed = true;
        }
      }
    }
    onUpdate({ ...block, nodes: block.nodes.filter((n) => !toDelete.has(n.id)) });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Modal toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          height: 48,
          background: 'var(--bg1)',
          borderBottom: '1px solid var(--bd)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Network size={14} color="var(--acc2)" />
          <span style={{ fontSize: 13, color: 'var(--t1)', fontWeight: 600 }}>mind map — fullscreen</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Zoom controls */}
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
            style={modalBtnStyle}
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <span style={{ fontSize: 11, color: 'var(--t3)', minWidth: 40, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
            style={modalBtnStyle}
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => setZoom(1)}
            style={modalBtnStyle}
            title="Fit to screen"
          >
            <Maximize size={14} />
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--bd)', margin: '0 6px' }} />
          <button
            onClick={() => setEditMode(!editMode)}
            style={{
              ...modalBtnStyle,
              background: editMode ? 'var(--acc-bg)' : 'transparent',
              color: editMode ? 'var(--acc2)' : 'var(--t3)',
              border: editMode ? '1px solid var(--acc-bd)' : '1px solid var(--bd2)',
            }}
            title="Edit mode"
          >
            <Pencil size={14} />
          </button>
          <button onClick={onClose} style={modalBtnStyle} title="Close (Esc)">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Canvas — fills the entire modal below the toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          background: 'var(--bg2)',
          backgroundImage: 'radial-gradient(circle, #1a1a1d 0.5px, transparent 0.5px) 0 0/20px 20px',
          overflow: 'hidden',
          position: 'relative',
          minHeight: 0,
        }}
      >
        <MindMapCanvas
          block={block}
          editMode={editMode}
          height={Math.max(window.innerHeight - 100, 400)}
          zoom={zoom}
          onAddNode={handleAddNode}
          onRenameNode={handleRenameNode}
          onDeleteNode={handleDeleteNode}
          onMoveNode={handleMoveNode}
        />
      </div>
    </div>
  );
}

const modalBtnStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 4,
  background: 'transparent',
  border: '1px solid var(--bd2)',
  color: 'var(--t2)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
