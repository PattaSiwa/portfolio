import * as THREE from "three";

// A whirl of autumn leaves and embers that the cursor blows around. Scrolling out of the
// hero gathers them into the </> logo, which then pulses like a heartbeat.
// Falls back silently to the CSS gradient on failure.

const canvas = document.getElementById("bg");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isSmall = () => window.innerWidth < 760;

// If WebGL is unavailable this throws, the canvas stays hidden, and the CSS gradient shows.
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.z = 6;

// Ashima 3D simplex noise
const noise = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
    vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
    return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
`;

const uniforms = {
  uTime: { value: 0 },
  uPixelRatio: { value: renderer.getPixelRatio() },
  uPointer: { value: new THREE.Vector3(0, 0, 0) },
  uPointerStrength: { value: 0 },
  uFade: { value: 1 },
  uMorph: { value: 0 },
};

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
    const k = Math.floor(Math.random() * (filled.length / 2)) * 2;
    const px = filled[k] + Math.random() * 2;
    const py = filled[k + 1] + Math.random() * 2;
    const inside = py > 200 && py < 380;
    const part = inside && px > 130 && px < 220 ? -1 : inside && px > 295 && px < 385 ? 1 : 0;
    pts.push([((px - S / 2) / (S / 2)) * size, (-(py - S / 2) / (S / 2)) * size, (Math.random() - 0.5) * 0.08, part]);
  }
  return pts;
}

// --- Particles ---
const COUNT = isSmall() ? 6000 : 12000;
const seeds = new Float32Array(COUNT);
const vortex = new Float32Array(COUNT * 4); // angle, height phase, spread, speed
const targets = new Float32Array(COUNT * 3);
const parts = new Float32Array(COUNT);
sampleLogo(COUNT, 1.6).forEach(([x, y, z, part], i) => {
  seeds[i] = Math.random();
  vortex.set([Math.random() * Math.PI * 2, Math.random(), Math.random(), Math.random()], i * 4);
  targets.set([x, y, z], i * 3);
  parts[i] = part;
});

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
geo.setAttribute("aVortex", new THREE.BufferAttribute(vortex, 4));
geo.setAttribute("aTarget", new THREE.BufferAttribute(targets, 3));
geo.setAttribute("aPart", new THREE.BufferAttribute(parts, 1));

const mat = new THREE.ShaderMaterial({
  uniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    uniform float uTime, uPixelRatio, uPointerStrength, uMorph;
    uniform vec3 uPointer;
    attribute float aSeed, aPart;
    attribute vec4 aVortex;
    attribute vec3 aTarget;
    varying float vColor, vDepth, vLeaf, vAngle, vFlip, vGlow, vAlpha;
    ${noise}
    void main() {
      float leaf = step(0.88, aSeed);

      // Whirl: particles spiral down a widening funnel, wrapping back to the top,
      // with a noisy breeze so the motion never looks mechanical.
      float h = fract(aVortex.y - uTime * (0.025 + aVortex.w * 0.03));
      float R = (0.15 + h * 1.0) * (0.75 + aVortex.z * 0.5);
      float ang = aVortex.x + uTime * (0.35 + (1.0 - h) * 0.9);
      vec3 whirl = vec3(cos(ang) * R, (h - 0.5) * 3.0, sin(ang) * R);
      vec3 q = whirl * 0.7 + uTime * 0.15;
      whirl += vec3(snoise(q), snoise(q + 17.0), snoise(q + 31.0)) * 0.18;
      float edge = smoothstep(0.0, 0.08, h) * smoothstep(1.0, 0.9, h);

      // Logo heartbeat: a ring ripples out from the centre each beat, lifting and
      // brightening the dots it passes, while "<" and ">" kick apart and settle.
      float ph = fract(uTime * 0.4);
      float beat = exp(-ph * 7.0);
      float r = length(aTarget.xy);
      float ring = exp(-pow((r - ph * 3.2) * 3.5, 2.0)) * (1.0 - ph);
      vec3 logo = aTarget;
      logo.x += aPart * beat * 0.09;
      logo.xy += normalize(aTarget.xy + 1e-4) * ring * 0.04;
      logo.z += ring * 0.22 + snoise(aTarget * 2.5 + uTime * 0.4) * 0.04;

      // Each dot leaves the whirl at its own moment and arcs outward mid-flight
      float m = smoothstep(0.0, 1.0, clamp(uMorph * 1.6 - aSeed * 0.6, 0.0, 1.0));
      vec3 pos = mix(whirl, logo, m) + normalize(whirl + 1e-4) * sin(m * 3.14159) * (0.25 + aSeed * 0.5);

      // Cursor acts as a gust that pushes particles away
      vec2 away = pos.xy - uPointer.xy;
      float gust = (1.0 - smoothstep(0.0, 0.9, length(away))) * uPointerStrength;
      pos.xy += normalize(away + 1e-4) * gust * 0.45;
      pos.z += gust * 0.3;

      float twinkle = 0.7 + 0.3 * sin(uTime * (2.0 + aSeed * 4.0) + aSeed * 40.0);
      vColor = mix(leaf > 0.5 ? aVortex.z * 1.4 - 0.3 : aSeed * 1.7 - 0.6, aTarget.x / 1.6 * 0.7 + 0.3, m);
      vGlow = m * (ring * 1.2 + beat * 0.3 * abs(aPart));
      vAlpha = mix(edge * mix(0.55, 0.9, leaf), twinkle, m);
      vLeaf = leaf * (1.0 - m);
      vAngle = aVortex.x * 3.0 + uTime * (0.6 + aSeed * 1.5);
      vFlip = cos(uTime * (0.8 + aVortex.w) + aVortex.x * 5.0);

      vec4 mv = modelViewMatrix * vec4(pos, 1.0);
      vDepth = mix(smoothstep(-8.0, -4.0, mv.z), 0.85, m);
      gl_Position = projectionMatrix * mv;
      float whirlSize = mix(1.6 + aSeed * 1.6, 9.0 + aVortex.w * 8.0, leaf);
      float logoSize = (1.8 + aSeed * 1.6) * (1.0 + ring * 0.8);
      gl_PointSize = mix(whirlSize, logoSize, m) * uPixelRatio * (5.0 / -mv.z);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uFade;
    varying float vColor, vDepth, vLeaf, vAngle, vFlip, vGlow, vAlpha;
    void main() {
      // Leaf: an almond (two intersecting circles) with a centre vein, spinning and
      // squashed by vFlip so it appears to tumble in 3D. Everything else is a soft dot.
      vec2 p = gl_PointCoord - 0.5;
      float c = cos(vAngle), s = sin(vAngle);
      p = mat2(c, -s, s, c) * p;
      p.x /= max(abs(vFlip), 0.25);
      float leafD = max(length(p - vec2(0.22, 0.0)), length(p + vec2(0.22, 0.0))) - 0.42;
      float leafMask = 1.0 - smoothstep(-0.03, 0.0, leafD);
      leafMask *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.025, abs(p.x))) * step(abs(p.y), 0.3);
      float dotMask = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5));
      float a = mix(dotMask, leafMask, vLeaf);
      if (a < 0.01) discard;

      vec3 brown = vec3(0.45, 0.26, 0.14);
      vec3 rust = vec3(0.72, 0.27, 0.16);
      vec3 orange = vec3(0.91, 0.47, 0.18);
      vec3 gold = vec3(0.96, 0.72, 0.38);
      vec3 col = mix(brown, rust, smoothstep(-0.8, -0.1, vColor));
      col = mix(col, orange, smoothstep(-0.1, 0.5, vColor));
      col = mix(col, gold, smoothstep(0.5, 1.1, vColor));
      col *= mix(1.0, 0.75 + 0.35 * abs(vFlip), vLeaf);
      col = mix(col, vec3(1.0, 0.86, 0.62), clamp(vGlow, 0.0, 1.0) * 0.7);
      gl_FragColor = vec4(col, a * vAlpha * (1.0 + vGlow) * (0.3 + 0.7 * vDepth) * uFade);
    }
  `,
});

const particles = new THREE.Points(geo, mat);
particles.frustumCulled = false; // positions are computed in the shader
const group = new THREE.Group();
group.add(particles);
scene.add(group);

// --- Ambient dust ---
const DUST = isSmall() ? 600 : 1400;
const dustPos = new Float32Array(DUST * 3);
for (let i = 0; i < DUST; i++) {
  dustPos.set(
    [(Math.random() - 0.5) * 22, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 10 - 2],
    i * 3
  );
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({
    color: 0xd9a066,
    size: 0.025,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
);
scene.add(dust);

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

// Hero text sits left on desktop, so the whirl sits right; centered behind on mobile.
const layout = { x: 0, y: 0, scale: 1, fade: 1, logoX: 0, logoY: 0, logoScale: 0.8, morphEnd: 0.5 };
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  uniforms.uPixelRatio.value = renderer.getPixelRatio();
  if (isSmall()) Object.assign(layout, { x: 0, y: -0.7, scale: 0.75, fade: 0.5, logoX: 0, logoY: 0.4, logoScale: 0.6, morphEnd: 0.5 });
  else {
    const x = Math.min(2.6, camera.aspect * 1.2);
    Object.assign(layout, { x, y: 0, scale: 1, fade: 1, logoX: x * 0.9, logoY: 0.35, logoScale: 0.75, morphEnd: 0.5 });
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
  uniforms.uTime.value = t;

  smoothPointer.lerp(pointer, 1 - Math.pow(0.001, dt));
  smoothScroll = reduceMotion ? scrollProgress : smoothScroll + (scrollProgress - smoothScroll) * (1 - Math.pow(0.002, dt));

  // Leaving the hero, the whirl gathers into the logo in the empty space beside the hero text,
  // which then dims to a watermark behind the rest of the page.
  const m = THREE.MathUtils.smoothstep(smoothScroll, 0.05, layout.morphEnd);
  const { lerp } = THREE.MathUtils;
  uniforms.uMorph.value = m;
  group.position.set(lerp(layout.x, layout.logoX, m), lerp(layout.y, layout.logoY, m), -m);
  group.scale.setScalar(lerp(layout.scale, layout.logoScale, m) * (1 + m * Math.sin(t * 1.3) * 0.015));
  group.rotation.y = smoothPointer.x * lerp(0.35, 0.2, m) + m * Math.sin(t * 0.5) * 0.12;
  group.rotation.x = (1 - m) * smoothScroll * 0.4 - smoothPointer.y * lerp(0.25, 0.15, m);
  group.rotation.z = (1 - m) * -0.12;
  uniforms.uFade.value =
    lerp(layout.fade, 1, m) * (1 - 0.85 * THREE.MathUtils.smoothstep(smoothScroll, layout.morphEnd + 0.1, layout.morphEnd + 0.6));

  dust.rotation.y = t * 0.01 + smoothScroll * 0.15;
  dust.position.y = smoothScroll * 0.8;
  camera.position.x = smoothPointer.x * 0.25;
  camera.position.y = smoothPointer.y * 0.15;
  camera.lookAt(0, 0, 0);

  // Where the cursor ray crosses the particles' plane, in their local space
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
