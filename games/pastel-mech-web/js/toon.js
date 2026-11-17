// Pastel toon görünüm: 3 basamaklı ışık + ters kabuk (inverted hull) dış çizgi + gradyan gökyüzü.
import * as THREE from 'three';

const grad = new THREE.DataTexture(new Uint8Array([120, 195, 255]), 3, 1, THREE.RedFormat);
grad.minFilter = THREE.NearestFilter;
grad.magFilter = THREE.NearestFilter;
grad.needsUpdate = true;

export const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x6b5672, side: THREE.BackSide });

export function toonMat(color, emissive = 0x000000) {
  return new THREE.MeshToonMaterial({ color, gradientMap: grad, emissive });
}

const _size = new THREE.Vector3();
/** Toon malzemeli, dış çizgili mesh. */
export function tmesh(geo, color, opts = {}) {
  const { outline = true, paint = true, thick = 0.035, emissive } = opts;
  const m = new THREE.Mesh(geo, toonMat(color, emissive));
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.paintable = paint;
  if (outline) {
    geo.computeBoundingBox();
    geo.boundingBox.getSize(_size);
    const o = new THREE.Mesh(geo, OUTLINE_MAT);
    o.scale.set(
      _size.x > 0.001 ? (_size.x + thick * 2) / _size.x : 1,
      _size.y > 0.001 ? (_size.y + thick * 2) / _size.y : 1,
      _size.z > 0.001 ? (_size.z + thick * 2) / _size.z : 1,
    );
    o.raycast = () => {};
    o.userData.outline = true;
    m.add(o);
  }
  return m;
}

export function skyDome(top = 0xc9b8ff, bottom = 0xffe3d3) {
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vP;
      void main(){ float h = smoothstep(-0.15, 0.6, vP.y); vec3 c = mix(bottom, top, h);
      float bands = floor(h * 6.0) / 6.0; c = mix(c, mix(bottom, top, bands), 0.25);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.raycast = () => {};
  m.renderOrder = -1;
  return m;
}

export function addLights(scene, shadowSize = 30) {
  scene.add(new THREE.HemisphereLight(0xfff4fb, 0xd9c7ff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(12, 25, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = c.bottom = -shadowSize;
  c.right = c.top = shadowSize;
  c.near = 1;
  c.far = 120;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);
  return sun;
}
