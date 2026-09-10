/**
 * <heart-model> — full-viewport three.js canvas rendering a GLASS anatomical form.
 * Physical transmission (real refraction) + environment reflections + bloom glow,
 * a flash-in reveal, cursor tilt, and a scroll-driven shatter.
 *
 * Two source modes:
 *   • model="/models/heart.glb"  → a single (ideally Blender cell-fractured) GLB; every
 *     mesh becomes a shard that explodes outward from its own centroid on scroll.
 *   • src="/models/heart/"       → the legacy 7-segment love heart (folder of .glb parts).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const LOVE_PARTS = ['love.glb', 'love1.glb', 'love2.glb', 'love2a.glb', 'love3.glb', 'love4.glb', 'love5.glb'];
// Legacy per-part trajectory (folder mode).
const LOVE_MOVES: ((p: number) => THREE.Vector3)[] = [
  (p) => new THREE.Vector3(-p / 0.3, p / 0.3, -p / 0.3),
  (p) => new THREE.Vector3(-p / 0.3, 0, p / 0.3),
  (p) => new THREE.Vector3(p / 0.3, 0, p / 0.3),
  (p) => new THREE.Vector3(-p / 0.3, p / 0.3, p / 0.3),
  (p) => new THREE.Vector3(p / 0.3, -p / 0.3, p / 0.3),
  (p) => new THREE.Vector3(p / 0.3, 0, p / 0.3),
  (p) => new THREE.Vector3(p / 0.3, 0, p / 0.3),
];

const TINT = new THREE.Color(0x9ab4ff); // cool violet-blue glass tint
const SPREAD = 2.6;                      // how far shards fly on full scroll (single-GLB mode)

function glassMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.06,
    transmission: 1, thickness: 1.4, ior: 1.46,
    attenuationColor: TINT, attenuationDistance: 2.2,
    clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.5,
    transparent: true, opacity: 1,
    emissive: new THREE.Color(0xbcc0ff), emissiveIntensity: 0,
  });
}

// An animated object carries an update(progress)→void that positions it as the page scrolls.
interface Shard extends THREE.Object3D { userData: { update: (p: number) => void } & Record<string, any> }

export class HeartModel extends HTMLElement {
  #abort = new AbortController();
  #frameId = 0;
  #renderer: THREE.WebGLRenderer | null = null;
  #composer: EffectComposer | null = null;
  #scrollTrigger: ScrollTrigger | null = null;
  #tweens: gsap.core.Tween[] = [];

  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>canvas{position:fixed;inset:0;z-index:1;pointer-events:none;}</style><canvas></canvas>`;
    const canvas = shadow.querySelector('canvas')!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const W = () => window.innerWidth, H = () => window.innerHeight;

    const singleModel = this.getAttribute('model');        // single multi-mesh GLB
    const folder = this.getAttribute('src') ?? '/models/heart/'; // legacy 7-part folder

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 1000);
    camera.position.set(0, 0, 3);
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(W(), H());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    this.#renderer = renderer;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(2, 3, 4); scene.add(key);
    const violet = new THREE.PointLight(0x6d4aff, 6, 12); violet.position.set(-2.4, -0.6, 1.5); scene.add(violet);
    const mint = new THREE.PointLight(0x8bf0cf, 4, 12); mint.position.set(2.4, 1.2, 1.8); scene.add(mint);
    const core = new THREE.PointLight(0xbcc0ff, 0, 6); scene.add(core);

    const composer = new EffectComposer(renderer);
    composer.setSize(W(), H());
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.55, 0.6, 0.72));
    composer.addPass(new OutputPass());
    this.#composer = composer;

    let targetX = 0, targetY = 0;
    window.addEventListener('mousemove', (e) => {
      targetX = (e.clientX - W() / 2) * 0.004; targetY = (e.clientY - H() / 2) * 0.004;
    }, { signal: this.#abort.signal });

    const loader = new GLTFLoader();
    const spin: THREE.Object3D[] = [];         // objects that tilt toward the cursor
    const shards: Shard[] = [];                // objects driven by the scroll
    const meshMats: THREE.MeshPhysicalMaterial[] = [];
    const edgeMats: THREE.LineBasicMaterial[] = [];

    // Turn a mesh into glass + a glowing outline; collect its materials for the reveal.
    const glassify = (mesh: THREE.Mesh) => {
      const mat = glassMaterial(); mesh.material = mat; meshMats.push(mat);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(mesh.geometry, 25),
        new THREE.LineBasicMaterial({ color: 0xbcc0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      edgeMats.push(edges.material as THREE.LineBasicMaterial);
      mesh.add(edges);
    };

    const wireScroll = () => {
      this.#scrollTrigger = ScrollTrigger.create({
        trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: true,
        onUpdate: (self) => { for (const s of shards) s.userData.update(self.progress); },
      });
    };

    if (singleModel) {
      // ── Single fractured GLB: each mesh is a shard exploding from its centroid ──
      loader.load(singleModel, (gltf) => {
        const root = gltf.scene;
        // Normalize scale to a comfortable hero size.
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3()).length() || 1;
        const s = 2.6 / size; root.scale.setScalar(s);
        const center = box.getCenter(new THREE.Vector3()).multiplyScalar(s);

        const meshes: THREE.Mesh[] = [];
        root.updateMatrixWorld(true);
        root.traverse((c) => { if ((c as THREE.Mesh).isMesh) meshes.push(c as THREE.Mesh); });
        for (const mesh of meshes) {
          glassify(mesh);
          const home = mesh.position.clone();
          const world = mesh.getWorldPosition(new THREE.Vector3()).multiplyScalar(s);
          const dir = world.sub(center); if (dir.lengthSq() < 1e-4) dir.set((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5));
          dir.normalize();
          const sh = mesh as unknown as Shard;
          sh.userData.update = (p: number) => { mesh.position.copy(home).addScaledVector(dir, p * SPREAD); };
          shards.push(sh);
        }
        root.position.sub(center); // recenter on origin
        scene.add(root); spin.push(root);
        if (!reduced) this.#tweens.push(gsap.to(root.scale, { x: s * 1.03, y: s * 1.03, z: s * 1.03, repeat: -1, yoyo: true, duration: 1.6, ease: 'sine.inOut' }));
        this.#reveal(spin, meshMats, edgeMats, core, reduced);
        wireScroll();
      }, undefined, (e) => console.error('heart model load error:', e));
    } else {
      // ── Legacy folder: 7 love segments, each its own trajectory ──
      let loaded = 0;
      LOVE_PARTS.forEach((file, i) => {
        loader.load(`${folder}${file}`, (gltf) => {
          const obj = gltf.scene as unknown as Shard;
          obj.scale.setScalar(0.021);
          obj.traverse((c) => { if ((c as THREE.Mesh).isMesh) glassify(c as THREE.Mesh); });
          const move = LOVE_MOVES[i];
          obj.userData.update = (p: number) => { const v = move(p); obj.position.set(v.x, v.y, v.z); };
          scene.add(obj); spin.push(obj); shards.push(obj);
          if (!reduced) this.#tweens.push(gsap.to(obj.scale, { x: 0.0225, y: 0.0225, z: 0.0225, repeat: -1, yoyo: true, duration: 1.4, ease: 'sine.inOut' }));
          if (++loaded === LOVE_PARTS.length) { this.#reveal(spin, meshMats, edgeMats, core, reduced); wireScroll(); }
        }, undefined, (e) => console.error('heart model load error:', e));
      });
    }

    const animate = () => {
      this.#frameId = requestAnimationFrame(animate);
      for (const o of spin) { o.rotation.y += 0.05 * (targetX - o.rotation.y); o.rotation.x += 0.05 * (targetY - o.rotation.x); }
      composer.render();
    };
    animate();

    const onResize = () => {
      camera.aspect = W() / H(); camera.updateProjectionMatrix();
      renderer.setSize(W(), H()); composer.setSize(W(), H()); ScrollTrigger.refresh();
    };
    window.addEventListener('resize', onResize, { signal: this.#abort.signal });
    window.addEventListener('orientationchange', onResize, { signal: this.#abort.signal });
  }

  // Reveal: the glass stays visible throughout (never hidden) — the "flash-in" is the glowing
  // outline drawing on, a bright emissive pulse through the glass, and an internal light burst.
  #reveal(_spin: THREE.Object3D[], meshMats: THREE.MeshPhysicalMaterial[], edgeMats: THREE.LineBasicMaterial[], core: THREE.PointLight, reduced: boolean) {
    if (reduced) { edgeMats.forEach((m) => (m.opacity = 0.14)); return; }
    const tl = gsap.timeline();
    tl.fromTo(edgeMats, { opacity: 0 }, { opacity: 0.95, duration: 0.5, ease: 'power2.out' }, 0);
    tl.to(meshMats, { emissiveIntensity: 1.6, duration: 0.22, ease: 'power2.in' }, 0.18);
    tl.to(meshMats, { emissiveIntensity: 0, duration: 0.95, ease: 'power2.out' }, 0.4);
    tl.fromTo(core, { intensity: 6 }, { intensity: 0.4, duration: 1.0, ease: 'power2.out' }, 0.18);
    tl.to(edgeMats, { opacity: 0.14, duration: 0.9, ease: 'power2.out' }, 0.62);
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

customElements.define('heart-model', HeartModel);
