// xlsx.js — minimal .xlsx reader/writer using only Node built-ins (zlib).
// An .xlsx is a ZIP of XML parts. We read the first worksheet into rows
// (array of array of cell strings) and can build a simple sheet for templates.
// No npm dependency.
const zlib = require('zlib');

// ---------- CRC32 (needed to write valid ZIP entries) ----------
let CRC_TABLE;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRC_TABLE[n] = c >>> 0; }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ---------- XML helpers ----------
const decodeXml = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
  .replace(/&amp;/g, '&');
const encodeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function colToIndex(ref) { const m = /^([A-Z]+)/.exec(ref); if (!m) return 0; let c = 0; for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64); return c - 1; }
function indexToCol(i) { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }

// ---------- ZIP read (via the central directory) ----------
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) throw new Error('not a zip / xlsx file');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    const lhNameLen = buf.readUInt16LE(localOff + 26);
    const lhExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lhNameLen + lhExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    files[name] = method === 0 ? Buffer.from(comp) : zlib.inflateRawSync(comp);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ---------- Parse: first worksheet -> rows (array of array of strings) ----------
function parse(buffer) {
  const files = readZip(buffer);
  const shared = [];
  const ssBuf = files['xl/sharedStrings.xml'];
  if (ssBuf) {
    const xml = ssBuf.toString('utf8');
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g; let m;
    while ((m = siRe.exec(xml))) {
      const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g; let t, s = '';
      while ((t = tRe.exec(m[1]))) s += t[1];
      shared.push(decodeXml(s));
    }
  }
  const sheetKey = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => (parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10)))[0];
  if (!sheetKey) throw new Error('no worksheet found');
  const sx = files[sheetKey].toString('utf8');
  const rows = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g; let rm;
  while ((rm = rowRe.exec(sx))) {
    const cells = [];
    const cRe = /<c\b\s+([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g; let cm;
    let seq = 0;
    while ((cm = cRe.exec(rm[1]))) {
      const attrs = cm[1], inner = cm[3] || '';
      const rMatch = /r="([A-Z]+)\d+"/.exec(attrs);
      const idx = rMatch ? colToIndex(rMatch[1] + '1') : seq;
      const tMatch = /t="([^"]+)"/.exec(attrs);
      const type = tMatch ? tMatch[1] : '';
      let val = '';
      if (type === 's') { const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner); val = v ? (shared[parseInt(v[1], 10)] || '') : ''; }
      else if (type === 'inlineStr') { const t = /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(inner); val = t ? decodeXml(t[1]) : ''; }
      else { const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner); val = v ? decodeXml(v[1]) : ''; }
      cells[idx] = val;
      seq = idx + 1;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] == null) cells[i] = '';
    rows.push(cells);
  }
  return rows;
}

// ---------- ZIP write (stored, i.e. uncompressed — valid and simplest) ----------
function zipStore(entries) {
  const parts = [], central = []; let offset = 0;
  for (const [name, content] of entries) {
    const data = Buffer.from(content, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralStart = offset;
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12); eocd.writeUInt32LE(centralStart, 16);
  return Buffer.concat([...parts, ...central, eocd]);
}

// ---------- Build: rows -> a simple single-sheet .xlsx Buffer ----------
function build(rows, sheetName = 'Sheet1') {
  const body = rows.map((r, ri) => {
    const cells = r.map((val, ci) => `<c r="${indexToCol(ci)}${ri + 1}" t="inlineStr"><is><t xml:space="preserve">${encodeXml(String(val == null ? '' : val))}</t></is></c>`).join('');
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${encodeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  return zipStore([
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rels],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', wbRels],
    ['xl/worksheets/sheet1.xml', sheet],
  ]);
}

module.exports = { parse, build };
