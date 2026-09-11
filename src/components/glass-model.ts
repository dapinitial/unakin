/**
 * <glass-model model="/models/heart.glb" mode="shatter|assemble" reveal="view|load" spread="2.6" hold="1500" pulse="heart|brain">
 *
 * A three.js canvas that fills its host element and renders a fractured GLB as GLASS:
 * physical transmission (real refraction) + environment reflections + bloom, a magenta rim
 * light on one side and a cyan one on the other, energy flowing along every crease/vessel
 * line (animated dashed edges), a flash-in reveal, cursor tilt, and a scroll-driven explode
 * where every mesh in the GLB is a shard.
 *
 *   mode="shatter"  — intact at rest, flies apart as the host scrolls out of view (hero).
 *   mode="assemble" — starts shattered, pulls together as the host scrolls into view.
 *   pulse="heart"   — a real lub-dub beat (~64 bpm) that also surges the energy lines.
 *   pulse="brain"   — slow thinking breath + random synaptic flickers.
 *
 * Light-DOM children (the SVG line-art loading state) render in a slot above the canvas; the
 * host gets data-view when on screen, data-loaded when the glass has flashed in, data-error if
 * the model failed, and a --p custom property (0 intact → 1 exploded) for page CSS.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const PINK = 0xff4fd8, CYAN = 0x4fe3ff;
const TINT = new THREE.Color(0x86e9ff);   // cyan-teal glass body (the reference's blown glass)
const ENERGY = 0xa8f7ff;                  // the light that runs through the veins

function glassMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xe6fbff, metalness: 0, roughness: 0.14,
    transmission: 1, thickness: 0.9, ior: 1.5,
    attenuationColor: TINT, attenuationDistance: 0.4,
    clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.45, specularIntensity: 1,
    transparent: true, opacity: 1,
    emissive: new THREE.Color(ENERGY), emissiveIntensity: 0,
  });
}

interface Shard { mesh: THREE.Mesh; home: THREE.Vector3; dir: THREE.Vector3; tumble: THREE.Euler }

export class GlassModel extends HTMLElement {
  #abort = new AbortController();
  #frameId = 0;
  #renderer: THREE.WebGLRenderer | null = null;
  #composer: EffectComposer | null = null;
  #scrollTrigger: ScrollTrigger | null = null;
  #tweens: (gsap.core.Tween | gsap.core.Timeline)[] = [];
  #visible = false;
  #revealed = false;

  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>:host{display:block;position:relative;}canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;}slot{display:block;position:absolute;inset:0;pointer-events:none;}</style><canvas></canvas><slot></slot>`;
    const canvas = shadow.querySelector('canvas')!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const url = this.getAttribute('model') ?? '/models/heart.glb';
    const mode = this.getAttribute('mode') === 'assemble' ? 'assemble' : 'shatter';
    const revealOn = this.getAttribute('reveal') === 'load' ? 'load' : 'view';
    const pulse = this.getAttribute('pulse') ?? 'heart';
    const SPREAD = parseFloat(this.getAttribute('spread') ?? '2.6');
    const HOLD = reduced ? 0 : parseInt(this.getAttribute('hold') ?? '0', 10);
    const seenAt = { t: revealOn === 'load' ? performance.now() : 0 };
    const W = () => Math.max(1, this.clientWidth), H = () => Math.max(1, this.clientHeight);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, W() / H(), 0.1, 100);
    camera.position.set(0, 0, 4);
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(W(), H(), false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.85;
    this.#renderer = renderer;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Two-tone rim: magenta low-left, cyan high-right (the reference's neon split), white key.
    scene.add(new THREE.AmbientLight(0x6f8cff, 0.1));
    const key = new THREE.DirectionalLight(0xffffff, 0.45); key.position.set(1.5, 3, 4); scene.add(key);
    // Rim placement: wide and a little behind the model so the colour lands on the silhouette.
    const pink = new THREE.PointLight(PINK, 22, 16); pink.position.set(-3.0, -1.2, 0.4); scene.add(pink);
    const cyan = new THREE.PointLight(CYAN, 15, 16); cyan.position.set(2.8, 1.8, 0.6); scene.add(cyan);
    const core = new THREE.PointLight(ENERGY, 0, 6); scene.add(core);

    const composer = new EffectComposer(renderer);
    composer.setSize(W(), H());
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.34, 0.3, 0.84));
    composer.addPass(new OutputPass());
    this.#composer = composer;

    let targetX = 0, targetY = 0;
    window.addEventListener('mousemove', (e) => {
      const r = this.getBoundingClientRect();
      targetX = ((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 0.7;
      targetY = ((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * 0.5;
    }, { signal: this.#abort.signal, passive: true });

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const shards: Shard[] = [];
    const meshMats: THREE.MeshPhysicalMaterial[] = [];
    const edgeMats: THREE.LineDashedMaterial[] = [];
    const pivot = new THREE.Group(); scene.add(pivot);
    let progress = mode === 'assemble' ? 1 : 0; // 0 = intact, 1 = fully exploded
    const beat = { v: 0 };                        // 0 rest → 1 peak; drives light + energy surge
    let edgeBase = 0;                             // resting opacity of the energy lines (set by reveal)

    const apply = () => {
      for (const s of shards) {
        s.mesh.position.copy(s.home).addScaledVector(s.dir, progress * SPREAD);
        s.mesh.rotation.set(s.tumble.x * progress, s.tumble.y * progress, s.tumble.z * progress);
      }
      this.style.setProperty('--p', progress.toFixed(3));
    };

    loader.load(url, (gltf) => {
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3()).length() || 1;
      const s = 2.7 / size; root.scale.setScalar(s);
      const center = box.getCenter(new THREE.Vector3()).multiplyScalar(s);
      root.updateMatrixWorld(true);

      const meshes: THREE.Mesh[] = [];
      root.traverse((c) => { if ((c as THREE.Mesh).isMesh) meshes.push(c as THREE.Mesh); });
      for (const mesh of meshes) {
        const mat = glassMaterial(); mesh.material = mat; meshMats.push(mat);
        // Energy lines: dashed segments along every crease / vessel / shard border, flowing.
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry, 30),
          new THREE.LineDashedMaterial({ color: ENERGY, dashSize: 0.06 / s, gapSize: 0.22 / s, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        edges.computeLineDistances();
        edgeMats.push(edges.material as THREE.LineDashedMaterial);
        mesh.add(edges);
        mesh.geometry.computeBoundingBox();
        const centroid = mesh.geometry.boundingBox!.getCenter(new THREE.Vector3());
        mesh.localToWorld(centroid).multiplyScalar(s).sub(center);
        if (centroid.lengthSq() < 1e-4) centroid.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
        shards.push({
          mesh, home: mesh.position.clone(), dir: centroid.normalize(),
          tumble: new THREE.Euler((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2),
        });
      }
      root.position.sub(center);
      pivot.add(root);
      apply();
      // Hand the page the model's on-screen box (its x/y bounds at the model's mid-depth,
      // projected through this camera) so the SVG outline can be pinned exactly onto the glass.
      const min = box.min.clone().multiplyScalar(s).sub(center), max = box.max.clone().multiplyScalar(s).sub(center);
      const a = new THREE.Vector3(min.x, max.y, 0).project(camera), b = new THREE.Vector3(max.x, min.y, 0).project(camera);
      const l = (a.x + 1) / 2 * 100, t = (1 - a.y) / 2 * 100, r = (b.x + 1) / 2 * 100, btm = (1 - b.y) / 2 * 100;
      this.style.setProperty('--ol', `${l.toFixed(2)}%`); this.style.setProperty('--ot', `${t.toFixed(2)}%`);
      this.style.setProperty('--ow', `${(r - l).toFixed(2)}%`); this.style.setProperty('--oh', `${(btm - t).toFixed(2)}%`);
      // Tuning hook (used by the design review tooling; harmless in prod).
      (this as any)._dbg = { meshMats, edgeMats, core, pink, cyan, beat, root, get edgeBase() { return edgeBase; }, setBase: (v: number) => (edgeBase = v), render: () => composer.render() };

      if (!reduced) {
        if (pulse === 'heart') {
          // Lub-dub: sharp systole, quick relax, softer second beat, rest. ~64 bpm.
          const S = s;
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.34 });
          tl.to(root.scale, { x: S * 1.06, y: S * 1.06, z: S * 1.06, duration: 0.11, ease: 'power3.out' }, 0)
            .to(beat, { v: 1, duration: 0.09, ease: 'power2.out' }, 0)
            .to(root.scale, { x: S, y: S, z: S, duration: 0.17, ease: 'power2.in' }, 0.11)
            .to(beat, { v: 0.25, duration: 0.2, ease: 'power2.in' }, 0.09)
            .to(root.scale, { x: S * 1.03, y: S * 1.03, z: S * 1.03, duration: 0.1, ease: 'power3.out' }, 0.3)
            .to(beat, { v: 0.7, duration: 0.08, ease: 'power2.out' }, 0.3)
            .to(root.scale, { x: S, y: S, z: S, duration: 0.24, ease: 'power2.inOut' }, 0.4)
            .to(beat, { v: 0, duration: 0.3, ease: 'power2.in' }, 0.38);
          this.#tweens.push(tl);
        } else {
          // Brain: slow breath + random synaptic flickers.
          this.#tweens.push(gsap.to(root.scale, { x: s * 1.02, y: s * 1.02, z: s * 1.02, repeat: -1, yoyo: true, duration: 1.9, ease: 'sine.inOut' }));
          const flicker = gsap.timeline({ repeat: -1, repeatDelay: 0.9, onRepeat: () => flicker.repeatDelay(0.4 + Math.random() * 1.6) });
          flicker.to(beat, { v: 1, duration: 0.07, ease: 'power3.out' }).to(beat, { v: 0, duration: 0.45, ease: 'power2.in' });
          this.#tweens.push(flicker);
        }
      }

      this.#scrollTrigger = ScrollTrigger.create({
        trigger: this, scrub: 0.6,
        start: mode === 'assemble' ? 'top 90%' : 'top 12%',
        end: mode === 'assemble' ? 'center 45%' : 'bottom top',
        onUpdate: (self) => { progress = mode === 'assemble' ? 1 - self.progress : self.progress; apply(); },
      });
      if (revealOn === 'load' || this.#visible) this.#scheduleReveal(seenAt.t, HOLD, meshMats, edgeMats, core, reduced, (v) => (edgeBase = v));
    }, undefined, (e) => { console.error('glass-model load error:', url, e); this.setAttribute('data-error', ''); });

    const io = new IntersectionObserver((entries) => {
      this.#visible = entries.some((e) => e.isIntersecting);
      if (this.#visible) {
        if (!seenAt.t) seenAt.t = performance.now();
        this.setAttribute('data-view', '');
        if (meshMats.length && !this.#revealed) this.#scheduleReveal(seenAt.t, HOLD, meshMats, edgeMats, core, reduced, (v) => (edgeBase = v));
      }
    }, { threshold: 0.2 });
    io.observe(this);
    this.#abort.signal.addEventListener('abort', () => io.disconnect());

    let last = performance.now();
    const animate = () => {
      this.#frameId = requestAnimationFrame(animate);
      const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!this.#visible) return;
      pivot.rotation.y += 0.06 * (targetX - pivot.rotation.y);
      pivot.rotation.x += 0.06 * (targetY - pivot.rotation.x);
      if (!reduced) {
        pivot.rotation.z = Math.sin(now * 0.00035) * 0.06;
        this.style.setProperty('--rz', `${(-pivot.rotation.z * 57.2958).toFixed(2)}deg`); // keeps the SVG ghost swaying with the glass
        // Energy flows along the lines; a beat surges its brightness, speed, and the inner light.
        const flow = (pulse === 'heart' ? 0.9 : 0.5) * (1 + beat.v * 2.5) * dt;
        for (const m of edgeMats) { m.dashOffset -= flow; m.opacity = edgeBase * (1 + beat.v * 0.9); }
        core.intensity = this.#revealed ? 0.35 + beat.v * 3.2 : core.intensity;
        pink.intensity = 22 + beat.v * 8;
      }
      composer.render();
    };
    animate();

    const onResize = () => {
      camera.aspect = W() / H(); camera.updateProjectionMatrix();
      renderer.setSize(W(), H(), false); composer.setSize(W(), H());
    };
    const ro = new ResizeObserver(onResize); ro.observe(this);
    this.#abort.signal.addEventListener('abort', () => ro.disconnect());
  }

  #scheduleReveal(seenAt: number, hold: number, meshMats: THREE.MeshPhysicalMaterial[], edgeMats: THREE.LineDashedMaterial[], core: THREE.PointLight, reduced: boolean, setBase: (v: number) => void) {
    if (this.#revealed) return;
    this.#revealed = true;
    const wait = Math.max(0, seenAt + hold - performance.now());
    const t = setTimeout(() => this.#reveal(meshMats, edgeMats, core, reduced, setBase), wait);
    this.#abort.signal.addEventListener('abort', () => clearTimeout(t));
  }

  // Reveal: the glass is never hidden — the energy lines flare on, a bright emissive pulse runs
  // through the glass, an internal light bursts, then everything settles into the living state.
  #reveal(meshMats: THREE.MeshPhysicalMaterial[], edgeMats: THREE.LineDashedMaterial[], core: THREE.PointLight, reduced: boolean, setBase: (v: number) => void) {
    this.setAttribute('data-loaded', '');
    if (reduced) { edgeMats.forEach((m) => (m.opacity = 0.35)); setBase(0.35); return; }
    const base = { v: 0 };
    const tl = gsap.timeline({ onUpdate: () => setBase(base.v) });
    tl.to(base, { v: 1, duration: 0.45, ease: 'power2.out' }, 0);
    tl.to(meshMats, { emissiveIntensity: 1.4, duration: 0.22, ease: 'power2.in' }, 0.18);
    tl.to(meshMats, { emissiveIntensity: 0, duration: 0.95, ease: 'power2.out' }, 0.4);
    tl.fromTo(core, { intensity: 7 }, { intensity: 0.35, duration: 1.0, ease: 'power2.out' }, 0.18);
    tl.to(base, { v: 0.55, duration: 0.9, ease: 'power2.out' }, 0.7);
    this.#tweens.push(tl);
  }

  disconnectedCallback() {
    this.#abort.abort();
    cancelAnimationFrame(this.#frameId);
    this.#tweens.forEach((t) => t.kill());
    this.#scrollTrigger?.kill();
    this.#composer?.dispose?.();
    this.#renderer?.dispose();
  }
}

customElements.define('glass-model', GlassModel);
