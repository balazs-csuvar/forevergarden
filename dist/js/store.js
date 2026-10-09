// IndexedDB persistence: one "kv" store for JSON state, one "blobs" store for photos and cached paintings.
const DB_NAME = "forevergarden";
let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("kv");
        request.result.createObjectStore("blobs");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function run(storeName, mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request && request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getValue = (key) => run("kv", "readonly", (store) => store.get(key));
export const setValue = (key, value) => run("kv", "readwrite", (store) => store.put(value, key));
export const getBlob = (key) => run("blobs", "readonly", (store) => store.get(key));
export const putBlob = (key, blob) => run("blobs", "readwrite", (store) => store.put(blob, key));
export const deleteBlob = (key) => run("blobs", "readwrite", (store) => store.delete(key));

export async function deleteBlobsWithPrefix(prefix) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("blobs", "readwrite");
    const range = IDBKeyRange.bound(prefix, `${prefix}￿`);
    const request = tx.objectStore("blobs").openKeyCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) { tx.objectStore("blobs").delete(cursor.primaryKey); cursor.continue(); }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
