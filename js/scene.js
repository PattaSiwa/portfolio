import * as THREE from "three";

// An autumn tree in the hero with leaves constantly falling and piling up at its base.
// The cursor acts like wind. Scrolling out of the hero sends the leaves off the tree to form
// the </> logo, which pulses gently and then fades away. Falls back to a plain background.

const canvas = document.getElementById("bg");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isSmall = () => window.innerWidth < 760;

// If WebGL is unavailable this throws and the canvas stays hidden.
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.z = 6;

// Seeded random so the tree looks the same on every visit
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(11);

const GROUND_Y = -1.75;
const uniforms = {
  uTime: { value: 0 },
  uPixelRatio: { value: renderer.getPixelRatio() },
  uPointer: { value: new THREE.Vector3(0, 0, 0) },
  uPointerStrength: { value: 0 },
  uFade: { value: 1 },
  uMorph: { value: 0 },
  uCenterZ: { value: 0 },
};

// --- Tree: recursive branches as faceted, lit cylinders ---
// Fog darkens the branches at the back so the crown reads as 3D.
scene.fog = new THREE.Fog(0x161412, 4.6, 8.5);
scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const sun = new THREE.DirectionalLight(0xffe2c4, 2.2);
sun.position.set(-3, 4, 5);
scene.add(sun);

const group = new THREE.Group();
scene.add(group);
const barkMat = new THREE.MeshLambertMaterial({ color: 0x6b4630, flatShading: true, transparent: true });
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
const tips = [];

function grow(start, dir, len, radius, depth) {
  const end = start.clone().addScaledVector(dir, len);
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.7, radius, len, 7), barkMat);
  branch.position.copy(start).lerp(end, 0.5);
  branch.quaternion.setFromUnitVectors(UP, dir);
  group.add(branch);
  if (depth <= 2) tips.push(end);
  if (depth === 0) return;

  // Children lean away from the parent at evenly spread angles all the way around it,
  // so the crown fills out toward and away from the camera, not just side to side
  const u = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) < 0.95 ? UP : X).normalize();
  const v = new THREE.Vector3().crossVectors(dir, u);
  const n = depth >= 4 ? 2 : rand() < 0.5 ? 2 : 3;
  const spin = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.6;
    const axis = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));
    const child = dir
      .clone()
      .applyAxisAngle(axis, 0.4 + rand() * 0.4)
      .add(new THREE.Vector3(0, 0.2, 0))
      .normalize();
    grow(end, child, len * (0.72 + rand() * 0.1), radius * 0.68, depth - 1);
  }
}
grow(new THREE.Vector3(0, GROUND_Y, 0), UP.clone(), 0.85, 0.1, 5);

// --- Logo targets: the "</>" browser-window mark, drawn to a canvas and sampled ---
// Each target also records which part it belongs to: -1 for "<", +1 for ">", 0 otherwise.
function sampleLogo(count, size) {
  const S = 512;
  const ctx = Object.assign(document.createElement("canvas"), { width: S, height: S }).getContext("2d", {
    willReadFrequently: true,
  });
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const path = (...pts) => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  };
  ctx.beginPath();
  ctx.roundRect(40, 60, 432, 392, 28);
  ctx.stroke();
  path(40, 130, 472, 130); // title bar
  path(205, 230, 150, 290, 205, 350); // <
  path(285, 215, 230, 365); // /
  path(310, 230, 365, 290, 310, 350); // >

  const data = ctx.getImageData(0, 0, S, S).data;
  const filled = [];
  for (let y = 0; y < S; y += 2)
    for (let x = 0; x < S; x += 2) if (data[(y * S + x) * 4 + 3] > 128) filled.push(x, y);

  const pts = [];
  for (let i = 0; i < count; i++) {
    const k = Math.floor(rand() * (filled.length / 2)) * 2;
    const px = filled[k] + rand() * 2;
    const py = filled[k + 1] + rand() * 2;
    const inside = py > 200 && py < 380;
    const part = inside && px > 130 && px < 220 ? -1 : inside && px > 295 && px < 385 ? 1 : 0;
    pts.push([((px - S / 2) / (S / 2)) * size, (-(py - S / 2) / (S / 2)) * size, (rand() - 0.5) * 0.08, part]);
  }
  return pts.sort((a, b) => b[1] - a[1]);
}

// --- Leaves: canopy clusters around the branch tips, some falling, some on the ground ---
const KIND = { canopy: 0, falling: 1, ground: 2 };
const PALETTE = [0xb8462a, 0xe07b39, 0xe8a94a, 0xd0602e, 0xe07b39, 0x9c3520, 0xf0b85a].map((c) => new THREE.Color(c));
const COUNT = isSmall() ? 1800 : 3600;
const GROUND = Math.round(COUNT * 0.09);
const FALLING = Math.round(COUNT * 0.09);

const leaves = [];
for (let i = 0; i < COUNT; i++) {
  let pos;
  let kind = KIND.canopy;
  if (i < GROUND) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand());
    pos = new THREE.Vector3(Math.cos(a) * r * 1.3, GROUND_Y + rand() * 0.02, Math.sin(a) * r * 0.45);
    kind = KIND.ground;
  } else {
    let o;
    do o = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    while (o.lengthSq() > 1);
    pos = tips[Math.floor(rand() * tips.length)].clone().addScaledVector(o, 0.42);
    if (i < GROUND + FALLING) kind = KIND.falling;
  }
  leaves.push({ pos, kind, seed: rand(), color: PALETTE[Math.floor(rand() * PALETTE.length)] });
}
// Pair leaves with logo targets top to bottom, so the morph mostly slides sideways
leaves.sort((a, b) => b.pos.y - a.pos.y);
const logo = sampleLogo(COUNT, 1.6);

const attr = (size) => new Float32Array(COUNT * size);
const [start, target, color, seed, kind, part] = [attr(3), attr(3), attr(3), attr(1), attr(1), attr(1)];
leaves.forEach((l, i) => {
  start.set([l.pos.x, l.pos.y, l.pos.z], i * 3);
  target.set(logo[i].slice(0, 3), i * 3);
  color.set([l.color.r, l.color.g, l.color.b], i * 3);
  seed[i] = l.seed;
  kind[i] = l.kind;
  part[i] = logo[i][3];
});

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(attr(3), 3));
geo.setAttribute("aStart", new THREE.BufferAttribute(start, 3));
geo.setAttribute("aTarget", new THREE.BufferAttribute(target, 3));
geo.setAttribute("aColor", new THREE.BufferAttribute(color, 3));
geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
geo.setAttribute("aKind", new THREE.BufferAttribute(kind, 1));
geo.setAttribute("aPart", new THREE.BufferAttribute(part, 1));

const leafMat = new THREE.ShaderMaterial({
  uniforms,
  transparent: true,
  vertexShader: /* glsl */ `
    uniform float uTime, uPixelRatio, uPointerStrength, uMorph, uCenterZ;
    uniform vec3 uPointer;
    attribute vec3 aStart, aTarget, aColor;
    attribute float aSeed, aKind, aPart;
    varying vec3 vColor;
    varying float vAngle, vFlip, vShade;
    void main() {
      vec3 tree = aStart;
      float flip = 0.85 + 0.15 * cos(uTime * (1.0 + aSeed) + aSeed * 20.0);
      float angle = aSeed * 6.28;
      float size = 1.0;
      float wind = 0.12;

      if (aKind < 0.5) {
        // Canopy: rustle in place
        tree.x += sin(uTime * 1.3 + aStart.y * 2.0 + aSeed * 6.0) * 0.02;
        tree.y += cos(uTime * 1.1 + aSeed * 9.0) * 0.01;
      } else if (aKind < 1.5) {
        // Falling: loop from the canopy to the ground, sway and tumble on the way down,
        // rest on the ground for a bit, then shrink away and start again
        float ft = fract(uTime * (0.05 + aSeed * 0.04) + aSeed * 13.0);
        float fc = min(ft, 0.8);
        float fall = fc / 0.8;
        tree.y = mix(aStart.y, ${GROUND_Y.toFixed(2)} + 0.03, fall);
        tree.x += sin(fc * 30.0 + aSeed * 20.0) * 0.2 * fall + 0.35 * fall;
        tree.z += cos(fc * 24.0 + aSeed * 31.0) * 0.15 * fall;
        flip = mix(cos(fc * 40.0 + aSeed * 30.0), 0.3, smoothstep(0.78, 0.8, ft));
        angle += fc * 20.0;
        size = smoothstep(0.0, 0.05, ft) * (1.0 - smoothstep(0.92, 1.0, ft));
        wind = 0.35;
      } else {
        // Ground: lying flat
        flip = 0.3;
        wind = 0.05;
      }

      // Logo pulse: a ring ripples out from the centre each beat, and "<" ">" nudge apart
      float ph = fract(uTime * 0.4);
      float beat = exp(-ph * 7.0);
      float ring = exp(-pow((length(aTarget.xy) - ph * 3.2) * 3.5, 2.0)) * (1.0 - ph);
      vec3 logo = aTarget;
      logo.x += aPart * beat * 0.09;
      logo.z += ring * 0.2;

      // Each leaf leaves the tree at its own moment and arcs outward mid-flight
      float m = smoothstep(0.0, 1.0, clamp(uMorph * 1.6 - aSeed * 0.6, 0.0, 1.0));
      vec3 pos = mix(tree, logo, m) + normalize(tree + 1e-4) * sin(m * 3.14159) * (0.2 + aSeed * 0.4);

      // Cursor gusts push leaves aside
      vec2 away = pos.xy - uPointer.xy;
      float push = (1.0 - smoothstep(0.0, 0.8, length(away))) * uPointerStrength;
      pos.xy += normalize(away + 1e-4) * push * mix(wind, 0.15, m);

      vColor = aColor;
      // Leaves at the back of the crown are darker, the front ones brighter
      float depth = (modelMatrix * vec4(pos, 1.0)).z - uCenterZ;
      float depthShade = mix(mix(0.55, 1.1, smoothstep(-1.3, 1.3, depth)), 1.0, m);
      vShade = (0.82 + 0.18 * aSeed) * depthShade * (1.0 + m * ring * 0.5);
      vAngle = angle;
      vFlip = mix(flip, 1.0, m);

      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = mix((14.0 + aSeed * 7.0) * size, 8.0 + aSeed * 2.5, m) * (1.0 + m * ring * 0.5)
        * uPixelRatio * (5.0 / -mv.z);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uFade;
    varying vec3 vColor;
    varying float vAngle, vFlip, vShade;
    void main() {
      // Maple leaf, spun by vAngle and squashed by vFlip so it appears to tumble.
      // The outline is a polar curve around the leaf's centre: five pointed lobes (the lower
      // pair smaller), small serrated teeth, veins out to each lobe tip, and a short stem.
      vec2 p = gl_PointCoord - 0.5;
      p.y = -p.y;
      float c = cos(vAngle), s = sin(vAngle);
      p = mat2(c, -s, s, c) * p;
      p.x /= max(abs(vFlip), 0.2);

      vec2 q = p - vec2(0.0, 0.04);
      float r = length(q);
      float theta = atan(q.x, q.y); // 0 points up, +-PI points down at the stem
      float lobes = pow(abs(cos(theta * 2.5)), 1.5);
      float teeth = pow(abs(cos(theta * 12.5)), 8.0) * 0.06;
      float lower = mix(1.0, 0.65, smoothstep(1.6, 2.6, abs(theta)));
      float edge = (0.19 + 0.26 * lobes + teeth) * lower * 0.85;
      bool stem = abs(p.x) < 0.018 && p.y < 0.0 && p.y > -0.38;
      if (r > edge && !stem) discard;

      float toLobe = mod(theta + 0.6283, 1.2566) - 0.6283; // angle to the nearest lobe tip
      float vein = 1.0 - 0.25 * (1.0 - smoothstep(0.008, 0.016, abs(sin(toLobe)) * r)) * step(r, edge * 0.85);
      vec3 col = r > edge ? vec3(0.36, 0.21, 0.12) : vColor * vein;
      gl_FragColor = vec4(col * vShade, uFade);
    }
  `,
});
group.add(new THREE.Points(geo, leafMat));

// --- Interaction state ---
const pointer = new THREE.Vector2(0, 0);
const smoothPointer = new THREE.Vector2(0, 0);
let pointerActive = 0;
let scrollProgress = 0;
let smoothScroll = 0;

window.addEventListener(
  "pointermove",
  (e) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    pointerActive = 1;
  },
  { passive: true }
);
document.addEventListener("pointerleave", () => (pointerActive = 0));
window.addEventListener(
  "scroll",
  () => (scrollProgress = Math.min(window.scrollY / window.innerHeight, 3)),
  { passive: true }
);

// Hero text sits left on desktop, so the tree sits right; centered behind on mobile.
const layout = { x: 0, y: 0, scale: 1, fade: 1, logoX: 0, logoY: 0, logoScale: 0.8, morphEnd: 0.5 };
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  uniforms.uPixelRatio.value = renderer.getPixelRatio();
  if (isSmall()) Object.assign(layout, { x: 0, y: -0.5, scale: 0.75, fade: 0.35, logoX: 0, logoY: 0.4, logoScale: 0.6, morphEnd: 0.5 });
  else {
    const x = Math.min(2.5, camera.aspect * 1.15);
    Object.assign(layout, { x, y: 0, scale: 1, fade: 1, logoX: x, logoY: 0.3, logoScale: 0.7, morphEnd: 0.5 });
  }
}
resize();
window.addEventListener("resize", resize);

const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const hit = new THREE.Vector3();
const inv = new THREE.Matrix4();

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  const { lerp, smoothstep } = THREE.MathUtils;
  uniforms.uTime.value = t;

  smoothPointer.lerp(pointer, 1 - Math.pow(0.001, dt));
  smoothScroll = reduceMotion ? scrollProgress : smoothScroll + (scrollProgress - smoothScroll) * (1 - Math.pow(0.002, dt));

  // Leaving the hero, the leaves fly off the tree into the logo beside the hero text,
  // which then fades out completely before the rest of the page scrolls in.
  const m = smoothstep(smoothScroll, 0.05, layout.morphEnd);
  const fade = lerp(layout.fade, 1, m) * (1 - smoothstep(smoothScroll, layout.morphEnd + 0.1, layout.morphEnd + 0.6));
  uniforms.uMorph.value = m;
  uniforms.uFade.value = fade;
  barkMat.opacity = layout.fade * (1 - smoothstep(m, 0, 0.4));
  group.position.set(lerp(layout.x, layout.logoX, m), lerp(layout.y, layout.logoY, m), -m);
  group.scale.setScalar(lerp(layout.scale, layout.logoScale, m));
  uniforms.uCenterZ.value = group.position.z;
  group.rotation.y = smoothPointer.x * 0.35 + (1 - m) * Math.sin(t * 0.15) * 0.6;
  group.rotation.x = -smoothPointer.y * 0.12;

  // Where the cursor ray crosses the tree's plane, in its local space
  group.updateMatrixWorld();
  plane.constant = -group.position.z;
  raycaster.setFromCamera(smoothPointer, camera);
  const target = raycaster.ray.intersectPlane(plane, hit) ? pointerActive : 0;
  if (target) uniforms.uPointer.value.copy(hit).applyMatrix4(inv.copy(group.matrixWorld).invert());
  uniforms.uPointerStrength.value += (target - uniforms.uPointerStrength.value) * (1 - Math.pow(0.01, dt));

  renderer.render(scene, camera);
}

if (reduceMotion) {
  frame();
  window.addEventListener("resize", frame);
  window.addEventListener("scroll", frame, { passive: true });
} else {
  renderer.setAnimationLoop(frame);
}
requestAnimationFrame(() => canvas.classList.add("ready"));
