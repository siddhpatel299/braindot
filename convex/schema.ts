import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// Second Brain — Convex schema
//
// The app is local-first: every collection lives in client state for instant
// interaction, and a sync engine mirrors it here. Documents are keyed by
// `localId` (the client-generated id) so the client never has to wait for a
// server id. `tokenIdentifier` is the server-verified identity from
// ctx.auth.getUserIdentity() — a user can never read or write another user's
// rows.

const byUser = { tokenIdentifier: v.string(), localId: v.string() };

export default defineSchema({
  ...authTables,

  notes: defineTable({
    ...byUser,
    filename: v.string(),
    title: v.string(),
    subtitle: v.string(),
    tags: v.array(v.string()),
    body: v.string(),
    backlinks: v.array(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
    wordCount: v.number(),
    status: v.string(), // 'draft' | 'evergreen'
    folderId: v.string(),
    pinned: v.boolean(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndLocalId", ["tokenIdentifier", "localId"]),

  folders: defineTable({
    ...byUser,
    name: v.string(),
    parentId: v.union(v.string(), v.null()),
    paraType: v.union(v.string(), v.null()),
    createdAt: v.string(),
    expanded: v.boolean(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndLocalId", ["tokenIdentifier", "localId"]),

  /* One task model, four axes. kanbanCards and todos are kept below so a
     vault written before the merge can still be read once and folded in. */
  tasks: defineTable({
    ...byUser,
    title: v.string(),
    state: v.string(),
    when: v.string(),
    effort: v.string(),
    output: v.string(),
    linkedNoteId: v.union(v.string(), v.null()),
    order: v.number(),
    createdAt: v.string(),
    updatedAt: v.string(),
    description: v.optional(v.string()),
    dueDate: v.optional(v.union(v.string(), v.null())),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndLocalId", ["tokenIdentifier", "localId"]),

  kanbanCards: defineTable({
    ...byUser,
    title: v.string(),
    description: v.string(),
    status: v.string(),
    tags: v.array(v.string()),
    linkedNoteId: v.union(v.string(), v.null()),
    order: v.number(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndLocalId", ["tokenIdentifier", "localId"]),

  todos: defineTable({
    ...byUser,
    text: v.string(),
    done: v.boolean(),
    priority: v.string(),
    dueGroup: v.union(v.string(), v.null()),
    dueDate: v.union(v.string(), v.null()),
    linkedNoteId: v.union(v.string(), v.null()),
    order: v.number(),
    createdAt: v.string(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndLocalId", ["tokenIdentifier", "localId"]),

  // cards/groups/connectors serialized as one JSON blob in `data` —
  // the canvas is always loaded and saved as a whole board.
  canvasBoards: defineTable({
    ...byUser,
    name: v.string(),
    data: v.string(),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndLocalId", ["tokenIdentifier", "localId"]),

  libraryItems: defineTable({
    ...byUser,
    title: v.string(),
    author: v.union(v.string(), v.null()),
    type: v.string(),
    source: v.string(),
    content: v.string(), // truncated client-side to fit the 1MB doc limit
    excerpt: v.string(),
    status: v.string(),
    progress: v.number(),
    coverUrl: v.union(v.string(), v.null()),
    highlights: v.array(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndLocalId", ["tokenIdentifier", "localId"]),

  highlights: defineTable({
    ...byUser,
    libraryItemId: v.string(),
    noteId: v.union(v.string(), v.null()),
    text: v.string(),
    color: v.string(),
    page: v.union(v.number(), v.null()),
    createdAt: v.string(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndLocalId", ["tokenIdentifier", "localId"]),

  // Misc per-user state (profile/streak, UI prefs) as JSON values
  appState: defineTable({
    ...byUser,
    key: v.string(),
    value: v.string(),
  })
    .index("byToken", ["tokenIdentifier"])
    .index("byTokenAndLocalId", ["tokenIdentifier", "localId"]),
});
