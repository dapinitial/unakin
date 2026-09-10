/**
 * <glass-model model="/models/heart.glb" mode="shatter|assemble" reveal="view|load" spread="2.6">
 *
 * A three.js canvas that fills its host element and renders a fractured GLB as GLASS:
 * physical transmission (real refraction) + environment reflections + bloom, a glowing
 * outline that "draws on" then flashes the whole form in, cursor tilt, slow idle rotation,
 * and a scroll-driven explode where every mesh in the GLB is a shard.
 *
 *   mode="shatter"  — intact at rest, flies apart as the host scrolls out of view (hero).
 *   mode="assemble" — starts shattered, pulls together as the host scrolls into view.
 *
 * GLBs are produced by the fracture pipeline (Meshy → decimate → strip textures → Voronoi
 * shards → meshopt); every material is replaced with our glass, so models carry none.
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

const TINT = new THREE.Color(0x9ab4ff); // cool violet-blue glass tint
const EDGE = 0xbcc0ff;

function glassMaterial() {
  // Moody violet blown glass: deep tint through the body, crisp bright rims from the lights.
  return new THREE.MeshPhysicalMaterial({
    color: 0xdfe4ff, metalness: 0, roughness: 0.14,
    transmission: 1, thickness: 0.9, ior: 1.5,
    attenuationColor: TINT, attenuationDistance: 0.55,
    clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.7, specularIntensity: 1,
    transparent: true, opacity: 1,
    emissive: new THREE.Color(EDGE), emissiveIntensity: 0,
  });
}

interface Shard { mesh: THREE.Mesh; home: THREE.Vector3; dir: THREE.Vector3; tumble: THREE.Euler }

export class GlassModel extends HTMLElement {
  #abort = new AbortController();
  #frameId = 0;
  #renderer: THREE.WebGLRenderer | null = null;
  #composer: EffectComposer | null = null;
  #scrollTrigger: ScrollTrigger | null = null;
  #tweens: gsap.core.Tween[] = [];
  #visible = false;
  #revealed = false;

  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>:host{display:block;position:relative;}canvas{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;}</style><canvas></canvas>`;
    const canvas = shadow.querySelector('canvas')!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const url = this.getAttribute('model') ?? '/models/heart.glb';
    const mode = this.getAttribute('mode') === 'assemble' ? 'assemble' : 'shatter';
    const revealOn = this.getAttribute('reveal') === 'load' ? 'load' : 'view';
    const SPREAD = parseFloat(this.getAttribute('spread') ?? '2.6');
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
    renderer.toneMappingExposure = 0.95;
    this.#renderer = renderer;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    scene.add(new THREE.AmbientLight(0x8a90ff, 0.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(2, 3, 4); scene.add(key);
    const violet = new THREE.PointLight(0x6d4aff, 10, 14); violet.position.set(-2.6, -0.8, 1.8); scene.add(violet);
    const mint = new THREE.PointLight(0x8bf0cf, 6, 14); mint.position.set(2.6, 1.4, 2); scene.add(mint);
    const core = new THREE.PointLight(EDGE, 0, 6); scene.add(core);

    const composer = new EffectComposer(renderer);
    composer.setSize(W(), H());
    composer.addPass(new RenderPass(scene, camera));
    // Tight bloom: only the rims/edges glow, so the halo stays well inside the canvas.
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.35, 0.25, 0.86));
    composer.addPass(new OutputPass());
    this.#composer = composer;

    // Cursor tilt, relative to the host's centre.
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
    const edgeMats: THREE.LineBasicMaterial[] = [];
    const pivot = new THREE.Group(); scene.add(pivot);
    let progress = mode === 'assemble' ? 1 : 0; // 0 = intact, 1 = fully exploded

    const apply = () => {
      for (const s of shards) {
        s.mesh.position.copy(s.home).addScaledVector(s.dir, progress * SPREAD);
        s.mesh.rotation.set(s.tumble.x * progress, s.tumble.y * progress, s.tumble.z * progress);
      }
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
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(mesh.geometry, 32),
          new THREE.LineBasicMaterial({ color: EDGE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        edgeMats.push(edges.material as THREE.LineBasicMaterial);
        mesh.add(edges);
        // Explode direction = from the model's centre through this shard's centroid.
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
      if (!reduced) this.#tweens.push(gsap.to(root.scale, { x: s * 1.03, y: s * 1.03, z: s * 1.03, repeat: -1, yoyo: true, duration: 1.6, ease: 'sine.inOut' }));

      // Scroll: shatter as the host leaves the viewport / assemble as it enters.
      this.#scrollTrigger = ScrollTrigger.create({
        trigger: this, scrub: 0.6,
        start: mode === 'assemble' ? 'top 90%' : 'top 12%',
        end: mode === 'assemble' ? 'center 45%' : 'bottom top',
        onUpdate: (self) => { progress = mode === 'assemble' ? 1 - self.progress : self.progress; apply(); },
      });
      if (revealOn === 'load' || this.#visible) this.#reveal(meshMats, edgeMats, core, reduced);
    }, undefined, (e) => console.error('glass-model load error:', url, e));

    // Only render (and only reveal) while on screen.
    const io = new IntersectionObserver((entries) => {
      this.#visible = entries.some((e) => e.isIntersecting);
      if (this.#visible && meshMats.length && !this.#revealed) this.#reveal(meshMats, edgeMats, core, reduced);
    }, { threshold: 0.2 });
    io.observe(this);
    this.#abort.signal.addEventListener('abort', () => io.disconnect());

    const animate = () => {
      this.#frameId = requestAnimationFrame(animate);
      if (!this.#visible) return;
      pivot.rotation.y += 0.06 * (targetX - pivot.rotation.y);
      pivot.rotation.x += 0.06 * (targetY - pivot.rotation.x);
      if (!reduced) pivot.rotation.z = Math.sin(performance.now() * 0.00035) * 0.06; // slow glassy sway
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

  // Reveal: the glass is never hidden — the "flash-in" is the outline drawing on, a bright
  // emissive pulse through the glass, and an internal light burst that settles to a glow.
  #reveal(meshMats: THREE.MeshPhysicalMaterial[], edgeMats: THREE.LineBasicMaterial[], core: THREE.PointLight, reduced: boolean) {
    this.#revealed = true;
    if (reduced) { edgeMats.forEach((m) => (m.opacity = 0.14)); return; }
    const tl = gsap.timeline();
    tl.fromTo(edgeMats, { opacity: 0 }, { opacity: 0.95, duration: 0.5, ease: 'power2.out' }, 0);
    tl.to(meshMats, { emissiveIntensity: 1.6, duration: 0.22, ease: 'power2.in' }, 0.18);
    tl.to(meshMats, { emissiveIntensity: 0, duration: 0.95, ease: 'power2.out' }, 0.4);
    tl.fromTo(core, { intensity: 6 }, { intensity: 0.4, duration: 1.0, ease: 'power2.out' }, 0.18);
    tl.to(edgeMats, { opacity: 0.16, duration: 0.9, ease: 'power2.out' }, 0.62);
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
