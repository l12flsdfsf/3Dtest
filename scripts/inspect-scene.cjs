const fs = require('fs');
const path = require('path');
const gltf = JSON.parse(fs.readFileSync('public/models/scene.gltf', 'utf8'));
const identity = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const nodes = gltf.nodes || [];
const meshes = gltf.meshes || [];
const accessors = gltf.accessors || [];
const bufferViews = gltf.bufferViews || [];
const buffers = gltf.buffers || [];
function mulMatVec4(m, p) {
  const x = p[0], y = p[1], z = p[2];
  const w = m[3]*x + m[7]*y + m[11]*z + m[15];
  return [
    (m[0]*x + m[4]*y + m[8]*z + m[12])/w,
    (m[1]*x + m[5]*y + m[9]*z + m[13])/w,
    (m[2]*x + m[6]*y + m[10]*z + m[14])/w,
  ];
}
function composeMatrix(t, r, s) {
  const m = new Array(16);
  const x = r[0], y = r[1], z = r[2], w = r[3];
  const x2 = x+x, y2 = y+y, z2 = z+z;
  const xx=x*x2,xy=x*y2,xz=x*z2,yy=y*y2,yz=y*z2,zz=z*z2;
  const wx=w*x2,wy=w*y2,wz=w*z2;
  m[0] = (1-(yy+zz))*s[0]; m[1] = (xy+wz)*s[0]; m[2] = (xz-wy)*s[0]; m[3] = 0;
  m[4] = (xy-wz)*s[1]; m[5] = (1-(xx+zz))*s[1]; m[6] = (yz+wx)*s[1]; m[7] = 0;
  m[8] = (xz+wy)*s[2]; m[9] = (yz-wx)*s[2]; m[10] = (1-(xx+yy))*s[2]; m[11] = 0;
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}
function nodeMatrix(n) {
  if (Array.isArray(n.matrix) && n.matrix.length === 16) return n.matrix;
  return composeMatrix(n.translation || [0,0,0], n.rotation || [0,0,0,1], n.scale || [1,1,1]);
}
function mulMat(a, b) {
  const o = new Array(16);
  for (let r=0;r<4;r++) for (let c=0;c<4;c++) { let s=0; for (let k=0;k<4;k++) s += a[k*4+r]*b[c*4+k]; o[c*4+r] = s; }
  return o;
}
const bufferCache = new Map();
function readBuffer(idx) {
  if (bufferCache.has(idx)) return bufferCache.get(idx);
  const buf = buffers[idx];
  if (!buf) return null;
  let bytes;
  if (buf.uri && buf.uri.startsWith('data:')) bytes = Buffer.from(buf.uri.split(',',2)[1], 'base64');
  else bytes = fs.readFileSync(path.join('public/models', buf.uri));
  bufferCache.set(idx, bytes);
  return bytes;
}
function readVEC3(accIdx) {
  const acc = accessors[accIdx];
  if (!acc || acc.type !== 'VEC3') return null;
  const view = bufferViews[acc.bufferView];
  if (!view) return null;
  const data = readBuffer(view.buffer);
  if (!data) return null;
  const compBytes = { 5120:4, 5121:1, 5122:2, 5123:2, 5125:4, 5126:4 }[acc.componentType] || 4;
  const stride = view.byteStride || compBytes*3;
  const start = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const out = new Float32Array(acc.count*3);
  for (let i=0;i<acc.count;i++) {
    const o = start + i*stride;
    if (acc.componentType === 5126) {
      out[i*3] = data.readFloatLE(o);
      out[i*3+1] = data.readFloatLE(o+4);
      out[i*3+2] = data.readFloatLE(o+8);
    } else if (acc.componentType === 5123) {
      out[i*3] = data.readUInt16LE(o);
      out[i*3+1] = data.readUInt16LE(o+2);
      out[i*3+2] = data.readUInt16LE(o+4);
    }
  }
  return { count: acc.count, data: out };
}
function bboxOfPts(p) {
  if (!p) return null;
  let minX=Infinity, minY=Infinity, minZ=Infinity, maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
  for (let i=0;i<p.count;i++) {
    const x=p.data[i*3], y=p.data[i*3+1], z=p.data[i*3+2];
    if (x<minX) minX=x; if (x>maxX) maxX=x;
    if (y<minY) minY=y; if (y>maxY) maxY=y;
    if (z<minZ) minZ=z; if (z>maxZ) maxZ=z;
  }
  return { min:[minX,minY,minZ], max:[maxX,maxY,maxZ] };
}
function worldBox(localBB, worldM) {
  const pts = new Float32Array(24);
  let idx=0;
  for (let xi=0;xi<2;xi++) for (let yi=0;yi<2;yi++) for (let zi=0;zi<2;zi++) {
    const p = [xi?localBB.max[0]:localBB.min[0], yi?localBB.max[1]:localBB.min[1], zi?localBB.max[2]:localBB.min[2]];
    const lt = p;
    const wt = mulMatVec4(worldM, lt);
    pts[idx*3]=wt[0]; pts[idx*3+1]=wt[1]; pts[idx*3+2]=wt[2];
    idx++;
  }
  return bboxOfPts({ count:8, data:pts });
}
const worldMatrix = new Array(nodes.length).fill(null);
function walk(i, parent) {
  const n = nodes[i]; if (!n) return null;
  const local = nodeMatrix(n);
  const world = parent ? mulMat(parent, local) : local;
  worldMatrix[i] = world;
  if (n.children) for (const c of n.children) walk(c, world);
  return world;
}
walk(0, null);
const careRe = /^关怀厅(\d{0,3})?$/;
const careIndices = [];
for (let i=0;i<nodes.length;i++) {
  const n = nodes[i]; if (!n) continue;
  const name = n.name || (n.extras && n.extras.name);
  if (name && careRe.test(name)) careIndices.push(i);
}
const out = [];
for (const idx of careIndices) {
  const node = nodes[idx];
  const meshIdx = node.mesh;
  if (meshIdx == null || !meshes[meshIdx]) continue;
  const mesh = meshes[meshIdx];
  let localBB = null;
  for (const prim of mesh.primitives || []) {
    const acc = prim.attributes && prim.attributes.POSITION;
    if (acc == null) continue;
    const pts = readVEC3(acc);
    const bb = bboxOfPts(pts);
    if (!localBB) localBB = bb;
    else {
      localBB.min = [Math.min(localBB.min[0],bb.min[0]), Math.min(localBB.min[1],bb.min[1]), Math.min(localBB.min[2],bb.min[2])];
      localBB.max = [Math.max(localBB.max[0],bb.max[0]), Math.max(localBB.max[1],bb.max[1]), Math.max(localBB.max[2],bb.max[2])];
    }
  }
  if (!localBB) continue;
  const localM = identity;
  const worldM = worldMatrix[idx];
  const world = worldBox(localBB, worldM);
  const size = [world.max[0]-world.min[0], world.max[1]-world.min[1], world.max[2]-world.min[2]];
  const center = [(world.min[0]+world.max[0])/2, (world.min[1]+world.max[1])/2, (world.min[2]+world.max[2])/2];
  out.push({
    idx, name: node.name, mesh: meshIdx,
    size: size.map(v => +v.toFixed(3)),
    center: center.map(v => +v.toFixed(3)),
    min: world.min.map(v => +v.toFixed(3)),
    max: world.max.map(v => +v.toFixed(3)),
  });
}
out.sort((a,b) => a.idx - b.idx);
console.log(JSON.stringify(out, null, 2));











