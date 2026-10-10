// Makes sure a chosen photo is something this browser can open. iPhone photos are often HEIC,
// which most browsers other than Safari can't decode, and very large photos can fail too.
// Returns the original file when it opens fine, otherwise a JPEG copy (same file date, so the
// "taken on" fallback still works).

const MAX_SIDE = 2400;
const HEIC_LIB = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";

export async function readablePhoto(file, onConvert = () => {}) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const big = Math.max(bitmap.width, bitmap.height) > 4000;
    if (!big) { bitmap.close?.(); return file; }
    onConvert();
    return toJpeg(bitmap, file); // very large: shrink now so later steps don't run out of memory
  } catch { /* fall through */ }
  onConvert();
  // Safari can show HEIC in an <img> even where createImageBitmap fails.
  const img = await viaImg(file).catch(() => null);
  if (img) return toJpeg(img, file);
  if (await looksHeic(file)) {
    try {
      await loadScript(HEIC_LIB);
      const out = await window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
      const jpeg = Array.isArray(out) ? out[0] : out;
      const bitmap = await createImageBitmap(jpeg);
      return toJpeg(bitmap, file);
    } catch (error) {
      console.error(error);
      throw new Error("Couldn't convert this HEIC photo. On iPhone, set Settings › Camera › Formats to Most Compatible, or share it as a JPEG.");
    }
  }
  throw new Error("This photo couldn't be opened. Try a JPEG or PNG, or take the photo again.");
}

async function toJpeg(source, file) {
  const w = source.naturalWidth || source.width, h = source.naturalHeight || source.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't convert the photo"))), "image/jpeg", 0.9));
  const name = (file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg", lastModified: file.lastModified || Date.now() });
}

function viaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img decode failed")); };
    img.src = url;
  });
}

async function looksHeic(file) {
  if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name || "")) return true;
  try {
    const head = new Uint8Array(await file.slice(4, 12).arrayBuffer());
    const brand = String.fromCharCode(...head);
    return /^ftyp(heic|heix|hevc|heim|heis|mif1|msf1)/.test(brand);
  } catch { return false; }
}

const loading = new Map();
function loadScript(src) {
  if (!loading.has(src)) loading.set(src, new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = resolve;
    el.onerror = () => { loading.delete(src); reject(new Error("Couldn't load the photo converter. Check your connection.")); };
    document.head.appendChild(el);
  }));
  return loading.get(src);
}

// Open a stored photo for drawing, with a fallback for browsers where createImageBitmap fails.
export async function decodePhoto(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: "from-image" }); }
  catch { return viaImg(blob); }
}
