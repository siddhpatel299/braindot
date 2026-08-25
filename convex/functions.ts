import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getVerifiedToken } from "./identity";

// ============================================================
// Second Brain sync API
//
// The app is local-first: collections live in client state and are mirrored
// here per-user. The client pulls a collection once on login, then pushes
// debounced diffs (upserts + deletes) keyed by `localId`.
//
// Identity is verified server-side on EVERY call via the Convex Auth session
// token — a client can never read or write another user's rows.
// ============================================================

const SYNC_TABLES = [
  "notes",
  "folders",
  "tasks",
  // Read-only from here on: kanbanCards and todos were merged into `tasks`.
  // They stay registered so a vault written before the merge can be pulled
  // once and folded in.
  "kanbanCards",
  "todos",
  "canvasBoards",
  "libraryItems",
  "highlights",
  "bookmarks",
  "appState",
] as const;

type SyncTable = (typeof SYNC_TABLES)[number];

function assertSyncTable(table: string): SyncTable {
  if (!(SYNC_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Unknown sync table: ${table}`);
  }
  return table as SyncTable;
}

// ===== Pull: all docs in a collection for the signed-in user =====
export const pull = query({
  args: { table: v.string() },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const table = assertSyncTable(args.table);
    return await ctx.db
      .query(table)
      .withIndex("byToken", (q: any) => q.eq("tokenIdentifier", tokenIdentifier))
      .collect();
  },
});

// ===== Push: upsert + delete by localId =====
export const push = mutation({
  args: {
    table: v.string(),
    upserts: v.array(v.any()),
    deletes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const table = assertSyncTable(args.table);

    for (const doc of args.upserts) {
      if (!doc || typeof doc.localId !== "string") {
        throw new Error("Every upsert needs a string localId");
      }
      // Never trust client-supplied identity or system fields
      const { _id, _creationTime, tokenIdentifier: _t, ...fields } = doc;
      const existing = await ctx.db
        .query(table)
        .withIndex("byTokenAndLocalId", (q: any) =>
          q.eq("tokenIdentifier", tokenIdentifier).eq("localId", doc.localId),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, fields);
      } else {
        await ctx.db.insert(table, { ...fields, tokenIdentifier });
      }
    }

    for (const localId of args.deletes) {
      const existing = await ctx.db
        .query(table)
        .withIndex("byTokenAndLocalId", (q: any) =>
          q.eq("tokenIdentifier", tokenIdentifier).eq("localId", localId),
        )
        .first();
      if (existing) {
        await ctx.db.delete(existing._id);
      }
    }
  },
});

// ===== Admin: wipe ALL rows in the sync tables (CLI only) =====
// Run with: npx convex run functions:wipeAllAdmin
export const wipeAllAdmin = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const table of [...SYNC_TABLES, "publications", "publishedPages"] as const) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
    }
  },
});

// ===== Images =====
//
// Image bytes go to Convex file storage rather than into a note body: a note
// is one document with a 1MB ceiling, and it has to stay small enough to sync.
// The body ends up holding the ordinary HTTPS URL Convex serves the file from,
// which keeps the markdown portable — the picture still resolves when the note
// is exported or opened in another app.
//
// Both are mutations because generateUploadUrl and getUrl are only available
// outside queries, and both verify identity so an anonymous caller cannot
// upload into the account's storage.

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await getVerifiedToken(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const getImageUrl = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await getVerifiedToken(ctx);
    return await ctx.storage.getUrl(args.storageId);
  },
});

// ===== Wipe: delete every row for the signed-in user (reset account) =====
export const wipe = mutation({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    for (const table of SYNC_TABLES) {
      const rows = await ctx.db
        .query(table)
        .withIndex("byToken", (q: any) => q.eq("tokenIdentifier", tokenIdentifier))
        .collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
    }
    // Publications are not a sync table — nothing pulls them into the
    // client's collections — but they are the one kind of row that
    // outlives a reset by being readable to strangers. Resetting the account
    // has to take the public links down with it.
    const pubs = await ctx.db
      .query("publications")
      .withIndex("byToken", (q: any) => q.eq("tokenIdentifier", tokenIdentifier))
      .collect();
    for (const pub of pubs) {
      const pages = await ctx.db
        .query("publishedPages")
        .withIndex("bySlug", (q: any) => q.eq("slug", pub.slug))
        .collect();
      for (const page of pages) await ctx.db.delete(page._id);
      await ctx.db.delete(pub._id);
    }
  },
});
