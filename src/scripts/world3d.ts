// Escena 3D (Three.js): el núcleo y los nodos son esferas reales repartidas en
// el espacio. Con el núcleo encendido se navega arrastrando: la cámara gira
// alrededor del punto que mira y se acerca o aleja con la rueda / pellizco.
// La interfaz HTML (textos, punteros, líneas) se ubica sobre la proyección de
// cada esfera, así que todo lo demás sigue funcionando igual.

import * as THREE from "three";

export interface Pt {
  x: number;
  y: number;
}

/** Punto de órbita proyectado: coordenadas de pantalla, escala y si lo tapa el núcleo. */
export interface Orbit3D {
  x: number;
  y: number;
  scale: number;
  occluded: boolean;
}

export interface Projection {
  /** Desplazamiento en px desde el centro de la pantalla. */
  x: number;
  y: number;
  /** Escala respecto de la vista inicial (1 = mismo tamaño). */
  scale: number;
  /** true si está detrás de la cámara. */
  behind: boolean;
  /** Profundidad (distancia a la cámara), para ordenar. */
  depth: number;
}

interface WorldOptions {
  canvas: HTMLCanvasElement;
  nodes: HTMLElement[];
  /** Se puede navegar (núcleo encendido, interfaz armada, sin sección abierta). */
  canNavigate: () => boolean;
  /** El núcleo está encendido (brilla más). */
  awake: () => boolean;
  /** Se puede girar el núcleo arrastrando (en reposo). */
  canSpin: () => boolean;
}

// Dónde queda cada nodo en el espacio (unidades de mundo; el núcleo en el origen)
const POSITIONS: [number, number, number][] = [
  [0.4, 3.4, 1.2], // Sobre mí: arriba
  [5.6, 1.0, -2.2], // Proyectos: derecha, más al fondo
  [3.4, -3.3, 2.0], // Habilidades: abajo a la derecha, adelante
  [-4.2, -2.6, -2.8], // Contacto: abajo a la izquierda, al fondo
  [-5.4, 2.0, 0.8], // CV: izquierda
];
const CORE_R = 1.15;
const NODE_R = 0.46;
const HOME_DIST = 13;
const FOV = 50;

export function createWorld(o: WorldOptions) {
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);

  // ---------- Luces: una suave general, una clave arriba y el núcleo que ilumina ----------
  scene.add(new THREE.AmbientLight(0x5f9fb8, 0.55));
  const key = new THREE.DirectionalLight(0xbff4ff, 1.4);
  key.position.set(-6, 8, 10);
  scene.add(key);
  const coreLight = new THREE.PointLight(0x50dcff, 30, 30, 1.6);
  scene.add(coreLight);

  // ---------- Núcleo ----------
  const coreGroup = new THREE.Group();
  scene.add(coreGroup);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x0f5a72,
    emissive: 0x1aa6d0,
    emissiveIntensity: 0.3,
    metalness: 0.25,
    roughness: 0.32,
  });
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(CORE_R, 48, 32), coreMat);
  coreGroup.add(coreMesh);
  const wireMat = (opacity: number) =>
    new THREE.MeshBasicMaterial({ color: 0x50dcff, wireframe: true, transparent: true, opacity });
  const coreWire = new THREE.Mesh(new THREE.SphereGeometry(CORE_R * 1.28, 18, 12), wireMat(0.22));
  coreGroup.add(coreWire);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(CORE_R * 1.6, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0x50dcff, transparent: true, opacity: 0.06, side: THREE.BackSide }),
  );
  coreGroup.add(halo);
  // Anillo orbital inclinado alrededor del núcleo
  const coreOrbit = new THREE.Mesh(
    new THREE.TorusGeometry(CORE_R * 1.75, 0.012, 8, 120),
    new THREE.MeshBasicMaterial({ color: 0x50dcff, transparent: true, opacity: 0.5 }),
  );
  coreOrbit.rotation.x = Math.PI / 2.6;
  coreGroup.add(coreOrbit);

  // ---------- Nodos ----------
  const nodeBase = POSITIONS.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  // Posición actual de cada nodo: con el núcleo activo la constelación gira despacio
  const nodeWorld = nodeBase.map((v) => v.clone());
  const DRIFT_AXIS = new THREE.Vector3(0.18, 1, -0.1).normalize();
  const driftQ = new THREE.Quaternion();
  let drift = 0;
  let driftSpeed = 0;
  const spheres = o.nodes.map((_, i) => {
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(NODE_R, 40, 28),
      new THREE.MeshStandardMaterial({
        color: 0x0e4255,
        emissive: 0x50dcff,
        emissiveIntensity: 0.12,
        metalness: 0.35,
        roughness: 0.3,
      }),
    );
    const wire = new THREE.Mesh(new THREE.SphereGeometry(NODE_R * 1.22, 12, 9), wireMat(0.32));
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(NODE_R * 1.6, 0.008, 6, 80),
      new THREE.MeshBasicMaterial({ color: 0x50dcff, transparent: true, opacity: 0.45 }),
    );
    ring.rotation.x = Math.PI / 2.3 + i * 0.3;
    g.add(mesh, wire, ring);
    g.visible = false;
    scene.add(g);
    return { g, mesh, wire, ring };
  });
  // Línea 3D del núcleo a cada nodo (acompaña a la línea HTML punteada)
  const beams = o.nodes.map(() => {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x50dcff, transparent: true, opacity: 0.0 }));
    scene.add(line);
    return line;
  });

  // Estrellas / partículas de fondo para que se note el movimiento de la cámara
  {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const r = 30 + Math.random() * 40;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 2 - 1);
      pos[k * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[k * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pos[k * 3 + 2] = r * Math.cos(ph);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8fe9ff, size: 0.12, transparent: true, opacity: 0.55 })));
  }

  // ---------- Interior de un nodo: lo que se ve al entrar en él ----------
  const inner = new THREE.Group();
  inner.visible = false;
  scene.add(inner);
  type Tintable = THREE.Material & { opacity: number; color: THREE.Color };
  const innerMats: { m: Tintable; base: number; blue: THREE.Color; red: THREE.Color }[] = [];
  const innerMat = <M extends Tintable>(m: M, base: number) => {
    m.transparent = true;
    m.opacity = 0;
    m.depthWrite = false;
    // Versión roja del mismo tono (para cuando los rojos cierran el nodo)
    const blue = m.color.clone();
    const hsl = { h: 0, s: 0, l: 0 };
    blue.getHSL(hsl);
    const red = new THREE.Color().setHSL(0.985, Math.max(0.6, hsl.s), hsl.l * 0.95);
    innerMats.push({ m, base, blue, red });
    return m;
  };
  // Cúpula de meridianos y paralelos: las "paredes" del nodo vistas desde adentro
  const domePts: number[] = [];
  {
    const R = 6;
    const at = (lat: number, lon: number) => [
      R * Math.cos(lat) * Math.cos(lon),
      R * Math.sin(lat),
      R * Math.cos(lat) * Math.sin(lon),
    ];
    const seg = 72;
    for (let m = 0; m < 18; m++) {
      const lon = (m / 18) * Math.PI * 2;
      for (let k = 0; k < seg / 2; k++) {
        const a = -Math.PI / 2 + (k / (seg / 2)) * Math.PI;
        const b = -Math.PI / 2 + ((k + 1) / (seg / 2)) * Math.PI;
        domePts.push(...at(a, lon), ...at(b, lon));
      }
    }
    for (let q = 1; q < 10; q++) {
      const lat = -Math.PI / 2 + (q / 10) * Math.PI;
      for (let k = 0; k < seg; k++) {
        domePts.push(...at(lat, (k / seg) * Math.PI * 2), ...at(lat, ((k + 1) / seg) * Math.PI * 2));
      }
    }
  }
  const domeGeo = new THREE.BufferGeometry();
  domeGeo.setAttribute("position", new THREE.Float32BufferAttribute(domePts, 3));
  const dome = new THREE.LineSegments(domeGeo, innerMat(new THREE.LineBasicMaterial({ color: 0x50dcff }), 0.28));
  inner.add(dome);
  // Resplandor de fondo de la cúpula
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(6.4, 32, 20),
    innerMat(new THREE.MeshBasicMaterial({ color: 0x0b4a60, side: THREE.BackSide }), 0.5),
  );
  glow.renderOrder = -1;
  inner.add(glow);
  // Anillos internos que giran en distintos ejes
  const innerRings = [3.2, 4.1, 5.0].map((r, k) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.005, 4, 200),
      innerMat(new THREE.MeshBasicMaterial({ color: 0x8fe9ff }), 0.5 - k * 0.1),
    );
    m.rotation.set(0.6 + k * 0.9, k * 0.7, 0);
    inner.add(m);
    return m;
  });
  // Partículas que fluyen desde el centro hacia las paredes
  const FLOW = 420;
  const flowPos = new Float32Array(FLOW * 3);
  const flowDir: THREE.Vector3[] = [];
  const flowR = new Float32Array(FLOW);
  for (let k = 0; k < FLOW; k++) {
    flowDir.push(new THREE.Vector3().randomDirection());
    flowR[k] = 0.8 + Math.random() * 5;
  }
  const flowGeo = new THREE.BufferGeometry();
  flowGeo.setAttribute("position", new THREE.BufferAttribute(flowPos, 3));
  inner.add(new THREE.Points(flowGeo, innerMat(new THREE.PointsMaterial({ color: 0xbff4ff, size: 2, sizeAttenuation: false }), 0.8)));
  const clearBlue = new THREE.Color(0x041a26);
  const clearRed = new THREE.Color(0x24060c);
  const clearColor = new THREE.Color();
  let tint = 0; // 0 = azul, 1 = rojo (cierre)
  let tintGoal = 0;
  const NODE_EMI = new THREE.Color(0x50dcff);
  const NODE_RED = new THREE.Color(0xff4d5e);
  let inside = 0; // 0 = afuera, 1 = dentro del nodo
  let insideGoal = 0;
  let insideNode = -1;

  // ---------- Cámara orbital ----------
  const view = { yaw: 0, pitch: 0, dist: HOME_DIST, target: new THREE.Vector3() };
  const goal = { yaw: 0, pitch: 0, dist: HOME_DIST, target: new THREE.Vector3() };
  let w = 1;
  let h = 1;
  let homePpu = 1; // px por unidad a la distancia inicial

  function resize() {
    w = innerWidth;
    h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // En pantallas angostas la cámara se aleja un poco para que entre más
    camera.fov = w < h ? 62 : FOV;
    camera.updateProjectionMatrix();
    homePpu = h / 2 / (HOME_DIST * Math.tan((camera.fov * Math.PI) / 360));
  }
  resize();
  addEventListener("resize", resize);

  function placeCamera() {
    const cp = Math.cos(view.pitch);
    camera.position.set(
      view.target.x + Math.sin(view.yaw) * cp * view.dist,
      view.target.y + Math.sin(view.pitch) * view.dist,
      view.target.z + Math.cos(view.yaw) * cp * view.dist,
    );
    camera.lookAt(view.target);
    camera.updateMatrixWorld();
  }
  placeCamera();

  // ---------- Arrastrar para navegar ----------
  let drag: { id: number; x: number; y: number; moved: number; spin: boolean } | null = null;
  let dragged = 0; // momento en que terminó un arrastre real (para no tomarlo como clic)
  const spinVel = { x: 0, y: 0 };
  let spinIdle = 0;
  const pinch = new Map<number, Pt>();
  let pinchD = 0;
  const stage = o.canvas.parentElement!;
  stage.addEventListener("pointerdown", (e) => {
    const onButton = (e.target as HTMLElement).closest("button");
    const spin = o.canSpin() && (!onButton || onButton.matches("[data-core]"));
    if (!spin && (!o.canNavigate() || onButton)) return;
    pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.size === 2) {
      const [a, b] = [...pinch.values()];
      pinchD = Math.hypot(a.x - b.x, a.y - b.y);
      drag = null;
      return;
    }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, spin };
  });
  stage.addEventListener("pointermove", (e) => {
    if (pinch.has(e.pointerId)) pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.size === 2 && o.canNavigate()) {
      const [a, b] = [...pinch.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD > 0) zoom(pinchD / d);
      pinchD = d;
      return;
    }
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    // Recién cuando se mueve de verdad se toma como arrastre (un toque sigue siendo clic)
    if (drag.moved < 6) return;
    if (!stage.hasPointerCapture(e.pointerId)) {
      stage.setPointerCapture(e.pointerId);
      document.body.classList.add("is-dragging-world");
    }
    if (drag.spin) {
      // En reposo se gira el núcleo mismo (con inercia al soltar)
      spinVel.x = dy * 0.01;
      spinVel.y = dx * 0.01;
      spinBy(spinVel.x, spinVel.y);
      spinIdle = 0;
      return;
    }
    goal.yaw -= dx * 0.006;
    goal.pitch = Math.max(-1.2, Math.min(1.2, goal.pitch + dy * 0.005));
  });
  const qx = new THREE.Quaternion();
  const qy = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0);
  const AY = new THREE.Vector3(0, 1, 0);
  function spinBy(ax: number, ay: number) {
    qx.setFromAxisAngle(AX, ax);
    qy.setFromAxisAngle(AY, ay);
    coreGroup.quaternion.premultiply(qy).premultiply(qx).normalize();
  }
  const end = (e: PointerEvent) => {
    pinch.delete(e.pointerId);
    if (pinch.size < 2) pinchD = 0;
    if (drag?.id === e.pointerId) {
      if (drag.moved >= 6) dragged = performance.now();
      drag = null;
    }
    document.body.classList.remove("is-dragging-world");
  };
  stage.addEventListener("pointerup", end);
  stage.addEventListener("pointercancel", end);
  addEventListener(
    "wheel",
    (e) => {
      if (!o.canNavigate()) return;
      zoom(Math.exp(e.deltaY * 0.0012));
    },
    { passive: true },
  );
  function zoom(k: number) {
    goal.dist = Math.max(5, Math.min(22, goal.dist * k));
  }

  // ---------- Proyección a pantalla ----------
  const tmp = new THREE.Vector3();
  function project(v: THREE.Vector3): Projection {
    tmp.copy(v).project(camera);
    const depth = camera.position.distanceTo(v);
    const behind = tmp.z > 1;
    const ppu = h / 2 / (depth * Math.tan((camera.fov * Math.PI) / 360));
    return { x: (tmp.x * w) / 2, y: (-tmp.y * h) / 2, scale: ppu / homePpu, behind, depth };
  }
  // Punto de pantalla (desde el centro) llevado al espacio a una profundidad dada
  function unproject(p: Pt, depth: number): THREE.Vector3 {
    const v = new THREE.Vector3((p.x / w) * 2, (-p.y / h) * 2, 0.5).unproject(camera);
    const dir = v.sub(camera.position).normalize();
    return camera.position.clone().add(dir.multiplyScalar(depth));
  }

  // Distancia del centro del botón al centro de su punto (el texto va debajo)
  function dotOffset(btn: HTMLElement) {
    const dot = btn.querySelector<HTMLElement>(".node__dot");
    return dot ? (btn.offsetHeight - dot.offsetHeight) / 2 : 0;
  }

  // ---------- Animación ----------
  let last = performance.now();
  let pulse = 0;
  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const k = 1 - Math.exp(-dt * 6);
    view.yaw += (goal.yaw - view.yaw) * k;
    view.pitch += (goal.pitch - view.pitch) * k;
    view.dist += (goal.dist - view.dist) * k;
    view.target.lerp(goal.target, k);
    placeCamera();

    const awake = o.awake();
    const t = now / 1000;
    coreMat.emissiveIntensity += ((awake ? 0.55 : 0.22) + (awake ? Math.sin(t * 3.9) * 0.06 : Math.sin(t * 1.4) * 0.04) - coreMat.emissiveIntensity) * 0.1;
    coreLight.intensity = awake ? 40 : 12;
    coreWire.rotation.y += dt * (awake ? 0.5 : 0.15);
    coreWire.rotation.x = Math.sin(t * 0.3) * 0.3;
    coreOrbit.rotation.z += dt * (awake ? 0.6 : 0.2);
    halo.scale.setScalar(1 + Math.sin(t * (awake ? 3 : 1.2)) * 0.04 + pulse * 0.4);
    pulse = Math.max(0, pulse - dt * 1.5);
    // Inercia del giro del núcleo; después de un rato vuelve despacio a su posición
    if (!drag) {
      spinVel.x *= Math.exp(-dt * 2.5);
      spinVel.y *= Math.exp(-dt * 2.5);
      spinBy(spinVel.x * dt * 60, spinVel.y * dt * 60);
      spinIdle += dt;
      if (o.awake()) spinBy(0, dt * 0.35); // encendido, el núcleo gira solo
      else if (spinIdle > 2.5) coreGroup.quaternion.slerp(IDENT, 1 - Math.exp(-dt * 0.8));
    }

    // Con el núcleo activo (y sin estar dentro de un nodo) los nodos giran en el espacio
    // (se frena mientras el mouse está sobre un nodo, para poder tocarlo tranquilo)
    const hovering = o.nodes.some((n) => n.matches(":hover"));
    driftSpeed += ((o.canNavigate() && insideNode < 0 && !hovering ? 0.07 : 0) - driftSpeed) * (1 - Math.exp(-dt * 3));
    drift += dt * driftSpeed;
    driftQ.setFromAxisAngle(DRIFT_AXIS, drift);
    nodeBase.forEach((b, i) => {
      nodeWorld[i].copy(b).applyQuaternion(driftQ);
      nodeWorld[i].y += Math.sin(t * 0.6 + i * 1.7) * 0.18; // vaivén suave de cada uno
    });

    // Entrar en un nodo: crece hasta envolver la cámara y aparece su interior
    inside += (insideGoal - inside) * (1 - Math.exp(-dt * 2.6));
    if (Math.abs(insideGoal - inside) < 0.002) inside = insideGoal;
    const ins = inside * inside * (3 - 2 * inside);
    tint += (tintGoal - tint) * (1 - Math.exp(-dt * 3));
    clearColor.copy(clearBlue).lerp(clearRed, tint);
    renderer.setClearColor(clearColor, ins * 0.94);
    inner.visible = ins > 0.01 && insideNode >= 0;
    if (inner.visible) {
      inner.position.copy(nodeWorld[insideNode]);
      inner.scale.setScalar(0.35 + 0.65 * ins);
      for (const { m, base, blue, red } of innerMats) {
        m.opacity = base * Math.max(0, (ins - 0.3) / 0.7);
        m.color.copy(blue).lerp(red, tint);
      }
      dome.rotation.y += dt * 0.05;
      innerRings.forEach((r, k) => {
        r.rotation.z += dt * (0.12 + k * 0.07) * (k % 2 ? -1 : 1);
        r.rotation.x += dt * 0.03 * (k + 1);
      });
      for (let k = 0; k < FLOW; k++) {
        flowR[k] += dt * (0.4 + flowR[k] * 0.12);
        if (flowR[k] > 5.8) flowR[k] = 0.8;
        const d = flowDir[k];
        flowPos[k * 3] = d.x * flowR[k];
        flowPos[k * 3 + 1] = d.y * flowR[k];
        flowPos[k * 3 + 2] = d.z * flowR[k];
      }
      flowGeo.attributes.position.needsUpdate = true;
    }
    // Lo de afuera desaparece cuando ya estamos dentro
    const outside = ins < 0.45;
    coreGroup.visible = outside;

    // Cada esfera sigue a su nodo HTML: puesto en su lugar o arrastrado por un puntero
    o.nodes.forEach((btn, i) => {
      const s = spheres[i];
      const placed = btn.classList.contains("is-placed");
      const driven = btn.classList.contains("is-driven");
      const st = btn.style;
      const built = parseFloat(st.getPropertyValue("--core") || "1");
      if ((!placed && !driven) || (!outside && i !== insideNode) || (ins > 0.8 && i === insideNode)) {
        s.g.visible = false;
        beams[i].material.opacity = 0;
        return;
      }
      s.g.visible = true;
      if (placed) s.g.position.copy(nodeWorld[i]);
      else {
        const depth = project(nodeWorld[i]).depth;
        const px = parseFloat(st.getPropertyValue("--px")) || 0;
        // --px/--py ubican el centro del botón; la esfera va en el centro del punto
        const py = (parseFloat(st.getPropertyValue("--py")) || 0) - dotOffset(btn) * (parseFloat(st.getPropertyValue("--s")) || 1);
        s.g.position.copy(unproject({ x: px, y: py }, depth));
      }
      const sc = Math.max(0.05, driven ? parseFloat(st.getPropertyValue("--s") || "1") : 1) * (0.35 + 0.65 * built);
      // El nodo en el que se entra crece hasta envolver a la cámara
      s.g.scale.setScalar(sc * (i === insideNode ? 1 + ins * ins * 26 : 1));
      const hot = btn.classList.contains("is-active") || btn.matches(":hover");
      const mm = s.mesh.material as THREE.MeshStandardMaterial;
      mm.emissiveIntensity = 0.1 + built * (hot ? 0.55 : 0.18);
      mm.emissive.copy(NODE_EMI).lerp(NODE_RED, i === insideNode ? tint : 0);
      s.wire.rotation.y += dt * (hot ? 1.6 : 0.5);
      s.mesh.rotation.y += dt * 0.4;
      s.g.rotation.x = Math.sin(t * 0.4 + i) * 0.25;
      s.ring.rotation.z += dt * 0.8;
      const line = beams[i];
      const pts = line.geometry.attributes.position as THREE.BufferAttribute;
      pts.setXYZ(0, 0, 0, 0);
      pts.setXYZ(1, s.g.position.x, s.g.position.y, s.g.position.z);
      pts.needsUpdate = true;
      line.material.opacity = placed ? 0.18 : 0;
    });

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Punto de una órbita 3D alrededor del núcleo, ya proyectado en pantalla.
  // ring = qué anillo (más grande cuanto mayor), tilt = inclinación propia.
  const orb = new THREE.Vector3();
  const IDENT = new THREE.Quaternion();
  const coreAt = new THREE.Vector3();
  function orbit(angle: number, ring: number, tilt: number): Orbit3D {
    const R = CORE_R * 1.5 + ring * 0.3;
    const x = Math.cos(angle) * R;
    const z = Math.sin(angle) * R;
    const ax = 0.35 + (ring - 2) * 0.32; // inclinación sobre X según el anillo
    const az = tilt; // inclinación sobre Z propia de cada puntero
    // Girar (x, 0, z) sobre X y después sobre Z
    const y1 = -z * Math.sin(ax);
    const z1 = z * Math.cos(ax);
    orb.set(x * Math.cos(az) - y1 * Math.sin(az), x * Math.sin(az) + y1 * Math.cos(az), z1);
    // Las órbitas giran junto con el núcleo
    orb.applyQuaternion(coreGroup.quaternion);
    const p = project(orb);
    const c = project(coreAt);
    // Tapado si está detrás del núcleo y cae dentro de su disco en pantalla
    const coreR = CORE_R * homePpu * c.scale;
    const occluded = p.depth > c.depth && Math.hypot(p.x - c.x, p.y - c.y) < coreR * 0.95;
    return { x: p.x + w / 2, y: p.y + h / 2, scale: p.scale, occluded };
  }

  return {
    orbit,
    dotOffset,
    /** Proyección del núcleo (el origen). */
    projectCore: () => project(new THREE.Vector3()),
    /** Proyección de un nodo en su lugar en el espacio. */
    projectNode: (i: number) => project(nodeWorld[i]),
    /** Radio en px de núcleo y nodos a la escala 1. */
    coreRadius: () => CORE_R * homePpu,
    nodeRadius: () => NODE_R * homePpu,
    /** Vuelve la cámara a la vista inicial. Resuelve cuando casi llegó. */
    home() {
      goal.yaw = 0;
      goal.pitch = 0;
      goal.dist = HOME_DIST;
      goal.target.set(0, 0, 0);
      return settle();
    },
    /** La cámara viaja hasta tener el nodo de frente y cerca. */
    focus(i: number) {
      const p = nodeWorld[i];
      goal.target.copy(p).multiplyScalar(0.85);
      goal.yaw = Math.atan2(p.x, p.z + 0.001) * 0.6 + goal.yaw * 0.4;
      goal.pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(p.y, 8) * 0.5));
      goal.dist = 7.5;
      return settle();
    },
    /** La cámara llega al nodo y se mete dentro: crece, lo envuelve y aparece su interior. */
    async enter(i: number) {
      const p = nodeWorld[i];
      insideNode = i;
      goal.target.copy(p);
      goal.yaw = Math.atan2(p.x, p.z + 0.001) * 0.6 + goal.yaw * 0.4;
      goal.pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(p.y, 8) * 0.5));
      goal.dist = 2.4;
      await settle(900);
      insideGoal = 1;
      goal.dist = 1.4;
      await until(() => inside > 0.9, 1600);
    },
    /** Sale del nodo: se achica, vuelve a verse desde afuera. */
    async exit() {
      if (insideGoal === 0) return;
      insideGoal = 0;
      goal.dist = 3;
      await until(() => inside < 0.08, 1600);
      insideNode = -1;
    },
    /** Tiñe de rojo (1) o devuelve a azul (0) el nodo en el que estamos. */
    tint(v: number) {
      tintGoal = v;
      return until(() => Math.abs(tint - v) < 0.05, 900);
    },
    /** true si recién terminó un arrastre (el clic que lo sigue no cuenta). */
    justDragged: () => performance.now() - dragged < 250,
    /** Destello del núcleo (al encender). */
    flare() {
      pulse = 1;
    },
  };

  function settle(max = 1400) {
    return until(
      () =>
        Math.abs(goal.yaw - view.yaw) < 0.02 &&
        Math.abs(goal.pitch - view.pitch) < 0.02 &&
        Math.abs(goal.dist - view.dist) < 0.15 &&
        view.target.distanceTo(goal.target) < 0.05,
      max,
    );
  }
  function until(ok: () => boolean, max: number) {
    return new Promise<void>((resolve) => {
      const t0 = performance.now();
      const check = () => {
        if (ok() || performance.now() - t0 > max) resolve();
        else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }
}

/** true si el navegador puede dibujar WebGL. */
export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
