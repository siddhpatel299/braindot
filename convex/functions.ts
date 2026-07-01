import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ============================================================
// AUTH HELPER — verifies identity server-side on EVERY call
// ============================================================
// This is the key security improvement: instead of trusting a
// client-supplied userId, we get the identity from the verified
// Convex Auth session token. A user CANNOT read another user's
// data by editing localStorage — the server validates the token.
async function getVerifiedToken(ctx: any): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated — please sign in");
  }
  return identity.tokenIdentifier;
}

// ============================================================
// USER PROFILE
// ============================================================

export const getMyProfile = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    return await ctx.db
      .query("userProfiles")
      .withIndex("byToken", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .first();
  },
});

export const ensureProfile = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("byToken", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .first();
    if (existing) return existing._id;

    const today = new Date().toISOString().slice(0, 10);
    return await ctx.db.insert("userProfiles", {
      tokenIdentifier,
      name: args.name,
      email: args.email,
      streak: 0,
      lastEditDay: today,
      totalConnections: 0,
    });
  },
});

export const updateProfile = mutation({
  args: {
    streak: v.optional(v.number()),
    lastEditDay: v.optional(v.string()),
    totalConnections: v.optional(v.number()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("byToken", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .first();
    if (!profile) throw new Error("Profile not found");
    const patch: Record<string, any> = {};
    if (args.streak !== undefined) patch.streak = args.streak;
    if (args.lastEditDay !== undefined) patch.lastEditDay = args.lastEditDay;
    if (args.totalConnections !== undefined) patch.totalConnections = args.totalConnections;
    if (args.name !== undefined) patch.name = args.name;
    await ctx.db.patch(profile._id, patch);
  },
});

// ============================================================
// NOTES — all operations verified by tokenIdentifier
// ============================================================

export const getNotes = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    return await ctx.db
      .query("notes")
      .withIndex("byToken", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .collect();
  },
});

export const createNote = mutation({
  args: {
    filename: v.string(),
    title: v.string(),
    subtitle: v.string(),
    tags: v.array(v.string()),
    body: v.string(),
    backlinks: v.array(v.string()),
    wordCount: v.number(),
    status: v.string(),
    folderId: v.string(),
    pinned: v.boolean(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const now = new Date().toISOString();
    return await ctx.db.insert("notes", {
      ...args,
      tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateNote = mutation({
  args: {
    noteId: v.id("notes"),
    filename: v.optional(v.string()),
    title: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    body: v.optional(v.string()),
    backlinks: v.optional(v.array(v.string())),
    wordCount: v.optional(v.number()),
    status: v.optional(v.string()),
    folderId: v.optional(v.string()),
    pinned: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const { noteId, ...patch } = args;

    // VERIFY the note belongs to this user BEFORE updating
    const note = await ctx.db.get(noteId);
    if (!note) throw new Error("Note not found");
    if (note.tokenIdentifier !== tokenIdentifier) {
      throw new Error("Access denied — this note does not belong to you");
    }

    const cleanPatch: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await ctx.db.patch(noteId, cleanPatch);
  },
});

export const deleteNote = mutation({
  args: { noteId: v.id("notes") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);

    // VERIFY ownership before deleting
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new Error("Note not found");
    if (note.tokenIdentifier !== tokenIdentifier) {
      throw new Error("Access denied — this note does not belong to you");
    }

    await ctx.db.delete(args.noteId);
  },
});

// ============================================================
// FOLDERS
// ============================================================

export const getFolders = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    return await ctx.db
      .query("folders")
      .withIndex("byToken", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .collect();
  },
});

export const createFolder = mutation({
  args: {
    name: v.string(),
    parentId: v.union(v.string(), v.null()),
    paraType: v.union(v.string(), v.null()),
    expanded: v.boolean(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const now = new Date().toISOString();
    return await ctx.db.insert("folders", {
      ...args,
      tokenIdentifier,
      createdAt: now,
    });
  },
});

export const updateFolder = mutation({
  args: {
    folderId: v.id("folders"),
    name: v.optional(v.string()),
    expanded: v.optional(v.boolean()),
    paraType: v.optional(v.union(v.string(), v.null())),
    parentId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const folder = await ctx.db.get(args.folderId);
    if (!folder) throw new Error("Folder not found");
    if (folder.tokenIdentifier !== tokenIdentifier) {
      throw new Error("Access denied");
    }
    const { folderId, ...patch } = args;
    const cleanPatch: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await ctx.db.patch(folderId, cleanPatch);
  },
});

export const deleteFolder = mutation({
  args: { folderId: v.id("folders") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const folder = await ctx.db.get(args.folderId);
    if (!folder) throw new Error("Folder not found");
    if (folder.tokenIdentifier !== tokenIdentifier) {
      throw new Error("Access denied");
    }
    await ctx.db.delete(args.folderId);
  },
});

// ============================================================
// KANBAN CARDS
// ============================================================

export const getKanbanCards = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    return await ctx.db
      .query("kanbanCards")
      .withIndex("byToken", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .collect();
  },
});

export const createKanbanCard = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    status: v.string(),
    tags: v.array(v.string()),
    linkedNoteId: v.union(v.id("notes"), v.null()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const now = new Date().toISOString();
    return await ctx.db.insert("kanbanCards", {
      ...args,
      tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateKanbanCard = mutation({
  args: {
    cardId: v.id("kanbanCards"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    linkedNoteId: v.optional(v.union(v.id("notes"), v.null())),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new Error("Card not found");
    if (card.tokenIdentifier !== tokenIdentifier) throw new Error("Access denied");
    const { cardId, ...patch } = args;
    const cleanPatch: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await ctx.db.patch(cardId, cleanPatch);
  },
});

export const deleteKanbanCard = mutation({
  args: { cardId: v.id("kanbanCards") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new Error("Card not found");
    if (card.tokenIdentifier !== tokenIdentifier) throw new Error("Access denied");
    await ctx.db.delete(args.cardId);
  },
});

// ============================================================
// TODOS
// ============================================================

export const getTodos = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    return await ctx.db
      .query("todos")
      .withIndex("byToken", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .collect();
  },
});

export const createTodo = mutation({
  args: {
    text: v.string(),
    completed: v.boolean(),
    priority: v.string(),
    dueDate: v.union(v.string(), v.null()),
    linkedNoteId: v.union(v.id("notes"), v.null()),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const now = new Date().toISOString();
    return await ctx.db.insert("todos", {
      ...args,
      tokenIdentifier,
      createdAt: now,
    });
  },
});

export const updateTodo = mutation({
  args: {
    todoId: v.id("todos"),
    text: v.optional(v.string()),
    completed: v.optional(v.boolean()),
    priority: v.optional(v.string()),
    dueDate: v.optional(v.union(v.string(), v.null())),
    linkedNoteId: v.optional(v.union(v.id("notes"), v.null())),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const todo = await ctx.db.get(args.todoId);
    if (!todo) throw new Error("Todo not found");
    if (todo.tokenIdentifier !== tokenIdentifier) throw new Error("Access denied");
    const { todoId, ...patch } = args;
    const cleanPatch: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await ctx.db.patch(todoId, cleanPatch);
  },
});

export const deleteTodo = mutation({
  args: { todoId: v.id("todos") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const todo = await ctx.db.get(args.todoId);
    if (!todo) throw new Error("Todo not found");
    if (todo.tokenIdentifier !== tokenIdentifier) throw new Error("Access denied");
    await ctx.db.delete(args.todoId);
  },
});

// ============================================================
// CANVAS BOARDS
// ============================================================

export const getCanvasBoards = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    return await ctx.db
      .query("canvasBoards")
      .withIndex("byToken", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .collect();
  },
});

export const createCanvasBoard = mutation({
  args: {
    name: v.string(),
    nodes: v.string(),
    edges: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const now = new Date().toISOString();
    return await ctx.db.insert("canvasBoards", {
      ...args,
      tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCanvasBoard = mutation({
  args: {
    boardId: v.id("canvasBoards"),
    name: v.optional(v.string()),
    nodes: v.optional(v.string()),
    edges: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error("Board not found");
    if (board.tokenIdentifier !== tokenIdentifier) throw new Error("Access denied");
    const { boardId, ...patch } = args;
    const cleanPatch: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await ctx.db.patch(boardId, cleanPatch);
  },
});

export const deleteCanvasBoard = mutation({
  args: { boardId: v.id("canvasBoards") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const board = await ctx.db.get(args.boardId);
    if (!board) throw new Error("Board not found");
    if (board.tokenIdentifier !== tokenIdentifier) throw new Error("Access denied");
    await ctx.db.delete(args.boardId);
  },
});

// ============================================================
// LIBRARY ITEMS (reading)
// ============================================================

export const getLibraryItems = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    return await ctx.db
      .query("libraryItems")
      .withIndex("byToken", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .collect();
  },
});

export const createLibraryItem = mutation({
  args: {
    title: v.string(),
    author: v.union(v.string(), v.null()),
    type: v.string(),
    source: v.string(),
    content: v.string(),
    status: v.string(),
    progress: v.number(),
    coverUrl: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const now = new Date().toISOString();
    return await ctx.db.insert("libraryItems", {
      ...args,
      tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateLibraryItem = mutation({
  args: {
    itemId: v.id("libraryItems"),
    title: v.optional(v.string()),
    status: v.optional(v.string()),
    progress: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    if (item.tokenIdentifier !== tokenIdentifier) throw new Error("Access denied");
    const { itemId, ...patch } = args;
    const cleanPatch: Record<string, any> = { updatedAt: new Date().toISOString() };
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) cleanPatch[k] = v;
    }
    await ctx.db.patch(itemId, cleanPatch);
  },
});

export const deleteLibraryItem = mutation({
  args: { itemId: v.id("libraryItems") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Item not found");
    if (item.tokenIdentifier !== tokenIdentifier) throw new Error("Access denied");
    await ctx.db.delete(args.itemId);
  },
});

// ============================================================
// HIGHLIGHTS
// ============================================================

export const getHighlights = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    return await ctx.db
      .query("highlights")
      .withIndex("byToken", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .collect();
  },
});

export const createHighlight = mutation({
  args: {
    libraryItemId: v.id("libraryItems"),
    noteId: v.union(v.id("notes"), v.null()),
    text: v.string(),
    color: v.string(),
    page: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const now = new Date().toISOString();
    return await ctx.db.insert("highlights", {
      ...args,
      tokenIdentifier,
      createdAt: now,
    });
  },
});

export const deleteHighlight = mutation({
  args: { highlightId: v.id("highlights") },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const hl = await ctx.db.get(args.highlightId);
    if (!hl) throw new Error("Highlight not found");
    if (hl.tokenIdentifier !== tokenIdentifier) throw new Error("Access denied");
    await ctx.db.delete(args.highlightId);
  },
});

// ============================================================
// BULK OPERATIONS (for seeding new users with PARA folders + templates)
// ============================================================

export const bulkCreateFolders = mutation({
  args: {
    folders: v.array(v.object({
      name: v.string(),
      parentId: v.union(v.string(), v.null()),
      paraType: v.union(v.string(), v.null()),
      createdAt: v.string(),
      expanded: v.boolean(),
      localId: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const mapping: Record<string, string> = {};
    for (const f of args.folders) {
      const { localId, ...folderData } = f;
      const id = await ctx.db.insert("folders", {
        ...folderData,
        tokenIdentifier,
      });
      mapping[localId] = id;
    }
    return mapping;
  },
});

export const bulkCreateNotes = mutation({
  args: {
    notes: v.array(v.object({
      filename: v.string(),
      title: v.string(),
      subtitle: v.string(),
      tags: v.array(v.string()),
      body: v.string(),
      backlinks: v.array(v.string()),
      wordCount: v.number(),
      status: v.string(),
      folderId: v.string(),
      pinned: v.boolean(),
      createdAt: v.string(),
      updatedAt: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const ids: string[] = [];
    for (const n of args.notes) {
      const id = await ctx.db.insert("notes", {
        ...n,
        tokenIdentifier,
      });
      ids.push(id);
    }
    return ids;
  },
});
