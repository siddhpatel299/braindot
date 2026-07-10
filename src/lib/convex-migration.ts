// Convex migration utility — migrates localStorage data to Convex on first connect
// and provides a dual-write layer during transition.

import { isConvexConnected } from "@/lib/convex";

const MIGRATION_KEY = "second-brain-convex-migrated";

/**
 * Check if data has been migrated to Convex.
 */
export function isMigratedToConvex(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MIGRATION_KEY) === "true";
}

/**
 * Mark migration as complete.
 */
export function markMigrated(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(MIGRATION_KEY, "true");
}

/**
 * Check if Convex is available and ready to use.
 * The app falls back to localStorage if Convex is not configured.
 */
export function useConvexMode(): boolean {
  return isConvexConnected();
}

/**
 * Migrate all localStorage data to Convex.
 * This is called once when Convex is first connected.
 */
export async function migrateToConvex(): Promise<boolean> {
  if (!isConvexConnected()) return false;
  if (isMigratedToConvex()) return true;

  try {
    // Load all data from localStorage
    const STORAGE_KEY = "second-brain-state-v5";
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      markMigrated();
      return true;
    }

    const state = JSON.parse(raw);

    // Send to Convex via the bulkInsert mutation
    const res = await fetch("/api/convex/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notes: state.notes || [],
        folders: state.folders || [],
        kanbanCards: state.kanbanCards || [],
        todos: state.todos || [],
        canvasBoards: state.canvasBoards || [],
        libraryItems: state.libraryItems || [],
        highlights: state.highlights || [],
        appState: {
          openTabs: state.openTabs || [],
          activeTab: state.activeTab || "",
          streak: state.streak || 0,
          totalConnections: state.totalConnections || 0,
          lastEditDay: state.lastEditDay || "",
        },
      }),
    });

    if (res.ok) {
      markMigrated();
      return true;
    }
    return false;
  } catch (e) {
    console.error("Convex migration failed:", e);
    return false;
  }
}
