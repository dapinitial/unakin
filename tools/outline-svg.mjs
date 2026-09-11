// GLB → line-art SVG (silhouette + crease edges, front-facing, chained into polylines).
//   node tools/outline-svg.mjs public/models/heart.glb src/svg/heart.svg [targetTris=5000] [creaseDeg=38]
// Used as the "draw-on" loading state that dissolves into the 3D glass (<glass-model>).
// Camera = the hero view: model faces +Z, orthographic, y flipped for SVG.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier, MeshoptDecoder } from 'meshoptimizer';
import { writeFileSync } from 'node:fs';

const [,, inPath, outPath, targetArg = '5000', creaseArg = '38'] = process.argv;
const TARGET = +targetArg, CREASE = Math.cos((+creaseArg * Math.PI) / 180);

await MeshoptSimplifier.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inPath);

// ── merge every primitive, weld by exact position (shard borders vanish) ──
const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
const vmap = new Map(); const P = []; const I = [];
// Walk nodes (not bare meshes): meshopt quantization puts each shard on its own integer grid
// with the dequantize scale/translation on the node, so positions must go through the world matrix.
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const m = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const acc = prim.getAttribute('POSITION'); const n = acc.getCount(); const e = [0, 0, 0];
    const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: n }, (_, i) => i);
    const local = new Map();
    for (let v = 0; v < n; v++) {
      acc.getElement(v, e); // denormalizes quantized (Int16 normalized) positions
      const x = e[0], y = e[1], z = e[2];
      const wx = m[0]*x + m[4]*y + m[8]*z + m[12], wy = m[1]*x + m[5]*y + m[9]*z + m[13], wz = m[2]*x + m[6]*y + m[10]*z + m[14];
      const k = key(wx, wy, wz);
      let r = vmap.get(k); if (r === undefined) { r = P.length / 3; vmap.set(k, r); P.push(wx, wy, wz); }
      local.set(v, r);
    }
    for (const i of idx) I.push(local.get(i));
  }
}
const positions = new Float32Array(P);
let indices = new Uint32Array(I);
console.log(`merged: ${(indices.length/3).toLocaleString()} tris, ${(P.length/3).toLocaleString()} verts`);

// ── decimate for a clean, sparse line drawing ──
const [simp] = MeshoptSimplifier.simplify(indices, positions, 3, Math.min(indices.length, TARGET * 3), 1.0);
indices = simp;
console.log(`simplified: ${(indices.length/3).toLocaleString()} tris`);

// ── face normals, edge → faces ──
const fn = []; const edges = new Map(); // "a,b" (a<b) → [faceIdx...]
const addEdge = (a, b, f) => { const k = a < b ? `${a},${b}` : `${b},${a}`; (edges.get(k) ?? edges.set(k, []).get(k)).push(f); };
for (let f = 0; f < indices.length / 3; f++) {
  const a = indices[f*3], b = indices[f*3+1], c = indices[f*3+2];
  const ax = positions[a*3], ay = positions[a*3+1], az = positions[a*3+2];
  const ux = positions[b*3]-ax, uy = positions[b*3+1]-ay, uz = positions[b*3+2]-az;
  const vx = positions[c*3]-ax, vy = positions[c*3+1]-ay, vz = positions[c*3+2]-az;
  let nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx; const l = Math.hypot(nx, ny, nz) || 1;
  fn.push([nx/l, ny/l, nz/l]);
  addEdge(a, b, f); addEdge(b, c, f); addEdge(c, a, f);
}
// Keep: silhouette (front/back flip), crease (sharp + a front face), boundary (front face).
const keep = [];
for (const [k, faces] of edges) {
  const [a, b] = k.split(',').map(Number);
  if (faces.length === 1) { if (fn[faces[0]][2] > 0) keep.push([a, b]); continue; }
  const n1 = fn[faces[0]], n2 = fn[faces[1]];
  const front1 = n1[2] > 0, front2 = n2[2] > 0;
  const silhouette = front1 !== front2;
  const crease = (n1[0]*n2[0]+n1[1]*n2[1]+n1[2]*n2[2]) < CREASE && (front1 || front2);
  if (silhouette || crease) keep.push([a, b]);
}
console.log(`edges kept: ${keep.length.toLocaleString()} / ${edges.size.toLocaleString()}`);

// ── chain segments into polylines ──
const adj = new Map(); for (const [a, b] of keep) { (adj.get(a) ?? adj.set(a, []).get(a)).push(b); (adj.get(b) ?? adj.set(b, []).get(b)).push(a); }
const used = new Set(); const ek = (a, b) => a < b ? `${a},${b}` : `${b},${a}`;
const chains = [];
const walk = (start) => {
  const chain = [start]; let cur = start;
  for (;;) {
    const next = (adj.get(cur) ?? []).find((n) => !used.has(ek(cur, n)));
    if (next === undefined) break;
    used.add(ek(cur, next)); chain.push(next); cur = next;
  }
  return chain;
};
// start at endpoints/odd-degree vertices first for long clean strokes, then anything left
const verts = [...adj.keys()].sort((a, b) => (adj.get(a).length % 2 === 1 ? 0 : 1) - (adj.get(b).length % 2 === 1 ? 0 : 1));
for (const v of verts) for (;;) { const c = walk(v); if (c.length < 2) break; chains.push(c); }

// ── project (orthographic, +Z view), fit to a 1000×1000 box, emit ──
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (let v = 0; v < positions.length / 3; v++) { const x = positions[v*3], y = positions[v*3+1]; if (x<minX) minX=x; if (x>maxX) maxX=x; if (y<minY) minY=y; if (y>maxY) maxY=y; }
// viewBox = the model's exact x/y bounding box (no padding) so the page can pin the drawing to
// the projected 3D bounds; preserveAspectRatio=none lets that box be matched exactly.
const span = Math.max(maxX - minX, maxY - minY); const S = 1000 / span;
const VW = ((maxX - minX) * S).toFixed(1), VH = ((maxY - minY) * S).toFixed(1);
const px = (v) => ((positions[v*3] - minX) * S).toFixed(1);
const py = (v) => ((maxY - positions[v*3+1]) * S).toFixed(1);
// longest strokes first so the draw-on reads as "the outline appears, then detail"
chains.sort((a, b) => b.length - a.length);
// pathLength="1" → CSS can draw every stroke with dasharray/dashoffset 1 regardless of its real length.
const paths = chains.map((c, i) => `<path pathLength="1" d="M${px(c[0])} ${py(c[0])}${c.slice(1).map((v) => `L${px(v)} ${py(v)}`).join('')}" style="--i:${i}"/>`);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="none" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
${paths.join('\n')}
</svg>
`;
writeFileSync(outPath, svg);
console.log(`out: ${outPath} — ${chains.length} strokes, ${(svg.length/1024).toFixed(1)} KB`);
