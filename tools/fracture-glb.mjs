// Meshy GLB → web-ready fractured glass GLB (105 MB → <1 MB).
//   node tools/fracture-glb.mjs <in.glb> public/models/<out>.glb [targetTris=70000] [shards=40]
// 1. weld + simplify to ~targetTris   2. strip textures/materials (we apply glass in three.js)
// 3. Voronoi-partition the triangles into N shards (one mesh each, so the site can explode them)
// 4. meshopt-compress.
import { NodeIO, Document, Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, meshopt, dedup, normals } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const [,, inPath, outPath, targetTrisArg = '70000', shardsArg = '40'] = process.argv;
const targetTris = +targetTrisArg, N = +shardsArg;

await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const src = await io.read(inPath);

// ── 1. decimate ──
const srcPrim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const tris = srcPrim.getIndices().getCount() / 3;
const ratio = Math.min(1, targetTris / tris);
console.log(`in: ${tris.toLocaleString()} tris → ratio ${ratio.toFixed(4)}`);
await src.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002 }), normals({ overwrite: false }));

// ── 2/3. pull out geometry, drop UVs/materials, Voronoi split ──
const prim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = prim.getAttribute('POSITION').getArray();
const nrm = prim.getAttribute('NORMAL').getArray();
// normals() unwelds (drops indices) when it has to compute; fall back to sequential indices.
const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
const triCount = idx.length / 3;
console.log(`after simplify: ${triCount.toLocaleString()} tris, ${(pos.length/3).toLocaleString()} verts`);

// Seeds: farthest-point sampling over vertices for evenly-sized cells.
const vCount = pos.length / 3;
const seeds = [];
let cur = Math.floor(Math.random() * vCount);
const best = new Float32Array(vCount).fill(Infinity);
for (let s = 0; s < N; s++) {
  seeds.push([pos[cur*3], pos[cur*3+1], pos[cur*3+2]]);
  let far = 0, farD = -1;
  for (let v = 0; v < vCount; v++) {
    const dx = pos[v*3]-seeds[s][0], dy = pos[v*3+1]-seeds[s][1], dz = pos[v*3+2]-seeds[s][2];
    const d = dx*dx+dy*dy+dz*dz; if (d < best[v]) best[v] = d;
    if (best[v] > farD) { farD = best[v]; far = v; }
  }
  cur = far;
}
// Assign each triangle (by centroid) to nearest seed.
const cells = Array.from({ length: N }, () => []);
for (let t = 0; t < triCount; t++) {
  const a = idx[t*3], b = idx[t*3+1], c = idx[t*3+2];
  const cx = (pos[a*3]+pos[b*3]+pos[c*3])/3, cy = (pos[a*3+1]+pos[b*3+1]+pos[c*3+1])/3, cz = (pos[a*3+2]+pos[b*3+2]+pos[c*3+2])/3;
  let bi = 0, bd = Infinity;
  for (let s = 0; s < N; s++) { const dx = cx-seeds[s][0], dy = cy-seeds[s][1], dz = cz-seeds[s][2]; const d = dx*dx+dy*dy+dz*dz; if (d < bd) { bd = d; bi = s; } }
  cells[bi].push(t);
}

// ── build the output document: one node+mesh per shard, no materials ──
const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('scene');
const root = doc.createNode('root'); scene.addChild(root);
let kept = 0;
cells.forEach((triList, s) => {
  if (triList.length === 0) return;
  const remap = new Map(); const P = [], Nn = [], I = [];
  for (const t of triList) for (let k = 0; k < 3; k++) {
    const v = idx[t*3+k];
    let r = remap.get(v);
    if (r === undefined) { r = P.length/3; remap.set(v, r); P.push(pos[v*3], pos[v*3+1], pos[v*3+2]); Nn.push(nrm[v*3], nrm[v*3+1], nrm[v*3+2]); }
    I.push(r);
  }
  const p = doc.createPrimitive().setMode(Primitive.Mode.TRIANGLES)
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(Nn)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(I)).setBuffer(buffer));
  const mesh = doc.createMesh(`shard_${s}`).addPrimitive(p);
  root.addChild(doc.createNode(`shard_${s}`).setMesh(mesh));
  kept++;
});
console.log(`shards: ${kept}`);

await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(outPath, doc);
const { statSync } = await import('node:fs');
console.log(`out: ${outPath} ${(statSync(outPath).size/1024/1024).toFixed(2)} MB`);
