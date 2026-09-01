import { inflateRawSync } from "node:zlib";

/**
 * A minimal .xlsx reader.
 *
 * An xlsx is a ZIP of XML. Node ships inflate but no ZIP container reader, and
 * the alternative was asking a human to save 220 tabs as CSV by hand every
 * time a roster is updated. This reads what a spreadsheet export actually
 * contains - shared strings, sheet names, cell values - and nothing else.
 *
 * Deliberately not a full implementation: no formulas, no styles, no dates
 * beyond the raw serial. Callers get strings and decide what they mean.
 */

type ZipEntry = { name: string; data: Buffer };

/** Reads the ZIP central directory rather than scanning for local headers. */
function readZip(buf: Buffer): Map<string, Buffer> {
  // End of central directory: signature 0x06054b50, within the last 64KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error("not a zip file (no end of central directory)");

  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLength);

    // The local header repeats the name and extra field, at its own lengths.
    const localNameLength = buf.readUInt16LE(localOffset + 26);
    const localExtraLength = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buf.subarray(start, start + compressedSize);

    entries.push({
      name,
      data: method === 0 ? Buffer.from(raw) : inflateRawSync(raw),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return new Map(entries.map((e) => [e.name, e.data]));
}

/**
 * Tag matcher tolerant of a namespace prefix.
 *
 * Excel writes `<sheet>`, but other writers - including whatever produced the
 * KHSAA roster workbook - write `<x:sheet>`. A regex anchored on the bare name
 * silently matches nothing and the file reads as empty.
 */
const open = (tag: string) => `<(?:[A-Za-z0-9]+:)?${tag}\\b`;
const element = (tag: string) =>
  new RegExp(`${open(tag)}[\\s\\S]*?(?:/>|</(?:[A-Za-z0-9]+:)?${tag}>)`, "g");
const selfOrOpen = (tag: string) => new RegExp(`${open(tag)}[^>]*/?>`, "g");
const inner = (tag: string) =>
  new RegExp(`${open(tag)}[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9]+:)?${tag}>`);

/** Pulls the text out of one XML element, ignoring markup. */
function textOf(xml: string): string {
  return xml
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

export type Sheet = { name: string; rows: string[][] };

export function readXlsx(buffer: Buffer): Sheet[] {
  const files = readZip(buffer);

  const read = (path: string): string | null => {
    const d = files.get(path) ?? files.get(path.replace(/^\//, ""));
    return d ? d.toString("utf8") : null;
  };

  // Shared strings: cells of type "s" hold an index into this table.
  const sharedXml = read("xl/sharedStrings.xml") ?? "";
  const shared: string[] = [];
  for (const si of sharedXml.match(element("si")) ?? []) {
    shared.push(textOf(si));
  }

  const workbook = read("xl/workbook.xml") ?? "";
  const relsXml = read("xl/_rels/workbook.xml.rels") ?? "";
  const relTarget = new Map<string, string>();
  for (const rel of relsXml.match(selfOrOpen("Relationship")) ?? []) {
    const id = /Id="([^"]+)"/.exec(rel)?.[1];
    const target = /Target="([^"]+)"/.exec(rel)?.[1];
    if (id && target) relTarget.set(id, target);
  }

  const sheets: Sheet[] = [];
  for (const tag of workbook.match(selfOrOpen("sheet")) ?? []) {
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    const rid = /r:id="([^"]+)"/.exec(tag)?.[1];
    if (!name || !rid) continue;
    const target = relTarget.get(rid);
    if (!target) continue;

    // Targets appear both as "worksheets/sheet1.xml" and "/xl/worksheets/...".
    const clean = target.replace(/^\//, "");
    const xml = read(clean.startsWith("xl/") ? clean : `xl/${clean}`);
    if (!xml) continue;

    const rows: string[][] = [];
    for (const rowXml of xml.match(element("row")) ?? []) {
      const cells: string[] = [];
      for (const cellXml of rowXml.match(element("c")) ?? []) {
        const ref = /r="([A-Z]+)\d+"/.exec(cellXml)?.[1] ?? "";
        // Column letters to a zero-based index, so blanks keep their place.
        let index = 0;
        for (const ch of ref) index = index * 26 + (ch.charCodeAt(0) - 64);
        index = Math.max(0, index - 1);

        const type = /\bt="([^"]+)"/.exec(cellXml)?.[1];
        let value = "";
        if (type === "inlineStr") {
          value = textOf(element("is").exec(cellXml)?.[0] ?? "");
        } else {
          const v = inner("v").exec(cellXml)?.[1];
          if (v !== undefined) {
            value = type === "s" ? (shared[Number(v)] ?? "") : textOf(v);
          }
        }
        while (cells.length < index) cells.push("");
        cells[index] = value.trim();
      }
      rows.push(cells);
    }
    sheets.push({ name, rows });
  }
  return sheets;
}
