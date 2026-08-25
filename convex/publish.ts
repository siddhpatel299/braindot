import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getVerifiedToken } from "./identity";

// ============================================================
// Publishing — a link that works without an account
//
// Every other query in this app refuses an anonymous caller. `read` below is
// the single deliberate exception, and the rules that make it safe all live
// here rather than spread across the client:
//
//   1. The slug is the credential. It is generated here, from CSPRNG bytes,
//      and never from the title — so it cannot be guessed from a page the
//      author linked publicly, and there is no listing endpoint to walk.
//   2. `read` returns a hand-written shape. Spreading the row would ship
//      `tokenIdentifier` to the whole internet the first time somebody added
//      a field to the table.
//   3. Publishing copies. The vault syncs live; a handed-out link does not.
//      Republishing overwrites the copy and keeps the slug, so a link already
//      sent stays valid.
//
// The client assembles the snapshot, because that is where the vault lives —
// notes are local-first, and only the browser can resolve a device-local
// image or know which wiki-link points at a page inside this publication.
// What the server owes in return is refusing to store an unbounded one.
// ============================================================

/** No l/1/I/0/O: these get read aloud and typed by hand. */
const SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";
const SLUG_LENGTH = 24; // ~121 bits

/** A publication is one folder tree; this is where "one folder tree" stops. */
const MAX_PAGES = 250;
/** Comfortably above the largest note that can sync — Convex caps a document
 *  at 1MB, so a note bigger than this could not round-trip anyway. */
const MAX_BODY_CHARS = 400_000;
/** Per-page limits are not enough on their own: 250 pages that each clear the
 *  per-page cap is ~100MB arriving as one mutation argument and being written
 *  in one transaction, and Convex allows neither. Without this the failure is
 *  an opaque transaction error on a folder someone spent a year filling; with
 *  it, it is a sentence naming the problem. */
const MAX_TOTAL_CHARS = 4_000_000;
const MAX_TITLE_CHARS = 300;

function randomSlug(): string {
  const bytes = new Uint8Array(SLUG_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
  return out;
}

/**
 * A slug nothing else is using.
 *
 * At 121 bits the loop will not run twice in the lifetime of the universe.
 * It is here anyway because of what a collision would do rather than how
 * likely it is: `read` resolves a slug with `.first()`, so two publications
 * sharing one would serve a stranger somebody else's private page. One
 * indexed read rules that out for good.
 */
async function mintSlug(ctx: any): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomSlug();
    const clash = await ctx.db
      .query("publications")
      .withIndex("bySlug", (q: any) => q.eq("slug", slug))
      .first();
    if (!clash) return slug;
  }
  throw new Error("Could not mint a link just now — please try again.");
}

const childValidator = v.object({
  path: v.string(),
  title: v.string(),
  kind: v.string(),
  subtitle: v.string(),
});

const pageValidator = v.object({
  path: v.string(),
  kind: v.string(),
  title: v.string(),
  subtitle: v.string(),
  tags: v.array(v.string()),
  body: v.string(),
  wordCount: v.number(),
  updatedAt: v.string(),
  order: v.number(),
  children: v.array(childValidator),
  trail: v.array(v.object({ path: v.string(), title: v.string() })),
});

/** A path becomes a URL segment chain and is echoed back into hrefs, so it is
 *  checked here rather than trusted from the caller that built it. */
const SAFE_PATH = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/;

/** Everything the caller sends is theirs, but "theirs" is not "any size". */
function assertPagesAreSane(
  pages: { path: string; kind: string; title: string; body: string }[],
) {
  if (pages.length === 0) throw new Error("A publication needs at least one page");
  if (pages.length > MAX_PAGES) {
    throw new Error(
      `That folder holds ${pages.length} pages; publishing tops out at ${MAX_PAGES}`,
    );
  }
  if (pages.filter((p) => p.path === "").length !== 1) {
    throw new Error("A publication needs exactly one root page");
  }

  const total = pages.reduce((n, p) => n + p.body.length, 0);
  if (total > MAX_TOTAL_CHARS) {
    throw new Error(
      `That folder holds about ${Math.round(total / 100_000) / 10}MB of writing; publishing tops out at ${MAX_TOTAL_CHARS / 1_000_000}MB. Publish a subfolder instead.`,
    );
  }

  const seen = new Set<string>();
  for (const page of pages) {
    if (page.kind !== "note" && page.kind !== "folder") {
      throw new Error(`Unknown page kind: ${page.kind}`);
    }
    if (seen.has(page.path)) throw new Error(`Two pages claim the path "${page.path}"`);
    seen.add(page.path);
    if (page.path !== "" && !SAFE_PATH.test(page.path)) {
      throw new Error(`Unsafe page path: "${page.path}"`);
    }
    if (page.body.length > MAX_BODY_CHARS) {
      throw new Error(`"${page.title || "Untitled"}" is too long to publish`);
    }
    if (page.title.length > MAX_TITLE_CHARS) {
      throw new Error("A page title that long is not a title");
    }
  }
}

async function pagesOf(ctx: any, slug: string) {
  return await ctx.db
    .query("publishedPages")
    .withIndex("bySlug", (q: any) => q.eq("slug", slug))
    .collect();
}

// ===== Reserve the slug before the pages exist =====
//
// A wiki-link between two pages of the same publication has to render as
// /p/<slug>/<path>, and the client builds those hrefs while it assembles the
// snapshot — before `publish` has run and therefore before the slug exists.
// Rather than let the client mint its own (the slug is a credential, and a
// credential minted on the client is a credential an attacker can predict),
// it asks for one first. Returns the existing slug on a republish, so the
// link already handed out survives.
//
// A reservation with no pages behind it 404s, exactly like a slug that was
// never issued — `read` needs a root page, not just a publication.
export const reserveSlug = mutation({
  args: { kind: v.string(), rootLocalId: v.string(), title: v.string() },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    if (args.kind !== "note" && args.kind !== "folder") {
      throw new Error(`Cannot publish a ${args.kind}`);
    }
    const existing = await ctx.db
      .query("publications")
      .withIndex("byTokenAndRoot", (q: any) =>
        q.eq("tokenIdentifier", tokenIdentifier).eq("rootLocalId", args.rootLocalId),
      )
      .first();
    if (existing) return { slug: existing.slug };

    const now = new Date().toISOString();
    const slug = await mintSlug(ctx);
    await ctx.db.insert("publications", {
      tokenIdentifier,
      slug,
      kind: args.kind,
      rootLocalId: args.rootLocalId,
      title: args.title.slice(0, MAX_TITLE_CHARS),
      indexable: false,
      pageCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { slug };
  },
});

// ===== Publish / republish =====
//
// Idempotent on rootLocalId: the second call for the same note replaces the
// stored copy and returns the slug the first one minted. That is what makes
// "Update published page" safe to press — the link sitting in someone's inbox
// still resolves afterwards.
export const publish = mutation({
  args: {
    kind: v.string(),
    rootLocalId: v.string(),
    title: v.string(),
    indexable: v.boolean(),
    pages: v.array(pageValidator),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    if (args.kind !== "note" && args.kind !== "folder") {
      throw new Error(`Cannot publish a ${args.kind}`);
    }
    assertPagesAreSane(args.pages);

    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("publications")
      .withIndex("byTokenAndRoot", (q: any) =>
        q.eq("tokenIdentifier", tokenIdentifier).eq("rootLocalId", args.rootLocalId),
      )
      .first();

    let slug: string;
    if (existing) {
      slug = existing.slug;
      for (const page of await pagesOf(ctx, slug)) await ctx.db.delete(page._id);
      await ctx.db.patch(existing._id, {
        kind: args.kind,
        title: args.title,
        indexable: args.indexable,
        pageCount: args.pages.length,
        updatedAt: now,
      });
    } else {
      slug = await mintSlug(ctx);
      await ctx.db.insert("publications", {
        tokenIdentifier,
        slug,
        kind: args.kind,
        rootLocalId: args.rootLocalId,
        title: args.title,
        indexable: args.indexable,
        pageCount: args.pages.length,
        createdAt: now,
        updatedAt: now,
      });
    }

    for (const page of args.pages) {
      await ctx.db.insert("publishedPages", { ...page, slug });
    }

    return { slug, updatedAt: now };
  },
});

// ===== Unpublish =====
//
// Returns quietly when there is nothing to take down, so a caller that
// unpublishes on the way to deleting a note does not have to check first.
export const unpublish = mutation({
  args: { rootLocalId: v.string() },
  handler: async (ctx, args) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const existing = await ctx.db
      .query("publications")
      .withIndex("byTokenAndRoot", (q: any) =>
        q.eq("tokenIdentifier", tokenIdentifier).eq("rootLocalId", args.rootLocalId),
      )
      .first();
    if (!existing) return { removed: false };
    for (const page of await pagesOf(ctx, existing.slug)) await ctx.db.delete(page._id);
    await ctx.db.delete(existing._id);
    return { removed: true };
  },
});

// ===== What the signed-in user has published =====
//
// Drives the share button's state everywhere in the app, so it returns the
// whole (small) list rather than answering one id at a time.
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await getVerifiedToken(ctx);
    const rows = await ctx.db
      .query("publications")
      .withIndex("byToken", (q: any) => q.eq("tokenIdentifier", tokenIdentifier))
      .collect();
    return rows.map((r: any) => ({
      slug: r.slug as string,
      kind: r.kind as string,
      rootLocalId: r.rootLocalId as string,
      title: r.title as string,
      indexable: r.indexable as boolean,
      pageCount: r.pageCount as number,
      createdAt: r.createdAt as string,
      updatedAt: r.updatedAt as string,
    }));
  },
});

// ===== The public read =====
//
// No auth, by design. Every field returned is named explicitly; there is no
// spread of a database row anywhere below, and there must never be one.
export const read = query({
  args: { slug: v.string(), path: v.string() },
  handler: async (ctx, args) => {
    const pub = await ctx.db
      .query("publications")
      .withIndex("bySlug", (q: any) => q.eq("slug", args.slug))
      .first();
    if (!pub) return null;

    const page = await ctx.db
      .query("publishedPages")
      .withIndex("bySlugAndPath", (q: any) =>
        q.eq("slug", args.slug).eq("path", args.path),
      )
      .first();
    if (!page) return null;

    return {
      publication: {
        slug: pub.slug,
        kind: pub.kind,
        title: pub.title,
        indexable: pub.indexable,
        pageCount: pub.pageCount,
        updatedAt: pub.updatedAt,
      },
      page: {
        path: page.path,
        kind: page.kind,
        title: page.title,
        subtitle: page.subtitle,
        tags: page.tags,
        body: page.body,
        wordCount: page.wordCount,
        updatedAt: page.updatedAt,
        children: page.children.map((c: any) => ({
          path: c.path as string,
          title: c.title as string,
          kind: c.kind as string,
          subtitle: c.subtitle as string,
        })),
        trail: page.trail.map((t: any) => ({
          path: t.path as string,
          title: t.title as string,
        })),
      },
    };
  },
});
