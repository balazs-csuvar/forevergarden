// In-app camera with a faded guide over the viewfinder, so photos line up:
//   ghost "left"/"right": a strip of the previous photo along that edge, to continue a border
//                         from where the last section ended (they overlap by `overlap`);
//   ghost "full":         the whole earlier photo of this view, to retake it from the same spot.
// Resolves { blob, ghostUsed } when a photo is taken, { gallery: true } to choose a file
// instead, or null when closed.

export const cameraAvailable = () => !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia);

const OPACITY_STEPS = [0.5, 0.25, 0];

export function openCamera({ ghostUrl = null, ghostMode = null, overlap = 0.22, title = "", hint = "" } = {}) {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.className = "cam";
    root.innerHTML = `
      <video class="cam-video" playsinline autoplay muted></video>
      <div class="cam-frame">
        ${ghostUrl ? ghostMode === "full"
          ? `<img class="cam-ghost full" src="${ghostUrl}" alt="" />`
          : `<div class="cam-strip ${ghostMode}" style="width:${overlap * 100}%"><img src="${ghostUrl}" alt="" style="width:${100 / overlap}%" /></div><i class="cam-seam ${ghostMode}" style="${ghostMode}:${overlap * 100}%"></i>` : ""}
        <div class="cam-grid"></div>
      </div>
      <div class="cam-top">
        <button class="cam-btn" data-c="close" aria-label="Close camera"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
        <div class="cam-text">${title ? `<strong>${title}</strong>` : ""}${hint ? `<span>${hint}</span>` : ""}</div>
      </div>
      <div class="cam-bottom">
        <button class="cam-btn text" data-c="gallery">Gallery</button>
        <button class="cam-shutter" data-c="shoot" aria-label="Take photo"><span></span></button>
        ${ghostUrl ? `<button class="cam-btn text" data-c="ghost">Guide 50%</button>` : `<span class="cam-spacer"></span>`}
      </div>
      <div class="cam-review" hidden>
        <img alt="Photo just taken" />
        <div class="cam-bottom">
          <button class="cam-btn text" data-c="retake">Retake</button>
          <button class="cam-btn text strong" data-c="use">Use photo</button>
        </div>
      </div>
      <p class="cam-msg" hidden></p>`;
    document.body.appendChild(root);
    document.body.classList.add("camera-open");
    const video = root.querySelector("video"), frame = root.querySelector(".cam-frame");
    const review = root.querySelector(".cam-review"), msg = root.querySelector(".cam-msg");
    let stream = null, shot = null, shotUrl = null, opacityStep = 0, meter = null;

    const finish = (result) => {
      clearInterval(meter);
      stream?.getTracks().forEach((t) => t.stop());
      if (shotUrl) URL.revokeObjectURL(shotUrl);
      removeEventListener("resize", fit);
      root.remove();
      document.body.classList.remove("camera-open");
      resolve(result);
    };
    // Keep the guide exactly over the picture (the video is letterboxed to show the whole frame,
    // which is also exactly what gets saved).
    const fit = () => {
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return;
      const r = root.getBoundingClientRect();
      const s = Math.min(r.width / vw, r.height / vh);
      const w = vw * s, h = vh * s;
      Object.assign(frame.style, { width: `${w}px`, height: `${h}px`, left: `${(r.width - w) / 2}px`, top: `${(r.height - h) / 2}px` });
    };
    const setOpacity = () => {
      const o = OPACITY_STEPS[opacityStep];
      root.querySelectorAll(".cam-strip, .cam-ghost").forEach((el) => { el.style.opacity = String(o); });
      root.querySelectorAll(".cam-seam").forEach((el) => { el.style.opacity = o ? "1" : "0"; });
      const btn = root.querySelector('[data-c="ghost"]');
      if (btn) btn.textContent = o ? `Guide ${Math.round(o * 100)}%` : "Guide off";
    };
    const fail = (text) => { msg.textContent = text; msg.hidden = false; };

    root.addEventListener("click", async (e) => {
      const c = e.target.closest("[data-c]")?.dataset.c;
      if (c === "close") finish(null);
      else if (c === "gallery") finish({ gallery: true });
      else if (c === "ghost") { opacityStep = (opacityStep + 1) % OPACITY_STEPS.length; setOpacity(); }
      else if (c === "shoot") {
        if (!video.videoWidth) return;
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        shot = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
        if (!shot) return;
        shotUrl = URL.createObjectURL(shot);
        review.querySelector("img").src = shotUrl;
        review.hidden = false;
      } else if (c === "retake") {
        review.hidden = true;
        URL.revokeObjectURL(shotUrl); shotUrl = null; shot = null;
      } else if (c === "use" && shot) {
        const file = new File([shot], `photo-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
        finish({ blob: file, ghostUsed: !!ghostUrl && OPACITY_STEPS[opacityStep] > 0 });
      }
    });

    addEventListener("resize", fit);
    video.addEventListener("loadedmetadata", () => { fit(); setTimeout(fit, 300); });
    // Alignment meter: a few times a second, compare the guide with the live picture and glow
    // green round the edge when they line up.
    if (ghostUrl) {
      const ref = new Image();
      ref.onload = () => {
        let good = 0, wasAligned = false;
        meter = setInterval(() => {
          if (!video.videoWidth || !review.hidden || !OPACITY_STEPS[opacityStep]) { root.classList.remove("aligned", "close"); return; }
          const score = matchScore(video, ref, ghostMode, overlap);
          good = score >= 0.5 ? good + 1 : 0;
          const aligned = good >= 2;
          root.classList.toggle("aligned", aligned);
          root.classList.toggle("close", !aligned && score >= 0.32);
          if (aligned && !wasAligned) navigator.vibrate?.(20);
          wasAligned = aligned;
        }, 250);
      };
      ref.src = ghostUrl;
    }
    setOpacity();
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } },
      audio: false
    }).then((s) => {
      stream = s;
      video.srcObject = s;
      return video.play().catch(() => {});
    }).catch((error) => {
      console.error(error);
      fail(error?.name === "NotAllowedError"
        ? "Camera access is blocked. Allow the camera for this site in your browser settings, or tap Gallery to choose a photo."
        : "The camera couldn't start. Tap Gallery to choose a photo instead.");
    });
  });
}

/* ---------- how well the live picture matches the guide ----------
   Both are shrunk to a small grey image, turned into edge maps (so exposure changes matter
   less), and compared with normalised cross-correlation over small shifts. 0 = no match, 1 = same. */
const MH = 160;
const work = document.createElement("canvas");
const wctx = work.getContext("2d", { willReadFrequently: true });

function greyRegion(src, sw, sh, fx, fw) {
  // Region from fx to fx + fw (fractions of the width), full height, at MH pixels tall.
  const w = Math.max(12, Math.round((MH * sw * fw) / sh));
  work.width = w; work.height = MH;
  wctx.drawImage(src, sw * fx, 0, sw * fw, sh, 0, 0, w, MH);
  const d = wctx.getImageData(0, 0, w, MH).data;
  const g = new Float32Array(w * MH);
  for (let i = 0; i < g.length; i++) g[i] = 0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2];
  const e = new Float32Array(w * MH);
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    e[i] = Math.abs(g[i + 1] - g[i - 1]) + Math.abs(g[i + w] - g[i - w]);
  }
  // Soften so small misalignments still score.
  const s = new Float32Array(w * MH);
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    s[i] = (e[i] * 4 + e[i - 1] + e[i + 1] + e[i - w] + e[i + w]) / 8;
  }
  return { w, e: s };
}

export function matchScore(video, ref, mode, overlap) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const rw = ref.naturalWidth, rh = ref.naturalHeight;
  // Strip guide: the live picture's edge against the other side of the previous photo.
  const [lx, rx, fw] = mode === "full" ? [0, 0, 1] : mode === "left" ? [0, 1 - overlap, overlap] : [1 - overlap, 0, overlap];
  const A = greyRegion(video, vw, vh, lx, fw);
  const B = greyRegion(ref, rw, rh, rx, fw);
  const w = Math.min(A.w, B.w);
  const maxS = Math.max(3, Math.round(w * 0.12));
  let best = -1;
  for (let dy = -6; dy <= 6; dy += 2) for (let dx = -maxS; dx <= maxS; dx += 2) {
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, n = 0;
    for (let y = 8; y < MH - 8; y += 2) {
      const yb = y + dy;
      for (let x = 2 + Math.max(0, -dx); x < w - 2 - Math.max(0, dx); x += 2) {
        const a = A.e[y * A.w + x], b = B.e[yb * B.w + x + dx];
        sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; n++;
      }
    }
    if (n < 50) continue;
    const cov = sab / n - (sa / n) * (sb / n);
    const v = (saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2);
    const ncc = cov / Math.sqrt(Math.max(1e-6, v));
    if (ncc > best) best = ncc;
  }
  return best;
}
