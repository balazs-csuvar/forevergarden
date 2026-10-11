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
    let stream = null, shot = null, shotUrl = null, opacityStep = 0;

    const finish = (result) => {
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
