// Activity heat system — determines node visual style based on edit recency.

export type HeatLevel = 'hot' | 'warm' | 'month' | 'cold';

export function getHeat(lastEditedAt: string | Date): HeatLevel {
  const date = typeof lastEditedAt === 'string' ? new Date(lastEditedAt) : lastEditedAt;
  const days = (Date.now() - date.getTime()) / 86400000;
  if (days < 1) return 'hot';
  if (days < 7) return 'warm';
  if (days < 30) return 'month';
  return 'cold';
}

export interface HeatStyle {
  color: string;
  radiusMultiplier: number;
  hasGlow: boolean;
  hasPulse: boolean;
  glowFilter: string;
  labelColor: string;
  activityString: string;
  activityColor: string;
}

export const HEAT_STYLES: Record<HeatLevel, HeatStyle> = {
  hot: {
    color: '#fb923c',
    radiusMultiplier: 1.0,
    hasGlow: true,
    hasPulse: true,
    glowFilter: 'url(#glow-hot)',
    labelColor: '#fde68a',
    activityString: 'edited today',
    activityColor: '#fb923c',
  },
  warm: {
    color: '#b0a8fb',
    radiusMultiplier: 0.85,
    hasGlow: true,
    hasPulse: true,
    glowFilter: 'url(#glow-warm)',
    labelColor: '#b0a8fb',
    activityString: 'edited this week',
    activityColor: '#b0a8fb',
  },
  month: {
    color: '#534AB7',
    radiusMultiplier: 0.70,
    hasGlow: false,
    hasPulse: false,
    glowFilter: '',
    labelColor: '#7F77DD',
    activityString: 'edited this month',
    activityColor: '#7F77DD',
  },
  cold: {
    color: '#2e2e44',
    radiusMultiplier: 0.55,
    hasGlow: false,
    hasPulse: false,
    glowFilter: '',
    labelColor: '#444450',
    activityString: 'not touched in 30+ days',
    activityColor: '#444450',
  },
};

// Compute base radius from backlink count, then apply heat multiplier
export function getNodeRadius(backlinkCount: number, heat: HeatLevel): number {
  const base = 6 + Math.sqrt(Math.max(backlinkCount, 0)) * 2.5;
  return base * HEAT_STYLES[heat].radiusMultiplier;
}

// Edge styling based on the heat of both endpoints
export interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  dashArray?: string;
}

export function getEdgeStyle(fromHeat: HeatLevel, toHeat: HeatLevel): EdgeStyle {
  const isActive = (h: HeatLevel) => h === 'hot' || h === 'warm';
  if (isActive(fromHeat) && isActive(toHeat)) {
    return { stroke: '#3d378a', strokeWidth: 1.2 };
  }
  if (isActive(fromHeat) || isActive(toHeat)) {
    return { stroke: '#252528', strokeWidth: 1.0 };
  }
  return { stroke: '#1e1e21', strokeWidth: 0.8, dashArray: '4,3' };
}

// Curved bezier path between two points
export function curvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x1 + x2) / 2 + (y2 - y1) * 0.12;
  const cy = (y1 + y2) / 2 - (x2 - x1) * 0.12;
  return `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
}

// Format time like "9:41am"
export function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

// Format short date like "Jun 28"
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
