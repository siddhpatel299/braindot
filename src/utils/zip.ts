// A ZIP writer, in about two hundred lines and no dependencies.
//
// Exporting a vault needs one archive containing a folder tree of markdown
// plus whatever images the notes point at. Every library that does this is
// tens of kilobytes in the bundle, and the format's happy path is small: the
// browser already has DEFLATE behind CompressionStream, so what is left is
// three record layouts and a CRC.
//
// Deliberately not general-purpose. No zip64, no encryption, no streaming to
// disk — a personal vault is megabytes, and the whole archive is assembled in
// memory and handed to the browser as one Blob.

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;

/** Bit 11: names and comments are UTF-8. Without it, anything outside ASCII
 *  is read as the archiver's local codepage and note titles come out wrong. */
const UTF8_NAMES = 0x0800;

const STORED = 0;
const DEFLATED = 8;

/** Neither limit is reachable by a vault, but silently writing a corrupt
 *  archive would be worse than saying so. Past either, zip64 is required. */
const MAX_ENTRIES = 0xffff;
const MAX_SIZE = 0xffffffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * MS-DOS date and time, which is what ZIP has recorded since 1989.
 *
 * Two-second resolution and a 1980 epoch. Anything earlier clamps rather than
 * wrapping into a nonsense year.
 */
export function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export interface ZipEntry {
  /** '/'-separated, no leading slash. Directories are implied by the names. */
  path: string;
  /** Strings are written as UTF-8. */
  data: Uint8Array | string;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new CompressionStream('deflate-raw'),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Bytes that are already compressed come out of DEFLATE bigger than they
 *  went in, so they are stored instead. Markdown, meanwhile, roughly halves. */
function alreadyCompressed(path: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|zip|mp4|webm|mp3|woff2?)$/i.test(path);
}

interface Prepared {
  nameBytes: Uint8Array;
  body: Uint8Array;
  method: number;
  crc: number;
  rawSize: number;
  offset: number;
}

/**
 * Build the archive.
 *
 * Entry order is preserved, which is what makes the export reproducible: the
 * caller decides the order and the same vault yields the same file listing.
 */
export async function makeZip(entries: ZipEntry[], now: Date = new Date()): Promise<Blob> {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`A zip written here holds at most ${MAX_ENTRIES} files`);
  }
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);

  const prepared: Prepared[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const raw = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    if (raw.length > MAX_SIZE) {
      throw new Error(`"${entry.path}" is too large for a zip written here`);
    }
    const nameBytes = encoder.encode(entry.path);
    const crc = crc32(raw);

    let body = raw;
    let method = STORED;
    if (!alreadyCompressed(entry.path) && raw.length > 0) {
      const deflated = await deflateRaw(raw);
      // Storing a file that grew is not a fallback, it is the correct answer.
      if (deflated.length < raw.length) {
        body = deflated;
        method = DEFLATED;
      }
    }

    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, LOCAL_HEADER, true);
    view.setUint16(4, 20, true);            // version needed
    view.setUint16(6, UTF8_NAMES, true);
    view.setUint16(8, method, true);
    view.setUint16(10, time, true);
    view.setUint16(12, date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, body.length, true);
    view.setUint32(22, raw.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);            // no extra field
    header.set(nameBytes, 30);

    chunks.push(header, body);
    prepared.push({ nameBytes, body, method, crc, rawSize: raw.length, offset });
    offset += header.length + body.length;
  }

  const centralStart = offset;
  let centralSize = 0;

  for (const p of prepared) {
    const record = new Uint8Array(46 + p.nameBytes.length);
    const view = new DataView(record.buffer);
    view.setUint32(0, CENTRAL_HEADER, true);
    view.setUint16(4, 20, true);            // version made by
    view.setUint16(6, 20, true);            // version needed
    view.setUint16(8, UTF8_NAMES, true);
    view.setUint16(10, p.method, true);
    view.setUint16(12, time, true);
    view.setUint16(14, date, true);
    view.setUint32(16, p.crc, true);
    view.setUint32(20, p.body.length, true);
    view.setUint32(24, p.rawSize, true);
    view.setUint16(28, p.nameBytes.length, true);
    view.setUint16(30, 0, true);            // extra
    view.setUint16(32, 0, true);            // comment
    view.setUint16(34, 0, true);            // disk number
    view.setUint16(36, 0, true);            // internal attributes
    view.setUint32(38, 0, true);            // external attributes
    view.setUint32(42, p.offset, true);
    record.set(p.nameBytes, 46);

    chunks.push(record);
    centralSize += record.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL, true);
  endView.setUint16(4, 0, true);            // this disk
  endView.setUint16(6, 0, true);            // disk with central directory
  endView.setUint16(8, prepared.length, true);
  endView.setUint16(10, prepared.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralStart, true);
  endView.setUint16(20, 0, true);           // no archive comment
  chunks.push(end);

  return new Blob(chunks as BlobPart[], { type: 'application/zip' });
}
