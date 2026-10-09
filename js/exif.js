// Reads when a photo was taken from its EXIF data (DateTimeOriginal), falling back to the file's date.
// Returns a local calendar date "YYYY-MM-DD".
export async function photoTakenOn(file) {
  try {
    const head = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    const found = exifDate(head);
    if (found) return found;
  } catch { /* not a JPEG or no EXIF */ }
  const d = new Date(file.lastModified || Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function exifDate(view) {
  if (view.getUint16(0) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) return readTiff(view, offset + 10);
    if ((marker & 0xff00) !== 0xff00) break;
    offset += 2 + size;
  }
  return null;
}

function readTiff(view, start) {
  const little = view.getUint16(start) === 0x4949;
  const u16 = (o) => view.getUint16(start + o, little);
  const u32 = (o) => view.getUint32(start + o, little);
  const ascii = (o, n) => { let s = ""; for (let i = 0; i < n; i += 1) { const c = view.getUint8(start + o + i); if (!c) break; s += String.fromCharCode(c); } return s; };
  const readIfd = (ifd) => {
    const out = {};
    const count = u16(ifd);
    for (let i = 0; i < count; i += 1) {
      const e = ifd + 2 + i * 12;
      const tag = u16(e), type = u16(e + 2), n = u32(e + 4);
      if (type === 2) out[tag] = ascii(n > 4 ? u32(e + 8) : e + 8, n);
      else if (type === 4) out[tag] = u32(e + 8);
    }
    return out;
  };
  const ifd0 = readIfd(u32(4));
  const exif = ifd0[0x8769] ? readIfd(ifd0[0x8769]) : {};
  const raw = exif[0x9003] || exif[0x9004] || ifd0[0x0132];
  const m = raw && raw.match(/^(\d{4}):(\d{2}):(\d{2})/);
  return m && m[1] !== "0000" ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
