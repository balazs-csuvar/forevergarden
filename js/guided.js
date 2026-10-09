// Guided photo walk: tells you where to stand and what to photograph, then links the views into a walk.
export const GUIDE_STEPS = [
  { key: "house", title: "From the back door", cam: [50, 112], dir: -90, text: "Stand at the back door or on the patio and look straight down the middle of the garden. Get as much of it in as you can." },
  { key: "left", title: "Left-hand border", cam: [55, 70], dir: 180, text: "Walk a few steps in and turn to face the left-hand side. Capture the border from front to back." },
  { key: "right", title: "Right-hand border", cam: [45, 70], dir: 0, text: "From the same spot, turn to face the right-hand side." },
  { key: "far", title: "From the far end", cam: [50, 22], dir: 90, text: "Walk to the far end, turn round, and look back towards the house." },
  { key: "corner", title: "A favourite corner", cam: [28, 38], dir: -45, optional: true, text: "Somewhere you'd like to look at closely: a seating area, a shed, a pond or a special plant. Skip it if there isn't one yet." }
];

// Links between guided views: where each path marker sits on which photo.
export const GUIDE_LINKS = [
  { from: "house", to: "left", x: 0.16, y: 0.6, label: "Left-hand border" },
  { from: "house", to: "right", x: 0.84, y: 0.6, label: "Right-hand border" },
  { from: "house", to: "far", x: 0.5, y: 0.4, label: "To the far end" },
  { from: "left", to: "house", x: 0.5, y: 0.93, label: "Back to the house" },
  { from: "right", to: "house", x: 0.5, y: 0.93, label: "Back to the house" },
  { from: "far", to: "house", x: 0.5, y: 0.55, label: "Back to the house" },
  { from: "far", to: "corner", x: 0.3, y: 0.62, label: "A favourite corner" },
  { from: "corner", to: "far", x: 0.5, y: 0.93, label: "Back" }
];

export const GUIDE_AREAS = {
  house: [{ name: "Left-hand border", x: 0.12, y: 0.6 }, { name: "Right-hand border", x: 0.88, y: 0.6 }, { name: "Middle of the garden", x: 0.5, y: 0.72 }],
  left: [{ name: "Left-hand border", x: 0.5, y: 0.65 }],
  right: [{ name: "Right-hand border", x: 0.5, y: 0.65 }],
  far: [{ name: "Far end", x: 0.5, y: 0.6 }],
  corner: [{ name: "Favourite corner", x: 0.5, y: 0.65 }]
};

// Plan-view diagram: garden from above, house at the bottom, camera position and view direction.
export function guideDiagram(step) {
  const [cx, cy] = step.cam;
  const a = (step.dir * Math.PI) / 180;
  const spread = 0.55, len = 34;
  const p1 = [cx + Math.cos(a - spread) * len, cy + Math.sin(a - spread) * len];
  const p2 = [cx + Math.cos(a + spread) * len, cy + Math.sin(a + spread) * len];
  return `<svg viewBox="0 0 100 140" class="guide-diagram" role="img" aria-label="Plan of the garden showing where to stand">
    <rect x="8" y="8" width="84" height="110" rx="6" fill="#e6ead6" stroke="#8a9a76" stroke-width="1"/>
    <path d="M14 18 q6 -4 12 0 q6 4 12 0" fill="none" stroke="#8a9a76" stroke-width=".8"/>
    <rect x="8" y="118" width="84" height="16" rx="2" fill="#e2dac8" stroke="#9a907a" stroke-width="1"/>
    <text x="50" y="129" text-anchor="middle" font-size="7" fill="#6b6455" font-family="DM Sans, sans-serif">House</text>
    <polygon points="${cx},${cy} ${p1.join(",")} ${p2.join(",")}" fill="rgba(196,111,76,.28)" stroke="#c46f4c" stroke-width=".8"/>
    <circle cx="${cx}" cy="${cy}" r="4" fill="#2f3f2c"/>
    <circle cx="${cx}" cy="${cy}" r="1.6" fill="#fbf8f1"/>
  </svg>`;
}
