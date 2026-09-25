/*
 * ForensIA 3D — React + Three.js Application
 * Provider: Pollinations (IA en la nube)
 */

// ──────────────────────────────────────────────────────────────
//  Constantes
// ──────────────────────────────────────────────────────────────
const RECOMMENDED_MODELS = [
  'openai', 'gpt-5.4', 'gpt-5.4-mini', 'llama', 'llama-maverick',
  'qwen-coder', 'mistral', 'deepseek', 'gemini', 'claude'
];
const DEFAULT_MODEL = 'openai';
const POLLINATIONS_URL = 'https://gen.pollinations.ai';

const DEFAULT_RELATO = `Eran las 19:30 en una intersección con semáforo en el cruce de Av. Libertador y Calle 5. El Vehículo 1 (sedán rojo) circulaba de sur a norte por Av. Libertador a unos 70 km/h. El Vehículo 2 (camioneta negra) circulaba de oeste a este por Calle 5 a unos 50 km/h. El Vehículo 1 ignoró el semáforo en rojo e impactó de lleno el lateral derecho del Vehículo 2. Tras el impacto, el Vehículo 2 fue empujado hacia el noreste unos 6 metros y el Vehículo 1 quedó detenido en la intersección con daños frontales severos.`;

const VEHICLE_TYPES = ['sedan', 'suv', 'camioneta', 'camion', 'hatchback', 'deportivo'];
const COLOR_MAP = {
  rojo: 0xcc1111, azul: 0x1144aa, blanco: 0xdddddd, negro: 0x0a0a0a,
  plata: 0xaaaaaa, gris: 0x666666, verde: 0x11aa44, amarillo: 0xddcc00,
  naranja: 0xdd6622, marron: 0x663322, beige: 0xccbb99, violeta: 0x8833aa,
  celeste: 0x4488cc, borgoña: 0x661122, dorado: 0xccaa33, champán: 0xddccbb,
};

// ──────────────────────────────────────────────────────────────
//  Base de la API (relativa para funcionar en raíz o subcarpeta de XAMPP)
// ──────────────────────────────────────────────────────────────
const API_BASE = (() => {
  const p = window.location.pathname;
  return p.replace(/\/index\.php$/, '').replace(/\/+$/, '');
})();

// ──────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

function lerpAngle(a, b, t) {
  let diff = ((b - a) % 360 + 360) % 360;
  if (diff > 180) diff -= 360;
  return a + diff * t;
}

function extractJSON(text) {
  text = text.trim();
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.substring(start, i + 1); }
  }
  return null;
}

function parseColor(colorStr, defaultHex) {
  if (!colorStr || typeof colorStr !== 'string') return defaultHex;
  const key = colorStr.toLowerCase().trim();
  return COLOR_MAP[key] || defaultHex;
}

function parseVehicleType(typeStr, defaultType) {
  if (!typeStr || typeof typeStr !== 'string') return defaultType;
  const t = typeStr.toLowerCase().trim();
  return VEHICLE_TYPES.includes(t) ? t : defaultType;
}

function getPhase(frames, tCurrent) {
  if (!frames || frames.length < 2) return 'pre';
  const tImpact = frames[Math.floor(frames.length / 2)].segundo;
  if (tCurrent < tImpact - 0.05) return 'pre';
  if (tCurrent <= tImpact + 0.05) return 'impact';
  return 'post';
}

function interpolateFrame(frames, tCurrent) {
  if (!frames || frames.length === 0) return null;
  if (tCurrent <= frames[0].segundo) return { ...frames[0] };
  if (tCurrent >= frames[frames.length - 1].segundo) return { ...frames[frames.length - 1] };

  for (let i = 0; i < frames.length - 1; i++) {
    const f0 = frames[i];
    const f1 = frames[i + 1];
    if (tCurrent >= f0.segundo && tCurrent <= f1.segundo) {
      const alpha = (f1.segundo - f0.segundo < 0.001)
        ? 1
        : (tCurrent - f0.segundo) / (f1.segundo - f0.segundo);
      return {
        segundo: tCurrent,
        v1_x: lerp(f0.v1_x, f1.v1_x, alpha),
        v1_y: lerp(f0.v1_y, f1.v1_y, alpha),
        v1_angulo: lerpAngle(f0.v1_angulo, f1.v1_angulo, alpha),
        v2_x: lerp(f0.v2_x, f1.v2_x, alpha),
        v2_y: lerp(f0.v2_y, f1.v2_y, alpha),
        v2_angulo: lerpAngle(f0.v2_angulo, f1.v2_angulo, alpha),
      };
    }
  }
  return { ...frames[frames.length - 1] };
}

// ──────────────────────────────────────────────────────────────
//  Three.js Scene Manager
// ──────────────────────────────────────────────────────────────
class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    this.scene = new THREE.Scene();

    // Procedural sky gradient
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 2; skyCanvas.height = 256;
    const sCtx = skyCanvas.getContext('2d');
    const grad = sCtx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#02060c');
    grad.addColorStop(0.3, '#050e1a');
    grad.addColorStop(0.6, '#081828');
    grad.addColorStop(0.85, '#0a1e30');
    grad.addColorStop(1, '#040a14');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 2, 256);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    this.scene.background = skyTex;

    this.scene.fog = new THREE.FogExp2(0x02060c, 0.0032);

    // Reflection cubemap for vehicles (procedural)
    this.envMap = this._generateEnvMap();

    // Starfield
    this._buildStars();

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
    this.camera.position.set(30, 50, 60);
    this.camera.lookAt(0, 0, 0);

    // Screen shake state
    this.shakeIntensity = 0;
    this.shakeDecay = 0.92;

    // Orbit Controls
    this.controls = new window.SimpleOrbitControls(this.camera, canvas);
    this.cameraMode = 'free';

    this._buildLights();
    this._buildGround();
    this._buildAmbientDust();
    this._buildClouds();

    this.treeCanopies = [];
    this.cloudTime = 0;

    this.v1Mesh = null;
    this.v2Mesh = null;
    this.fillerVehicles = [];
    this.impactMarker = null;
    this.roadMeshes = [];
    this.trajLine1 = null;
    this.trajLine2 = null;
    this.particles = [];
    this.particleTime = 0;

    this.animFrameId = null;
    this._render();
  }

  _generateEnvMap() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0, '#88bbff');
    grad.addColorStop(0.15, '#4466aa');
    grad.addColorStop(0.4, '#1a2a44');
    grad.addColorStop(0.7, '#0a1220');
    grad.addColorStop(1, '#020408');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 80; i++) {
      ctx.fillStyle = `hsla(${200 + Math.random()*40}, 80%, ${70 + Math.random()*30}%, ${Math.random() * 0.5})`;
      ctx.beginPath();
      ctx.arc(Math.random()*size, Math.random()*size, Math.random()*3+1, 0, Math.PI*2);
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
  }

  _buildStars() {
    const count = 800;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const r = 250 + Math.random() * 100;
      positions[i*3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i*3+1] = Math.abs(r * Math.cos(phi));
      positions[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
      sizes[i] = 0.5 + Math.random() * 1.5;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.6, transparent: true, opacity: 0.8,
      sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  _buildClouds() {
    this.clouds = [];
    const cloudTexCanvas = document.createElement('canvas');
    cloudTexCanvas.width = 128; cloudTexCanvas.height = 64;
    const ctx = cloudTexCanvas.getContext('2d');
    const grad = ctx.createRadialGradient(64, 32, 0, 64, 32, 64);
    grad.addColorStop(0, 'rgba(200,210,230,0.5)');
    grad.addColorStop(0.3, 'rgba(180,195,220,0.25)');
    grad.addColorStop(0.6, 'rgba(160,175,200,0.1)');
    grad.addColorStop(1, 'rgba(100,120,150,0)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 64);
    const cloudTex = new THREE.CanvasTexture(cloudTexCanvas);

    const cloudPositions = [
      [-120, 55, -80], [-80, 60, -60], [-30, 50, -100], [20, 65, -70], [70, 55, -90],
      [110, 60, -50], [-100, 70, -30], [-50, 55, -40], [0, 65, -50], [50, 50, -60],
      [100, 70, -40], [-70, 60, -110], [40, 55, -110], [-40, 65, -80], [80, 60, -100]
    ];
    cloudPositions.forEach(([x, y, z]) => {
      const scale = 8 + Math.random() * 12;
      const mat = new THREE.SpriteMaterial({
        map: cloudTex, transparent: true, depthWrite: false,
        blending: THREE.AdditiveBlending, opacity: 0.4 + Math.random() * 0.2,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(x, y, z);
      sprite.scale.set(scale * (1 + Math.random() * 0.5), scale * 0.3, 1);
      sprite.userData = { speed: 0.2 + Math.random() * 0.4, startX: x };
      this.scene.add(sprite);
      this.clouds.push(sprite);
    });
  }

  _buildLights() {
    const ambient = new THREE.AmbientLight(0x0a1628, 1.2);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0x4488cc, 0x050810, 0.8);
    this.scene.add(hemi);
    const moonLight = new THREE.DirectionalLight(0x6688bb, 2.0);
    moonLight.position.set(-40, 70, 30); moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(4096, 4096);
    moonLight.shadow.camera.near = 0.5; moonLight.shadow.camera.far = 300;
    moonLight.shadow.camera.left = -120; moonLight.shadow.camera.right = 120;
    moonLight.shadow.camera.top = 120; moonLight.shadow.camera.bottom = -120;
    moonLight.shadow.bias = -0.0005;
    this.scene.add(moonLight);
    const fillLight = new THREE.DirectionalLight(0x223355, 1.0);
    fillLight.position.set(30, 40, -30); this.scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0x8866aa, 0.6);
    rimLight.position.set(0, 10, -80); this.scene.add(rimLight);
    this.impactLight = new THREE.PointLight(0xff6622, 0, 35, 2);
    this.impactLight.position.set(0, 3, 0); this.scene.add(this.impactLight);
  }

  _buildGround() {
    const groundGeo = new THREE.PlaneGeometry(400, 400);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x050a14, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.15;
    ground.receiveShadow = true; this.scene.add(ground);
    const gridHelper = new THREE.GridHelper(400, 80, 0x0a1a30, 0x061020);
    gridHelper.position.y = -0.1; gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.6; this.scene.add(gridHelper);
  }

  _buildAmbientDust() {
    this.dustParticles = [];
    const count = 200;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i*3] = (Math.random() - 0.5) * 160;
      positions[i*3+1] = Math.random() * 20 + 1;
      positions[i*3+2] = (Math.random() - 0.5) * 160;
      sizes[i] = Math.random() * 3 + 1;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    const mat = new THREE.PointsMaterial({
      color: 0x666688, size: 0.3, transparent: true, opacity: 0.25,
      sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.dustSystem = new THREE.Points(geo, mat);
    this.dustSystem.position.y = 0; this.scene.add(this.dustSystem);
  }

  buildRoad(infraestructura) {
    this.roadMeshes.forEach(m => this.scene.remove(m));
    this.roadMeshes = [];

    const aspCanvas = document.createElement('canvas');
    aspCanvas.width = 256; aspCanvas.height = 256;
    const actx = aspCanvas.getContext('2d');
    actx.fillStyle = '#151a28'; actx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) {
      const g = Math.floor(20 + Math.random() * 20);
      actx.fillStyle = `rgb(${g+10},${g+15},${g+30})`;
      actx.fillRect(Math.random()*256, Math.random()*256, Math.random()*3+1, Math.random()*2+0.5);
    }
    const aspTex = new THREE.CanvasTexture(aspCanvas);
    aspTex.wrapS = aspTex.wrapT = THREE.RepeatWrapping;
    aspTex.repeat.set(12, 12);

    const asphalt = new THREE.MeshStandardMaterial({
      map: aspTex, color: 0x8a9aaa, roughness: 0.92, metalness: 0.08,
    });
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeaa, roughness: 0.7, emissive: 0x333300, emissiveIntensity: 0.5,
    });
    const edgeMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc, roughness: 0.8, emissive: 0x111111,
    });
    const sidewalkMat = new THREE.MeshStandardMaterial({
      color: 0x2a3245, roughness: 0.92, metalness: 0.05,
    });
    const buildingColors = [0x0f1524, 0x1a1520, 0x151a28, 0x12181f, 0x0e1a1e, 0x1a1a1a];

    const addBox = (w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d, 2, 2, 2), mat);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true; mesh.castShadow = (mat === buildingMat);
      this.scene.add(mesh); this.roadMeshes.push(mesh);
    };

    const buildingMat = new THREE.MeshStandardMaterial({
      color: buildingColors[0], roughness: 0.85, metalness: 0.3,
    });

    const makeBuilding = (w, h, d, x, z) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const bColor = buildingColors[Math.floor(Math.random() * buildingColors.length)];
      const bMat = new THREE.MeshStandardMaterial({ color: bColor, roughness: 0.85, metalness: 0.3 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bMat);
      body.position.y = h/2; body.castShadow = true; body.receiveShadow = true;
      group.add(body);
      const cols = Math.max(4, Math.floor(w / 2.5));
      const rows = Math.max(4, Math.floor(h / 3));
      const spacingW = w / (cols + 1);
      const spacingH = h / (rows + 1);
      const winBaseHue = Math.random() > 0.5 ? 0.08 : 0.6;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (Math.random() > 0.3) {
            const winMat = new THREE.MeshPhysicalMaterial({
              color: new THREE.Color().setHSL(winBaseHue + Math.random()*0.05, 0.8, 0.5 + Math.random()*0.3),
              emissive: new THREE.Color().setHSL(winBaseHue, 0.9, 0.4),
              emissiveIntensity: 0.3 + Math.random() * 1.2,
              transparent: true, opacity: 0.3 + Math.random() * 0.5,
              roughness: 0.1, metalness: 0.2,
            });
            const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8, 2, 2), winMat);
            win.position.set(
              (c - (cols-1)/2) * spacingW,
              h * 0.15 + (r / (rows-1 || 1)) * h * 0.7,
              d/2 + 0.01
            );
            group.add(win);
            const win2 = win.clone();
            win2.position.z = -d/2 - 0.01; win2.rotation.y = Math.PI;
            group.add(win2);
          }
        }
      }
      this.scene.add(group);
      this.roadMeshes.push(group);
    };

    const treeMat = new THREE.MeshPhysicalMaterial({ color: 0x0d1a10, roughness: 0.9, metalness: 0.0 });
    const trunkMat = new THREE.MeshPhysicalMaterial({ color: 0x1a1210, roughness: 1.0, metalness: 0.0 });
    const addTree = (x, z, scale) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3*scale, 0.5*scale, 3*scale, 12, 1), trunkMat);
      trunk.position.y = 1.5*scale; trunk.castShadow = true; group.add(trunk);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2*scale, 12, 12), treeMat);
      crown.position.y = 3.5*scale + 1.2*scale; crown.castShadow = true;
      crown.scale.y = 0.8 + Math.random() * 0.2; group.add(crown);
      this.treeCanopies.push(crown);
      this.scene.add(group); this.roadMeshes.push(group);
    };

    const addLamp = (x, z, angle) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z); group.rotation.y = angle;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 12, 16, 3), buildingMat);
      pole.position.y = 6; pole.castShadow = true; group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.3, 0.6, 1, 1, 1), buildingMat);
      head.position.set(1.0, 12, 0); group.add(head);
      const bulb = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.4, 1, 1), new THREE.MeshBasicMaterial({color: 0xffffff}));
      bulb.rotation.x = Math.PI / 2; bulb.position.set(1.0, 11.84, 0); group.add(bulb);
      const light = new THREE.PointLight(0xfff5e0, 2.0, 45, 1.8);
      light.position.set(1.0, 11.5, 0);
      light.shadow.bias = -0.001; group.add(light);
      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = 64; glowCanvas.height = 64;
      const ctx = glowCanvas.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,240,0.8)'); grad.addColorStop(0.2, 'rgba(255,255,200,0.3)');
      grad.addColorStop(0.5, 'rgba(200,200,255,0.08)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 64, 64);
      const glowTex = new THREE.CanvasTexture(glowCanvas);
      const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 });
      const glow = new THREE.Sprite(glowMat);
      glow.position.set(1.0, 11.0, 0); glow.scale.set(8, 8, 1); group.add(glow);
      this.scene.add(group); this.roadMeshes.push(group);
    };

    const signMat = new THREE.MeshPhysicalMaterial({ color: 0xcc2222, roughness: 0.3, metalness: 0.1, emissive: 0x881111, emissiveIntensity: 0.3 });
    const signPoleMat = new THREE.MeshPhysicalMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.4 });
    const textMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.0 });
    const addSign = (x, z, angle, type) => {
      const group = new THREE.Group();
      group.position.set(x, 0, z); group.rotation.y = angle;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.5, 8, 1), signPoleMat);
      pole.position.y = 1.25; group.add(pole);
      if (type === 'stop') {
        const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 8), signMat);
        sign.position.y = 2.8; sign.rotation.x = 0; group.add(sign);
        const text = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), textMat);
        text.position.set(0, 2.8, 0.36); group.add(text);
      } else {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.05, 1, 1, 1), new THREE.MeshPhysicalMaterial({ color: 0x1166aa, roughness: 0.4 }));
        sign.position.y = 2.8; group.add(sign);
        const text = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), textMat);
        text.position.set(0, 2.8, 0.04); group.add(text);
      }
      this.scene.add(group); this.roadMeshes.push(group);
    };

    if (infraestructura === 'interseccion_cruciforme' || infraestructura === 'interseccion') {
      addBox(140, 0.1, 16, 0, 0, 0, asphalt);
      addBox(16, 0.1, 140, 0, 0, 0, asphalt);
      addBox(62, 0.2, 62, -39, 0, -39, sidewalkMat);
      addBox(62, 0.2, 62, 39, 0, -39, sidewalkMat);
      addBox(62, 0.2, 62, -39, 0, 39, sidewalkMat);
      addBox(62, 0.2, 62, 39, 0, 39, sidewalkMat);
      makeBuilding(40, 30, 40, -40, -40);
      makeBuilding(30, 45, 50, 45, -45);
      makeBuilding(50, 20, 35, -45, 45);
      makeBuilding(35, 60, 35, 45, 45);
      addTree(-32, -32, 0.8); addTree(32, -32, 1.0); addTree(-32, 32, 0.9); addTree(32, 32, 1.1);
      addTree(-55, -55, 1.2); addTree(55, -55, 0.7); addTree(-55, 55, 1.0); addTree(55, 55, 0.9);
      addTree(-45, -45, 0.9); addTree(45, -45, 1.1); addTree(-45, 45, 1.0); addTree(45, 45, 0.8);
      addLamp(-12, -12, Math.PI/4); addLamp(12, -12, 3*Math.PI/4);
      addLamp(-12, 12, -Math.PI/4); addLamp(12, 12, -3*Math.PI/4);
      addLamp(-26, 0, Math.PI/2); addLamp(26, 0, -Math.PI/2);
      addLamp(0, -26, 0); addLamp(0, 26, Math.PI);

      const addTrafficLight = (x, z, rotY) => {
        const tGroup = new THREE.Group();
        tGroup.position.set(x, 0, z); tGroup.rotation.y = rotY;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 5, 12, 3),
          new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.5 }));
        pole.position.y = 2.5; pole.castShadow = true; tGroup.add(pole);
        const housing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.4),
          new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.3 }));
        housing.position.y = 5.2; tGroup.add(housing);
        const colors = [0xff0000, 0xffaa00, 0x00ff00];
        const emissives = [0xff0000, 0xffaa00, 0x00ff00];
        for (let i = 0; i < 3; i++) {
          const light = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16),
            new THREE.MeshPhysicalMaterial({ color: colors[i], emissive: emissives[i], emissiveIntensity: i === 0 ? 2.5 : 0.4, roughness: 0.1, metalness: 0.1 }));
          light.position.set(0, 5.55 - i * 0.28, 0.23); tGroup.add(light);
        }
        this.scene.add(tGroup); this.roadMeshes.push(tGroup);
      };
      addTrafficLight(-18, -18, Math.PI/4); addTrafficLight(18, -18, 3*Math.PI/4);
      addTrafficLight(-18, 18, -Math.PI/4); addTrafficLight(18, 18, -3*Math.PI/4);

      addSign(-22, -22, Math.PI/4, 'stop'); addSign(22, -22, 3*Math.PI/4, 'stop');
      addSign(-22, 22, -Math.PI/4, 'stop'); addSign(22, 22, -3*Math.PI/4, 'stop');

      // ─────── ROAD MARKINGS (lane lines + crosswalks) ───────
      const dashMat = new THREE.MeshStandardMaterial({ color: 0xeeeecc, roughness: 0.5, side: THREE.DoubleSide });
      const yellowMat = new THREE.MeshStandardMaterial({ color: 0xddcc44, roughness: 0.5, side: THREE.DoubleSide });
      const crossMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x444444, emissiveIntensity: 0.3, side: THREE.DoubleSide });

      const dashX = (x, z, len) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.15), dashMat);
        m.rotation.x = -Math.PI/2; m.position.set(x, 0.12, z);
        this.scene.add(m); this.roadMeshes.push(m);
      };
      const dashZ = (z, x, len) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, len), dashMat);
        m.rotation.x = -Math.PI/2; m.position.set(x, 0.12, z);
        this.scene.add(m); this.roadMeshes.push(m);
      };

      // Horizontal road lane lines (z = -2, +2 lane boundaries)
      for (let x = -68; x <= 68; x += 3.2) {
        if (Math.abs(x) < 8) continue;
        dashX(x, -2.2, 1.8); dashX(x, 2.2, 1.8);
      }
      // Double yellow center line (z = 0)
      for (let x = -68; x <= 68; x += 3.2) {
        if (Math.abs(x) < 8) continue;
        const c1 = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.1), yellowMat);
        c1.rotation.x = -Math.PI/2; c1.position.set(x, 0.13, 0.14);
        this.scene.add(c1); this.roadMeshes.push(c1);
        const c2 = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.1), yellowMat);
        c2.rotation.x = -Math.PI/2; c2.position.set(x, 0.13, -0.14);
        this.scene.add(c2); this.roadMeshes.push(c2);
      }
      // Edge lines
      for (let x = -69; x <= 69; x += 2) {
        if (Math.abs(x) < 8) continue;
        dashX(x, 7.4, 1.0); dashX(x, -7.4, 1.0);
      }

      // Vertical road lane lines (x = -2, +2 lane boundaries)
      for (let z = -68; z <= 68; z += 3.2) {
        if (Math.abs(z) < 8) continue;
        dashZ(z, -2.2, 1.8); dashZ(z, 2.2, 1.8);
      }
      // Double yellow center line (x = 0)
      for (let z = -68; z <= 68; z += 3.2) {
        if (Math.abs(z) < 8) continue;
        const c1 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1.8), yellowMat);
        c1.rotation.x = -Math.PI/2; c1.position.set(0.14, 0.13, z);
        this.scene.add(c1); this.roadMeshes.push(c1);
        const c2 = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 1.8), yellowMat);
        c2.rotation.x = -Math.PI/2; c2.position.set(-0.14, 0.13, z);
        this.scene.add(c2); this.roadMeshes.push(c2);
      }
      for (let z = -69; z <= 69; z += 2) {
        if (Math.abs(z) < 8) continue;
        dashZ(z, 7.4, 1.0); dashZ(z, -7.4, 1.0);
      }

      // Crosswalks (white stripes across each approach)
      const crosswalk = (cx, cz, isX) => {
        for (let i = 0; i < 6; i++) {
          const m = new THREE.Mesh(new THREE.PlaneGeometry(isX ? 0.35 : 3.2, isX ? 3.2 : 0.35), crossMat);
          m.rotation.x = -Math.PI/2;
          if (isX) m.position.set(cx, 0.12, cz - 1.6 + i * 0.6);
          else m.position.set(cx - 1.6 + i * 0.6, 0.12, cz);
          this.scene.add(m); this.roadMeshes.push(m);
        }
      };
      crosswalk(0, -8.3, true); crosswalk(0, 8.3, true);
      crosswalk(-8.3, 0, false); crosswalk(8.3, 0, false);
    } else if (infraestructura === 'recta') {
      addBox(200, 0.1, 30, 0, 0, 0, asphalt);
      addBox(200, 0.25, 15, 0, 0, -25, sidewalkMat);
      addBox(200, 0.25, 15, 0, 0, 25, sidewalkMat);
      for (const z of [-18, 18]) addBox(200, 0.05, 0.5, 0, 0.08, z, edgeMat);
      for (let bx = -80; bx <= 80; bx += 20) {
        if (Math.random() > 0.3) makeBuilding(20, 15 + Math.random() * 40, 15 + Math.random() * 20, bx, -30);
        if (Math.random() > 0.3) makeBuilding(20, 15 + Math.random() * 40, 15 + Math.random() * 20, bx, 30);
      }
      for (let bx = -70; bx <= 70; bx += 15) { addTree(bx, -35, 1.0 + Math.random()*0.5); addTree(bx, 35, 1.0 + Math.random()*0.5); }
      for (let bx = -80; bx <= 80; bx += 10) { addLamp(bx, -22, Math.PI/2); addLamp(bx, 22, -Math.PI/2); }
    } else if (infraestructura === 'rotonda') {
      const rInner = 18, rOuter = 30;
      const shape = new THREE.Shape();
      shape.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.15, bevelEnabled: false });
      const ring = new THREE.Mesh(geo, asphalt);
      ring.rotation.x = -Math.PI / 2; ring.receiveShadow = true;
      this.scene.add(ring); this.roadMeshes.push(ring);
      for (const angle of [0, 90, 180, 270]) {
        const rad = angle * Math.PI / 180;
        const length = 50, width = 14;
        const dx = Math.cos(rad) * length / 2, dz = Math.sin(rad) * length / 2;
        const box = new THREE.Mesh(new THREE.BoxGeometry(length, 0.1, width, 4, 1, 2), asphalt);
        box.position.set(dx, 0.05, dz); box.rotation.y = rad;
        this.scene.add(box); this.roadMeshes.push(box);
      }
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const bx = Math.cos(angle) * 60, bz = Math.sin(angle) * 60;
        makeBuilding(20 + Math.random() * 30, 15 + Math.random() * 25, 20 + Math.random() * 30, bx, bz);
      }
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        addLamp(Math.cos(angle) * 50, Math.sin(angle) * 50, angle - Math.PI / 2);
      }
    } else { // curva
      const curveRadius = 40, laneWidth = 7, sidewalkWidth = 5;
      const numSegments = 64, arc = Math.PI / 2;
      for (let i = 0; i < numSegments; i++) {
        const t = i / numSegments;
        const angle = (Math.PI / 2) * t;
        const x = Math.cos(angle) * curveRadius, z = -Math.sin(angle) * curveRadius;
        const tx = -Math.sin(angle), tz = -Math.cos(angle);
        const angleRad = Math.atan2(tx, tz);
        const seg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, laneWidth, 2, 1, 2), asphalt);
        seg.position.set(x, 0.05, z); seg.rotation.y = angleRad;
        this.scene.add(seg); this.roadMeshes.push(seg);
      }
      for (let i = 0; i < 6; i++) {
        const t = (i + 1) / 7;
        const angle = (Math.PI / 2) * t;
        const x = Math.cos(angle) * (curveRadius + laneWidth + sidewalkWidth + 10);
        const z = -Math.sin(angle) * (curveRadius + laneWidth + sidewalkWidth + 10);
        makeBuilding(15 + Math.random() * 20, 10 + Math.random() * 15, 15 + Math.random() * 20, x, z);
      }
    }
  }

  _makeVehicle(colorHex, emissiveHex, type) {
    const group = new THREE.Group();
    group.userData.wheels = [];

    // ═══════════════════════════════════════════════════════════
    //  COORDINATE SYSTEM (strict)
    //    X = lateral (LEFT / RIGHT), symmetric about X = 0
    //    Y = vertical (UP),          ground at Y = 0
    //    Z = longitudinal,           FRONT = −Z, REAR = +Z
    // ═══════════════════════════════════════════════════════════

    const isSUV    = type === 'suv';
    const isPickup = type === 'camioneta';
    const isHatch  = type === 'hatchback';
    const isSport  = type === 'deportivo';

    // ─── PROPORTIONAL DIMENSIONS ──────────────────────────────
    const bodyLen  = isPickup ? 4.6 : (isSUV ? 4.6 : (isSport ? 3.8 : 4.5));
    const bodyWid  = isPickup ? 1.9 : (isSUV ? 1.9 : (isSport ? 1.9 : 1.8));
    const bodyH    = isPickup ? 0.75 : (isSUV ? 0.8 : (isSport ? 0.5 : 0.6));
    const cabinLen = isPickup ? 1.8 : (isSUV ? 3.2 : (isSport ? 1.8 : 2.2));
    const cabinW   = bodyWid - 0.2;
    const cabinH   = isSUV ? 1.0 : (isPickup ? 0.9 : (isSport ? 0.7 : 0.8));
    const wheelR   = isSUV ? 0.35 : (isSport ? 0.28 : 0.30);
    const wheelW   = 0.22;
    const axleHalf = bodyLen / 2.8;
    const hoodLen  = bodyLen * 0.25;

    // ─── MATERIALS ────────────────────────────────────────────
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: colorHex, roughness: 0.15, metalness: 0.85,
      clearcoat: 1.0, clearcoatRoughness: 0.1,
      envMap: this.envMap, envMapIntensity: 2.5, reflectivity: 1.0, ior: 1.5,
    });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x020c18, roughness: 0.05, metalness: 0.0,
      transparent: true, opacity: 0.4, envMap: this.envMap, envMapIntensity: 1.2,
      clearcoat: 1.0, ior: 1.45, transmission: 0.9, thickness: 0.3,
    });
    const rubberMat = new THREE.MeshPhysicalMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.0 });
    const chromeMat = new THREE.MeshPhysicalMaterial({
      color: 0xe0e0e0, roughness: 0.008, metalness: 1.0,
      envMap: this.envMap, envMapIntensity: 3.0, clearcoat: 1.5, clearcoatRoughness: 0.005,
    });
    const darkMat = new THREE.MeshPhysicalMaterial({ color: 0x020202, roughness: 0.3, metalness: 0.1 });
    const lightMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 12, roughness: 0.02, metalness: 0.0,
    });
    const tailMat = new THREE.MeshPhysicalMaterial({
      color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 10, roughness: 0.05, metalness: 0.0,
    });
    const redGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0xff0000, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.7,
      transmission: 0.8, thickness: 0.2,
    });
    const seatMat = new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.0 });
    const bumperMat = new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.2 });

    const box = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      group.add(m); return m;
    };

    // ═══════════════════════════════════════════════════════════
    //  1. CHASSIS BASE  (full-length box, centred at origin)
    // ═══════════════════════════════════════════════════════════
    box(bodyWid, bodyH, bodyLen, 0, bodyH / 2, 0, bodyMat);

    // ═══════════════════════════════════════════════════════════
    //  2. HOOD  (front section, −Z)
    // ═══════════════════════════════════════════════════════════
    const hoodH = bodyH * 0.65;
    box(bodyWid * 0.92, hoodH, hoodLen, 0, hoodH / 2, -(bodyLen / 2 - hoodLen / 2), bodyMat);

    // ═══════════════════════════════════════════════════════════
    //  3. TRUNK  (rear section, +Z) — sedan / hatch / sport
    // ═══════════════════════════════════════════════════════════
    if (!isPickup) {
      const trunkLen = bodyLen * 0.2, trunkH = bodyH * 0.65;
      box(bodyWid * 0.88, trunkH, trunkLen, 0, trunkH / 2, bodyLen / 2 - trunkLen / 2, bodyMat);
    }

    // ═══════════════════════════════════════════════════════════
    //  4. CABIN  (centred on chassis; pickup offset forward)
    // ═══════════════════════════════════════════════════════════
    const cabinY = bodyH + cabinH / 2;
    const cabinZ = isPickup ? -(bodyLen / 2 - hoodLen - cabinLen / 2) : 0;
    box(cabinW, cabinH, cabinLen, 0, cabinY, cabinZ, bodyMat);

    // ═══════════════════════════════════════════════════════════
    //  5. PICKUP CARGO BED  (rear, +Z)
    // ═══════════════════════════════════════════════════════════
    if (isPickup) {
      const bedLen = bodyLen - hoodLen - cabinLen - 0.1;
      const bedZ   = bodyLen / 2 - bedLen / 2;
      const bedMat = new THREE.MeshPhysicalMaterial({ color: 0x332222, roughness: 0.85, metalness: 0.1 });
      box(bedLen, 0.06, bodyWid * 0.85, 0, bodyH * 0.5, bedZ, bedMat);
      for (const s of [-1, 1])
        box(bedLen, 0.4, 0.04, 0, bodyH * 0.7, s * bodyWid * 0.42, bodyMat);
      box(0.04, 0.4, bodyWid * 0.85, bodyLen / 2, bodyH * 0.7, 0, bodyMat);       // tailgate
      // Side steps (cylindrical chrome)
      for (const s of [-1, 1]) {
        const step = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, cabinLen * 0.6, 12), chromeMat);
        step.rotation.x = Math.PI / 2;
        step.position.set(s * (bodyWid / 2 + 0.05), bodyH * 0.35, cabinZ);
        group.add(step);
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  6. WHEELS  — CylinderGeometry, axle along X, bottom at Y = 0
    // ═══════════════════════════════════════════════════════════
    const makeWheel = (x, z) => {
      const wg = new THREE.Group();
      wg.position.set(x, wheelR, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 32), rubberMat);
      tire.rotation.z = Math.PI / 2; tire.castShadow = true; wg.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.65, wheelR * 0.65, wheelW * 0.8, 32), chromeMat);
      rim.rotation.z = Math.PI / 2; wg.add(rim);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(wheelR * 0.08, wheelR * 0.25, wheelW * 0.55), chromeMat);
        spoke.position.set(Math.sin(a) * wheelR * 0.35, Math.cos(a) * wheelR * 0.35, 0);
        wg.add(spoke);
      }
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(wheelR * 0.18, wheelR * 0.2, wheelW * 0.12, 16), chromeMat);
      cap.rotation.z = Math.PI / 2; wg.add(cap);
      const caliper = new THREE.Mesh(new THREE.BoxGeometry(wheelR * 0.08, wheelR * 0.18, wheelW * 0.25),
        new THREE.MeshPhysicalMaterial({ color: 0xcc1111, roughness: 0.3, metalness: 0.6 }));
      caliper.position.set(0, 0, wheelW * 0.45); wg.add(caliper);
      group.add(wg); return wg;
    };
    group.userData.wheels.push(makeWheel(-bodyWid / 2, -axleHalf));
    group.userData.wheels.push(makeWheel( bodyWid / 2, -axleHalf));
    group.userData.wheels.push(makeWheel(-bodyWid / 2,  axleHalf));
    group.userData.wheels.push(makeWheel( bodyWid / 2,  axleHalf));

    for (const s of [-1, 1]) {
      for (const z of [-axleHalf, axleHalf]) {
        const archR = bodyWid * 0.22;
        const arch = new THREE.Mesh(new THREE.CylinderGeometry(archR, archR, 0.15, 16, 1, true, 0, Math.PI), bodyMat);
        arch.rotation.z = Math.PI / 2;
        arch.position.set(s * bodyWid * 0.46, bodyH * 0.15, z);
        arch.scale.set(0.6, 1, 1.1); group.add(arch);
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  7. GLASS  — windshield (−Z), rear (+Z), sides (±X)
    // ═══════════════════════════════════════════════════════════
    const glassH = cabinH * 0.8;
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(cabinW, glassH), glassMat);
    windshield.position.set(0, cabinY, cabinZ - cabinLen / 2);
    windshield.rotation.y = Math.PI; windshield.rotation.x = 0.15;
    group.add(windshield);
    const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(cabinW, cabinH * 0.7), glassMat);
    rearGlass.position.set(0, cabinY, cabinZ + cabinLen / 2);
    rearGlass.rotation.x = -0.15;
    group.add(rearGlass);
    for (const s of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(cabinLen * 0.8, cabinH * 0.7), glassMat);
      sw.position.set(s * (cabinW / 2 + 0.01), cabinY, cabinZ);
      sw.rotation.y = Math.PI / 2; group.add(sw);
    }

    // ═══════════════════════════════════════════════════════════
    //  8. HEADLIGHTS  — front (−Z), symmetric in X
    // ═══════════════════════════════════════════════════════════
    const hlMat = new THREE.MeshPhysicalMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 16, roughness: 0.02, metalness: 0.0 });
    const hlGlowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const ctx = c.getContext('2d'); const g = ctx.createRadialGradient(32,32,0,32,32,32); g.addColorStop(0,'rgba(255,255,200,1)'); g.addColorStop(0.3,'rgba(255,255,200,0.6)'); g.addColorStop(1,'rgba(255,255,200,0)'); ctx.fillStyle = g; ctx.fillRect(0,0,64,64); return new THREE.CanvasTexture(c); })();
    const hlGlowMat = new THREE.SpriteMaterial({ map: hlGlowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const s of [-1, 1]) {
      box(0.15, 0.14, 0.08, s * bodyWid * 0.42, bodyH * 0.55, -(bodyLen / 2 + 0.04), darkMat);
      const hlBulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), hlMat);
      hlBulb.position.set(s * bodyWid * 0.42, bodyH * 0.55, -(bodyLen / 2 + 0.05));
      group.add(hlBulb);
      const glow = new THREE.Sprite(hlGlowMat);
      glow.position.set(s * bodyWid * 0.42, bodyH * 0.55, -(bodyLen / 2 + 0.3));
      glow.scale.set(2.5, 1.5, 1); group.add(glow);
      const hlSpot = new THREE.PointLight(0xffffcc, 2.5, 18, 1.8);
      hlSpot.position.set(s * bodyWid * 0.42, bodyH * 0.55, -(bodyLen / 2 + 0.5));
      group.add(hlSpot);
    }

    // ═══════════════════════════════════════════════════════════
    //  9. TAILLIGHTS  — rear (+Z), symmetric in X
    // ═══════════════════════════════════════════════════════════
    for (const s of [-1, 1]) {
      box(0.15, 0.14, 0.06, s * bodyWid * 0.42, bodyH * 0.55, bodyLen / 2 + 0.04, redGlassMat);
      const tlBulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), tailMat);
      tlBulb.position.set(s * bodyWid * 0.42, bodyH * 0.55, bodyLen / 2 + 0.05);
      group.add(tlBulb);
    }

    // ═══════════════════════════════════════════════════════════
    //  10. BUMPERS & GRILLE
    // ═══════════════════════════════════════════════════════════
    box(bodyWid * 0.55, 0.25, 0.12, 0, bodyH * 0.2, -(bodyLen / 2 + 0.06), bumperMat); // front
    box(bodyWid * 0.55, 0.3,  0.12, 0, bodyH * 0.15, bodyLen / 2 + 0.06, bumperMat);     // rear
    box(bodyWid * 0.35, bodyH * 0.4, 0.02, 0, bodyH * 0.55, -(bodyLen / 2 + 0.06), darkMat);
    for (let i = -3; i <= 3; i++)
      box(bodyWid * 0.28, 0.015, 0.01, 0, bodyH * 0.55 + i * 0.04, -(bodyLen / 2 + 0.07), chromeMat);
    if (isSport) {
      for (const s of [-0.15, 0.15]) {
        const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.12, 16, 1), chromeMat);
        exhaust.rotation.x = Math.PI / 2;
        exhaust.position.set(s * bodyWid * 0.2, bodyH * 0.3, bodyLen / 2 + 0.08);
        group.add(exhaust);
      }
    }

    // ═══════════════════════════════════════════════════════════
    //  11. SIDE MIRRORS  — symmetric in X
    // ═══════════════════════════════════════════════════════════
    for (const s of [-1, 1]) {
      const mg = new THREE.Group();
      mg.position.set(s * (cabinW / 2 + 0.15), cabinY + cabinH * 0.4, cabinZ + cabinLen * 0.3);
      const mb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.15), bodyMat);
      mb.position.z = 0.05; mg.add(mb);
      const mf = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.03), chromeMat);
      mf.position.z = -0.05; mg.add(mf);
      group.add(mg);
    }

    // ═══════════════════════════════════════════════════════════
    //  12. DOOR LINES  — symmetric in X
    // ═══════════════════════════════════════════════════════════
    for (const s of [-1, 1]) {
      const dl = new THREE.Mesh(new THREE.BoxGeometry(0.005, bodyH * 0.5, bodyLen * 0.45), darkMat);
      dl.position.set(s * (bodyWid / 2 + 0.001), bodyH * 0.6, 0); group.add(dl);
    }

    // ═══════════════════════════════════════════════════════════
    //  13. INTERIOR  — dashboard, steering, seats (symmetric X)
    // ═══════════════════════════════════════════════════════════
    box(cabinW * 0.8, 0.12, cabinLen * 0.35, 0, bodyH + 0.12, cabinZ + cabinLen * 0.25, darkMat);
    const stg = new THREE.Group();
    stg.position.set(0, bodyH + 0.45, cabinZ + cabinLen * 0.2);
    const sr = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 12, 24), new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.7, metalness: 0.1 }));
    sr.rotation.x = Math.PI / 3; stg.add(sr); group.add(stg);
    for (const s of [-1, 1]) {
      const sg = new THREE.Group();
      sg.position.set(s * cabinW * 0.2, bodyH + 0.05, cabinZ - cabinLen * 0.05);
      const sb = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.25), seatMat);
      sb.position.y = 0.04; sg.add(sb);
      const sback = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.25, 0.04), seatMat);
      sback.position.set(0, 0.2, -0.05); sback.rotation.x = 0.15; sg.add(sback);
      const hr = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.1, 0.04), seatMat);
      hr.position.set(0, 0.4, -0.05); sg.add(hr);
      group.add(sg);
    }

    // ═══════════════════════════════════════════════════════════
    //  14. WIPERS, ANTENNA, HOOD LINE
    // ═══════════════════════════════════════════════════════════
    for (const s of [-0.15, 0.15]) {
      const wiper = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.01, cabinW * 0.35), darkMat);
      wiper.position.set(s * cabinW * 0.2, bodyH + cabinH + 0.12, cabinZ - cabinLen / 2 + 0.1);
      wiper.rotation.x = 0.2; group.add(wiper);
    }
    if (!isSport) {
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.015, 0.25, 8), darkMat);
      antenna.position.set(0, bodyH + cabinH + 0.25, cabinZ - cabinLen * 0.2);
      group.add(antenna);
    }

    // ═══════════════════════════════════════════════════════════
    //  15. SPORT SPOILER  (rear, +Z)
    // ═══════════════════════════════════════════════════════════
    if (isSport) {
      box(0.01, 0.06, bodyWid * 0.45, 0, bodyH + cabinH + 0.05, bodyLen / 2 - 0.1, darkMat);
    }

    // ═══════════════════════════════════════════════════════════
    //  16. NEON UNDERGLOW
    // ═══════════════════════════════════════════════════════════
    const neonMat = new THREE.MeshPhysicalMaterial({
      color: emissiveHex, emissive: emissiveHex, emissiveIntensity: 4.0,
      transparent: true, opacity: 0.9, roughness: 0.1, metalness: 0.2,
    });
    const neon = new THREE.Mesh(new THREE.BoxGeometry(bodyWid * 0.7, 0.04, bodyLen * 0.7, 2, 1, 1), neonMat);
    neon.position.set(0, 0.12, 0); group.add(neon);
    const underGlow = new THREE.PointLight(emissiveHex, 4.0, 15);
    underGlow.position.set(0, 0.15, 0); group.add(underGlow);

    // ═══════════════════════════════════════════════════════════
    //  17. GROUND OFFSET  (lowest point of wheels = Y 0)
    // ═══════════════════════════════════════════════════════════
    group.userData.wheelBottomY = -wheelR;

    return group;
  }

  // ─────── TRUCK — PETERBILT 579 / KENWORTH T880 (V1) ───────
  _makeTruck(colorHex) {
    const group = new THREE.Group();
    group.userData.wheels = [];
    const col = colorHex || 0xcc2222;

    // ── Materials (roughness:0.2 / metalness:0.8 for paint) ──
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.2, metalness: 0.8, clearcoat: 0.5, clearcoatRoughness: 0.15, envMap: this.envMap, envMapIntensity: 2.0 });
    const grayMat = new THREE.MeshPhysicalMaterial({ color: 0x888888, roughness: 0.3, metalness: 0.7 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x020c18, roughness: 0.005, metalness: 0.0, transparent: true, opacity: 0.65, envMap: this.envMap, envMapIntensity: 1.0, ior: 1.45 });
    const rubberMat = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.9, metalness: 0.0 });
    const rimMat = new THREE.MeshPhysicalMaterial({ color: 0xaaaaaa, roughness: 0.15, metalness: 0.9 });
    const darkMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, roughness: 0.8, metalness: 0.2 });
    const intMat = new THREE.MeshPhysicalMaterial({ color: 0x151515, roughness: 0.6, metalness: 0.05 });
    const hlMat = new THREE.MeshPhysicalMaterial({ color: 0xffffdd, emissive: 0xffffdd, emissiveIntensity: 22, roughness: 0.02, metalness: 0.0 });

    const box = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      group.add(m); return m;
    };

    const tLen = 6.0, tWid = 2.2, fH = 0.55, cabH = 1.6, hoodLen = 1.3, cabLen = 1.4, slLen = 0.5, bedLen = 2.6;

    // Chasis base largo
    for (const side of [-1, 1]) {
      box(tLen - 0.4, 0.15, 0.06, 0, fH - 0.08, side * 0.35, darkMat);
      for (let i = -2.6; i <= 2.6; i += 1.0) box(0.06, 0.15, 0.7, i, fH - 0.08, 0, darkMat);
    }

    // Motor delantero angular (chato pero angular)
    const hoodH = 1.0;
    box(hoodLen, hoodH, tWid * 0.55, tLen/2 - hoodLen/2 - 0.15, fH + hoodH/2, 0, bodyMat);
    // Angulo frontal del capó (plano inclinado)
    const hoodFace = new THREE.Mesh(new THREE.PlaneGeometry(tWid * 0.55, hoodH * 0.8), bodyMat);
    hoodFace.position.set(tLen/2 - 0.1, fH + hoodH * 0.6, 0);
    hoodFace.rotation.y = -0.3; group.add(hoodFace);

    // Parrilla frontal — rejilla procedimental (líneas grises)
    const grilleBack = new THREE.Mesh(new THREE.PlaneGeometry(tWid * 0.4, 1.1), darkMat);
    grilleBack.position.set(tLen/2, fH + 0.65, 0); group.add(grilleBack);
    for (let i = -4; i <= 4; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.018, tWid * 0.34), grayMat);
      bar.position.set(tLen/2 + 0.01, fH + 0.65 + i * 0.1, 0); group.add(bar);
    }
    box(0.03, 1.15, tWid * 0.42, tLen/2, fH + 0.65, 0, grayMat);

    // Parachoques delantero
    box(0.12, 0.28, tWid * 0.55, tLen/2 + 0.06, fH + 0.1, 0, darkMat);

    // Cabina dividida: motor angular + parabrisas 45° + dormitorio 15% más alto
    const cabX = tLen/2 - hoodLen - 0.15 - cabLen/2;
    const sleeperH = cabH * 1.15;
    box(cabLen, cabH, tWid * 0.62, cabX, fH + cabH/2, 0, bodyMat);

    // Parabrisas inclinado a 45° (planos)
    const wsW = tWid * 0.55, wsH = cabH * 0.55;
    const windshield = new THREE.Mesh(new THREE.PlaneGeometry(wsW, wsH), glassMat);
    windshield.position.set(cabX + cabLen/2 - 0.03, fH + cabH * 0.45, 0);
    windshield.rotation.y = -Math.PI / 4; group.add(windshield);

    // Dormitorio trasero 15% más alto que la cabina de conducción
    box(slLen, sleeperH, tWid * 0.62, cabX - cabLen/2 - slLen/2, fH + sleeperH/2, 0, bodyMat);
    // Ventana dormitorio
    const slWin = new THREE.Mesh(new THREE.PlaneGeometry(tWid * 0.4, sleeperH * 0.4), glassMat);
    slWin.position.set(cabX - cabLen/2 - slLen/2, fH + sleeperH * 0.4, tWid * 0.31); slWin.rotation.y = Math.PI / 2; group.add(slWin);
    // Ventanas laterales cabina
    for (const zOff of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(cabLen * 0.6, wsH * 0.7), glassMat);
      sw.position.set(cabX, fH + cabH * 0.4, zOff * (tWid * 0.31)); sw.rotation.y = Math.PI / 2; group.add(sw);
    }

    // Flatbed / Cargo
    const bedX = cabX - cabLen/2 - slLen - bedLen/2;
    box(bedLen, 0.06, tWid * 0.65, bedX, fH + 0.03, 0, darkMat);
    for (const s of [-1, 1]) box(bedLen, 0.5, 0.04, bedX, fH + 0.3, s * tWid * 0.33, bodyMat);
    box(0.04, 0.6, tWid * 0.6, bedX + bedLen/2 + 0.02, fH + 0.35, 0, bodyMat);

    // 2 espejos retrovisores verticales
    for (const zOff of [-1, 1]) {
      const mg = new THREE.Group();
      mg.position.set(cabX + cabLen * 0.1, fH + cabH * 0.5, zOff * (tWid * 0.62 / 2 + 0.05));
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8), grayMat);
      arm.rotation.z = Math.PI / 2; mg.add(arm);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.02), grayMat);
      mirror.position.set(0, 0.05, 0); mg.add(mirror);
      const mirrorGlass = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.005), new THREE.MeshPhysicalMaterial({ color: 0x88bbee, roughness: 0.05, metalness: 0.9 }));
      mirrorGlass.position.set(0, 0.05, 0.01); mg.add(mirrorGlass);
      group.add(mg);
    }

    // ─── 10 LLANTAS TOTALES (cilindros negros + rines gris claro) ───
    const tR = 0.34, rimR = 0.22;
    const makeWheel = (x, z, dual) => {
      const wg = new THREE.Group();
      wg.position.set(x, tR * 0.5, z);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 0.9, 0.3, 20), rubberMat);
      tire.rotation.x = Math.PI / 2; wg.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.95, 0.32, 20), rimMat);
      rim.rotation.x = Math.PI / 2; wg.add(rim);
      if (dual) {
        const t2 = new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 0.9, 0.3, 20), rubberMat);
        t2.rotation.x = Math.PI / 2; t2.position.x = 0.2; wg.add(t2);
        const r2 = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.95, 0.32, 20), rimMat);
        r2.rotation.x = Math.PI / 2; r2.position.x = 0.2; wg.add(r2);
      }
      group.add(wg); return wg;
    };
    // 2 frontales simples + 4 traseras dobles = 2+(4×2)=10 llantas
    group.userData.wheels.push(makeWheel(tLen/2 - 0.9, tWid * 0.42, false));
    group.userData.wheels.push(makeWheel(tLen/2 - 0.9, -tWid * 0.42, false));
    for (const axle of [-1, 1]) {
      const ax = -tLen/2 + 0.5 + axle * 0.55;
      group.userData.wheels.push(makeWheel(ax, tWid * 0.48, true));
      group.userData.wheels.push(makeWheel(ax, -tWid * 0.48, true));
    }

    // ─── 2 FOCOS SPOTLIGHT (castShadow) ───
    for (const zOff of [-0.35, 0.35]) {
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.25, 0.4), hlMat);
      fl.position.set(tLen/2 + 0.04, fH + 0.8, zOff * tWid * 0.2); group.add(fl);
      const spot = new THREE.SpotLight(0xffffee, 4.0, 40, Math.PI / 6, 0.5, 2.0);
      spot.position.set(tLen/2 + 0.3, fH + 0.35, zOff * tWid * 0.25);
      spot.target.position.set(tLen/2 + 25, -3, zOff * tWid * 0.4);
      spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0008;
      group.add(spot); group.add(spot.target);
    }

    // ─── 2 CALAVERAS TRASERAS (MeshBasicMaterial, alta emisividad) ───
    for (const zOff of [-0.35, 0.35]) {
      const tlMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.35), tlMat);
      tl.position.set(-tLen/2, fH + 0.55, zOff); group.add(tl);
      const tlGlow = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2200 }));
      tlGlow.position.set(-tLen/2 - 0.01, fH + 0.55, zOff); group.add(tlGlow);
    }

    // Interior de cabina
    box(cabLen * 0.2, 0.06, tWid * 0.4, cabX + cabLen * 0.15, fH + cabH * 0.25, 0, intMat);
    box(0.25, 0.2, 0.3, cabX - cabLen * 0.1, fH + cabH * 0.15, 0, intMat);

    // Neón inferior
    const nm = new THREE.MeshPhysicalMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2.0, transparent: true, opacity: 0.5, roughness: 0.1, metalness: 0.2 });
    const neon = new THREE.Mesh(new THREE.BoxGeometry(tLen * 0.6, 0.03, tWid * 0.5), nm);
    neon.position.set(0, 0.04, 0); group.add(neon);
    group.userData.bbox = { l: tLen, w: tWid, h: fH + sleeperH };
    group.userData.wheelBottomY = -tR * 0.5;

    return group;
  }

  // ─────── FILLER TRAFFIC — CATÁLOGO EXCLUSIVO GUATEMALA (switch-case) ───────
  _makeFillerVehicle(modelKey, colorHex) {
    const group = new THREE.Group();
    const bm = new THREE.MeshPhysicalMaterial({ color: colorHex, roughness: 0.2, metalness: 0.8, clearcoat: 0.6, clearcoatRoughness: 0.1, envMap: this.envMap, envMapIntensity: 2.0 });
    const bm2 = new THREE.MeshPhysicalMaterial({ color: 0x181818, roughness: 0.2, metalness: 0.8, clearcoat: 0.5 });
    const gm = new THREE.MeshPhysicalMaterial({ color: 0x020c18, roughness: 0.005, metalness: 0.0, transparent: true, opacity: 0.55, envMap: this.envMap, envMapIntensity: 1.0, ior: 1.45 });
    const cm = new THREE.MeshPhysicalMaterial({ color: 0xcccccc, roughness: 0.1, metalness: 0.9, envMap: this.envMap, envMapIntensity: 2.0 });
    const dm = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.8, metalness: 0.2 });
    const rm = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.9, metalness: 0.0 });
    const rmGray = new THREE.MeshPhysicalMaterial({ color: 0xaaaaaa, roughness: 0.15, metalness: 0.9 });
    const lm = new THREE.MeshPhysicalMaterial({ color: 0xffffcc, emissive: 0xffffcc, emissiveIntensity: 10, roughness: 0.02, metalness: 0.0 });
    const tm = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    const box = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; group.add(m); return m;
    };
    const cyl = (rT, rB, h, x, y, z, mat, rot) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h, 16), mat);
      m.position.set(x, y, z); if (rot) m.rotation.x = rot; m.castShadow = true; group.add(m); return m;
    };
    const wheel = (x, y, z, r, rimR) => {
      const wg = new THREE.Group(); wg.position.set(x, y, z);
      wg.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.85, 0.2, 16), rm));
      wg.add(new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.22, 16), rmGray));
      group.add(wg);
    };

    switch (modelKey) {
      // ── 1. TOYOTA HILUX (Doble Cabina) ──
      case 'hilux': {
        const l = 3.8, w = 2.0, ch = 0.65, cabH = 1.7, tR = 0.36, rimR = 0.24;
        // Chasis elevado (despeje alto)
        box(l, ch, w, 0, ch/2 + 0.3, 0, bm);
        // Cabina dividida en dos filas de asientos
        const cabLen = 1.5;
        box(cabLen, cabH, w * 0.62, 0.6, ch + cabH/2 + 0.3, 0, bm);
        // Parabrisas
        const ws = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, cabH * 0.45), gm);
        ws.position.set(1.3, ch + cabH * 0.45 + 0.3, 0); ws.rotation.y = -0.25; group.add(ws);
        // Ventana trasera cabina
        const rw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, cabH * 0.35), gm);
        rw.position.set(-0.1, ch + cabH * 0.38 + 0.3, 0); rw.rotation.y = 0.25; group.add(rw);
        // Palangana trasera: 30% más baja que el techo de la cabina
        const bedH = cabH * 0.7, bedLen = 1.7;
        box(bedLen, 0.04, w * 0.52, -0.75, ch + 0.38, 0, dm);
        for (const s of [-1, 1]) box(bedLen, bedH * 0.5, 0.035, -0.75, ch + bedH * 0.3 + 0.3, s * w * 0.27, bm);
        box(0.035, bedH * 0.5, w * 0.5, -1.6, ch + bedH * 0.3 + 0.3, 0, bm);
        // Defensa delantera (burrera) — tubos cilíndricos delgados negro mate
        for (const s of [-0.4, 0, 0.4]) {
          cyl(0.025, 0.025, w * 0.35, 1.9, ch + 0.45 + s, 0, dm, Math.PI / 2);
        }
        // Llantas todoterreno anchas
        for (const s of [-1, 1]) for (const f of [-1, 1]) wheel(f * 1.0, tR * 0.4, s * w * 0.4, tR, rimR);
        // Faros
        for (const s of [-0.2, 0.2]) box(0.02, 0.12, 0.35, 1.9, ch + 0.7, s * w * 0.22, lm);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.4 - 0.1;
        break;
      }
      // ── 2. MITSUBISHI L200 / NISSAN FRONTIER ──
      case 'l200': {
        const l = 3.7, w = 2.0, ch = 0.6, cabH = 1.65, tR = 0.35, rimR = 0.23;
        box(l, ch, w, 0, ch/2 + 0.28, 0, bm);
        const cabLen = 1.45;
        box(cabLen, cabH, w * 0.62, 0.55, ch + cabH/2 + 0.28, 0, bm);
        // Capó delantero inclinado curvo (frontal más suave)
        const hood = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, 0.5), bm);
        hood.position.set(1.85, ch + 0.7 + 0.28, 0); hood.rotation.y = -0.2; group.add(hood);
        // Palangana
        const bedLen = 1.7, bedH = cabH * 0.7;
        box(bedLen, 0.04, w * 0.52, -0.75, ch + 0.35, 0, dm);
        for (const s of [-1, 1]) box(bedLen, bedH * 0.5, 0.035, -0.75, ch + bedH * 0.28 + 0.28, s * w * 0.27, bm);
        // Ruedas
        for (const s of [-1, 1]) for (const f of [-1, 1]) wheel(f * 0.95, tR * 0.38, s * w * 0.4, tR, rimR);
        for (const s of [-0.2, 0.2]) box(0.02, 0.1, 0.3, 1.85, ch + 0.65 + 0.28, s * w * 0.22, lm);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.38 - 0.1;
        break;
      }
      // ── 3. HONDA CR-V / TOYOTA RAV4 (SUV un solo volumen) ──
      case 'crv': {
        const l = 3.3, w = 2.1, ch = 0.6, cabH = 1.75, tR = 0.34, rimR = 0.22;
        // Carrocería de un solo volumen cerrado de dos ejes
        box(l, ch, w, 0, ch/2 + 0.22, 0, bm);
        box(l * 0.7, cabH, w * 0.68, 0.15, ch + cabH/2 + 0.22, 0, bm);
        // Techo continuo hasta parte trasera — cae 90° exactos
        box(0.04, cabH * 0.9, w * 0.64, -1.25, ch + cabH * 0.45 + 0.22, 0, bm);
        // Barras de techo longitudinales negras
        for (const s of [-1, 1]) box(l * 0.4, 0.025, 0.025, 0.15, ch + cabH + 0.25, s * w * 0.3, dm);
        // Cristales
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, cabH * 0.45), gm);
        fw.position.set(1.25, ch + cabH * 0.42 + 0.22, 0); fw.rotation.y = -0.25; group.add(fw);
        const bw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, cabH * 0.4), gm);
        bw.position.set(-0.8, ch + cabH * 0.38 + 0.22, 0); bw.rotation.y = 0.3; group.add(bw);
        // Ruedas
        for (const s of [-1, 1]) for (const f of [-1, 1]) wheel(f * 0.95, tR * 0.38, s * w * 0.4, tR, rimR);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.38 - 0.1;
        break;
      }
      // ── 4. TOYOTA RAV4 (con llanta de repuesto exterior) ──
      case 'rav4': {
        const l = 3.3, w = 2.1, ch = 0.6, cabH = 1.75, tR = 0.34, rimR = 0.22;
        box(l, ch, w, 0, ch/2 + 0.22, 0, bm);
        box(l * 0.7, cabH, w * 0.68, 0.15, ch + cabH/2 + 0.22, 0, bm);
        for (const s of [-1, 1]) box(l * 0.4, 0.025, 0.025, 0.15, ch + cabH + 0.25, s * w * 0.3, dm);
        // Llanta de repuesto exterior (cilindro negro en puerta trasera)
        cyl(0.2, 0.2, 0.15, -1.45, ch + cabH * 0.35 + 0.22, 0, dm, Math.PI / 2);
        // Cristales
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.55, cabH * 0.45), gm);
        fw.position.set(1.25, ch + cabH * 0.42 + 0.22, 0); fw.rotation.y = -0.25; group.add(fw);
        // Ruedas
        for (const s of [-1, 1]) for (const f of [-1, 1]) wheel(f * 0.95, tR * 0.38, s * w * 0.4, tR, rimR);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.38 - 0.1;
        break;
      }
      // ── 5. HONDA CIVIC / MAZDA3 (sedán deportivo 'rodado') ──
      case 'civic': {
        const l = 3.4, w = 2.0, ch = 0.42, cabH = 1.3, tR = 0.3, rimR = 0.2;
        // Perfil extra bajo, pegado al asfalto
        box(l, ch, w, 0, ch/2 + 0.12, 0, bm);
        // Cabina con techo corto
        box(l * 0.45, cabH, w * 0.65, 0.15, ch + cabH/2 + 0.12, 0, bm2);
        // Parabrisas delantero extremadamente inclinado (60°)
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.58, cabH * 0.7), gm);
        fw.position.set(0.85, ch + cabH * 0.5 + 0.12, 0); fw.rotation.y = -0.55; group.add(fw);
        // Maletero plano y definido
        box(0.55, 0.3, w * 0.55, -1.35, ch + 0.25 + 0.12, 0, bm);
        // Spoiler / alerón trasero sutil
        box(0.01, 0.06, w * 0.45, -1.58, ch + 0.5 + 0.12, 0, bm2);
        // Rines cromo brillante
        for (const s of [-1, 1]) for (const f of [-1, 1]) {
          const wg = new THREE.Group();
          wg.position.set(f * 0.85, tR * 0.3, s * w * 0.42);
          wg.add(new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 0.85, 0.18, 16), rm));
          wg.add(new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.2, 16), cm));
          group.add(wg);
        }
        // Faros afilados
        for (const s of [-0.18, 0.18]) box(0.02, 0.08, 0.3, 1.72, ch + 0.4 + 0.12, s * w * 0.22, lm);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.3 - 0.09;
        break;
      }
      // ── 6. MAZDA3 (variante deportiva) ──
      case 'mazda3': {
        // Misma base que civic pero con silueta más curvilínea
        const l = 3.3, w = 2.0, ch = 0.4, cabH = 1.35, tR = 0.3, rimR = 0.2;
        box(l, ch, w, 0, ch/2 + 0.12, 0, bm);
        box(l * 0.48, cabH, w * 0.65, 0.1, ch + cabH/2 + 0.12, 0, bm);
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.58, cabH * 0.65), gm);
        fw.position.set(0.8, ch + cabH * 0.48 + 0.12, 0); fw.rotation.y = -0.5; group.add(fw);
        box(0.5, 0.28, w * 0.55, -1.3, ch + 0.24 + 0.12, 0, bm);
        for (const s of [-1, 1]) for (const f of [-1, 1]) {
          const wg = new THREE.Group();
          wg.position.set(f * 0.85, tR * 0.3, s * w * 0.42);
          wg.add(new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 0.85, 0.18, 16), rm));
          wg.add(new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.2, 16), cm));
          group.add(wg);
        }
        for (const s of [-0.18, 0.18]) box(0.02, 0.08, 0.3, 1.68, ch + 0.38 + 0.12, s * w * 0.22, lm);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.3 - 0.09;
        break;
      }
      // ── 7. TOYOTA YARIS (sedán subcompacto) ──
      case 'yaris': {
        const l = 2.7, w = 1.85, ch = 0.5, cabH = 1.45, tR = 0.28, rimR = 0.18;
        // Silueta subcompacta, cuerpo más corto y redondeado
        box(l, ch, w, 0, ch/2 + 0.15, 0, bm);
        // Cabina proporcionalmente más alta que el capó
        box(l * 0.5, cabH, w * 0.65, 0, ch + cabH/2 + 0.15, 0, bm);
        // Capó delantero corto
        box(0.5, 0.08, w * 0.5, 0.9, ch + 0.2 + 0.15, 0, bm);
        // Parabrisas
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, cabH * 0.45), gm);
        fw.position.set(0.65, ch + cabH * 0.42 + 0.15, 0); fw.rotation.y = -0.25; group.add(fw);
        const bw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, cabH * 0.4), gm);
        bw.position.set(-0.65, ch + cabH * 0.38 + 0.15, 0); bw.rotation.y = 0.25; group.add(bw);
        // Ruedas
        for (const s of [-1, 1]) for (const f of [-1, 1]) wheel(f * 0.7, tR * 0.3, s * w * 0.4, tR, rimR);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.3 - 0.1;
        break;
      }
      // ── 8. HYUNDAI ACCENT (sedán económico) ──
      case 'accent': {
        const l = 2.8, w = 1.85, ch = 0.5, cabH = 1.45, tR = 0.28, rimR = 0.18;
        box(l, ch, w, 0, ch/2 + 0.15, 0, bm);
        box(l * 0.5, cabH, w * 0.65, 0.05, ch + cabH/2 + 0.15, 0, bm);
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, cabH * 0.45), gm);
        fw.position.set(0.7, ch + cabH * 0.42 + 0.15, 0); fw.rotation.y = -0.25; group.add(fw);
        const bw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, cabH * 0.4), gm);
        bw.position.set(-0.68, ch + cabH * 0.38 + 0.15, 0); bw.rotation.y = 0.25; group.add(bw);
        for (const s of [-1, 1]) for (const f of [-1, 1]) wheel(f * 0.72, tR * 0.3, s * w * 0.4, tR, rimR);
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.3 - 0.1;
        break;
      }
      // ── 9. KIA FURGÓN / CAMIÓN DE VOLTEO (comercial ligero) ──
      case 'kia_furgon': {
        const l = 3.8, w = 1.9, ch = 0.45, cabH = 1.4, tR = 0.3, rimR = 0.2;
        // Cabina chata cúbica sin capó
        box(l, ch, w, 0, ch/2 + 0.12, 0, bm);
        box(0.6, cabH, w * 0.6, 1.65, ch + cabH/2 + 0.12, 0, bm);
        const fw = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.45, cabH * 0.45), gm);
        fw.position.set(1.95, ch + cabH * 0.42 + 0.12, 0); fw.rotation.y = -0.05; group.add(fw);
        // Furgón cerrado trasero
        box(2.4, cabH * 0.8, w * 0.58, -0.35, ch + cabH * 0.4 + 0.12, 0, bm2);
        // Ruedas delanteras simples
        for (const s of [-1, 1]) wheel(1.4, tR * 0.35, s * w * 0.42, tR, rimR);
        // Ruedas traseras dobles (2 ejes)
        for (const axle of [-0.5, 0.5]) {
          for (const s of [-1, 1]) {
            const wg = new THREE.Group();
            wg.position.set(-0.45 + axle, tR * 0.35, s * w * 0.45);
            wg.add(new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 0.85, 0.18, 16), rm));
            wg.add(new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.2, 16), rmGray));
            const t2 = new THREE.Mesh(new THREE.CylinderGeometry(tR, tR * 0.85, 0.18, 16), rm);
            t2.position.x = 0.16; wg.add(t2);
            const r2 = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR * 0.9, 0.2, 16), rmGray);
            r2.position.x = 0.16; wg.add(r2);
            group.add(wg);
          }
        }
        group.userData.bbox = { l, w, h: ch + cabH };
        group.userData.wheelBottomY = tR * 0.35 - 0.1;
        break;
      }
    }

    return group;
  }

  buildVehicles(v1Opts, v2Opts) {
    if (this.v1Mesh) this.scene.remove(this.v1Mesh);
    if (this.v2Mesh) this.scene.remove(this.v2Mesh);
    this.fillerVehicles.forEach(g => this.scene.remove(g));
    this.fillerVehicles = [];
    if (this.skidMarks) { this.skidMarks.forEach(m => this.scene.remove(m)); this.skidMarks = null; }
    if (this.shockwave) { this.scene.remove(this.shockwave); this.shockwave = null; }
    this.particles.forEach(p => this.scene.remove(p)); this.particles = [];
    this._collided = false;

    v1Opts = v1Opts || {}; v2Opts = v2Opts || {};
    const c1 = v1Opts.color || 0xcc1111, c2 = v2Opts.color || 0x1144aa;
    const t1 = v1Opts.type || 'sedan', t2 = v2Opts.type || 'sedan';
    const e1 = v1Opts.emissive || 0xff2222, e2 = v2Opts.emissive || 0x2266ff;

    this.v1Mesh = (t1 === 'camion') ? this._makeTruck(c1) : this._makeVehicle(c1, e1, t1);
    this.scene.add(this.v1Mesh);
    this.v2Mesh = this._makeVehicle(c2, e2, t2);
    this.scene.add(this.v2Mesh);
  }

  buildImpactMarker() {
    if (this.impactMarker) this.scene.remove(this.impactMarker);
    const geo = new THREE.RingGeometry(0.8, 1.5, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff1111, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    this.impactMarker = new THREE.Mesh(geo, mat);
    this.impactMarker.rotation.x = -Math.PI / 2; this.impactMarker.position.y = 0.12;
    this.scene.add(this.impactMarker);
  }

  buildSkidMarks(frames) {
    if (this.skidMarks) { this.skidMarks.forEach(m => this.scene.remove(m)); }
    this.skidMarks = [];
    if (!frames || frames.length < 3) return;
    const midIdx = Math.floor(frames.length / 2);
    const preFrames = frames.slice(0, midIdx);
    if (preFrames.length < 2) return;
    const tireMat = new THREE.MeshBasicMaterial({
      color: 0x111111, transparent: true, opacity: 0.15, depthWrite: false,
    });
    for (let i = 0; i < preFrames.length - 1; i++) {
      const f0 = preFrames[i], f1 = preFrames[i + 1];
      for (const side of [-1, 1]) {
        const dx1 = (f1.v1_x - f0.v1_x) * 0.3, dz1 = -(f1.v1_y - f0.v1_y) * 0.3;
        if (Math.abs(dx1) + Math.abs(dz1) < 0.01) continue;
        const ang1 = -(f0.v1_angulo * Math.PI / 180);
        const perpX = Math.cos(ang1) * side * 0.6, perpZ = Math.sin(ang1) * side * 0.6;
        const geo1 = new THREE.PlaneGeometry(0.3, Math.sqrt(dx1*dx1 + dz1*dz1));
        const m1 = new THREE.Mesh(geo1, tireMat);
        m1.position.set(f0.v1_x + dx1/2 + perpX, 0.05, -f0.v1_y + dz1/2 + perpZ);
        m1.rotation.y = -Math.atan2(dz1, dx1); m1.rotation.x = -Math.PI / 2;
        this.scene.add(m1); this.skidMarks.push(m1);
      }
    }
  }

  buildTrajectories(frames) {
    if (this.trajLine1) this.scene.remove(this.trajLine1);
    if (this.trajLine2) this.scene.remove(this.trajLine2);
    const makeLineMesh = (points, color) => {
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45 });
      return new THREE.Line(geo, mat);
    };
    const pts1 = frames.map(f => new THREE.Vector3(f.v1_x, 1.5, -f.v1_y));
    const pts2 = frames.map(f => new THREE.Vector3(f.v2_x, 1.5, -f.v2_y));
    this.trajLine1 = makeLineMesh(pts1, 0xff3333);
    this.trajLine2 = makeLineMesh(pts2, 0x3366ff);
    this.scene.add(this.trajLine1); this.scene.add(this.trajLine2);
  }

  // ─────── FILLER TRAFFIC PLACEMENT (Guatemala street scene) ───────
  buildFillerTraffic(infraestructura) {
    this.fillerVehicles.forEach(g => this.scene.remove(g));
    this.fillerVehicles = [];
    if (infraestructura !== 'interseccion_cruciforme' && infraestructura !== 'interseccion') return;

    // Per-model color arrays (colores permitidos por modelo)
    const COLOR_SETS = {
      hilux: [0xFFFFFF, 0x808080, 0x4F4F4F],
      l200: [0xFFFFFF, 0x808080, 0x4F4F4F],
      crv: [0x003366, 0x1C3B2B, 0x6F4E37],
      rav4: [0x003366, 0x1C3B2B, 0x6F4E37],
      civic: [0xCC0000, 0x001F3F, 0x0A0A0A],
      mazda3: [0xCC0000, 0x001F3F, 0x0A0A0A],
      yaris: [0xD3D3D3, 0xFFFFFF, 0x005A9C],
      accent: [0xD3D3D3, 0xFFFFFF, 0x005A9C],
      kia_furgon: [0xFFFFFF, 0x005A9C, 0xCC0000],
    };
    // Model distribution: 35% pickup, 25% sedan deportivo, 15% SUV, 15% sedán económico, 10% comercial
    const MODEL_DIST = [
      'hilux', 'hilux', 'hilux', 'l200', 'l200', 'l200', 'l200',
      'civic', 'civic', 'civic', 'mazda3', 'mazda3',
      'crv', 'crv', 'rav4',
      'yaris', 'yaris', 'accent',
      'kia_furgon', 'kia_furgon',
    ];

    // Lane centers matching painted lines: double yellow at 0, lane lines at ±2.2
    const laneZ = [-5.1, -1.1, 1.1, 5.1];
    const laneX = [-5.1, -1.1, 1.1, 5.1];
    const posX = [], posZ = [];
    for (let x = -62; x <= 62; x += 7) { if (Math.abs(x) < 8) continue; posX.push(x); }
    for (let z = -62; z <= 62; z += 7) { if (Math.abs(z) < 8) continue; posZ.push(z); }

    const shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const place = (pos, lanes, angleFn) => {
      const picks = shuffle(pos).slice(0, 5 + Math.floor(Math.random() * 3));
      picks.forEach(p => {
        const mk = MODEL_DIST[Math.floor(Math.random() * MODEL_DIST.length)];
        const cols = COLOR_SETS[mk];
        const col = cols[Math.floor(Math.random() * cols.length)];
        const vehicle = this._makeFillerVehicle(mk, col);
        const lane = lanes[Math.floor(Math.random() * lanes.length)];
        const vy = vehicle.userData.wheelBottomY !== undefined ? -vehicle.userData.wheelBottomY : 0;
        vehicle.position.set(p, vy, lane);
        vehicle.rotation.y = angleFn(lane);
        this.scene.add(vehicle);
        this.fillerVehicles.push(vehicle);
      });
    };

    // Horizontal road: left lanes go west (-X), right lanes go east (+X)
    place(posX, laneZ, l => l < 0 ? Math.PI / 2 : -Math.PI / 2);
    // Vertical road: left lanes go south (-Z), right lanes go north (+Z)
    place(posZ, laneX, l => l < 0 ? Math.PI : 0);
  }

  spawnImpactParticles() {
    for (let i = 0; i < 80; i++) {
      const size = Math.random() * 0.2 + 0.03;
      const geo = new THREE.SphereGeometry(size, 4, 4);
      const colors = [0xff8800, 0xff4400, 0xffff00, 0xffcc00, 0xff2200];
      const mat = new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)] });
      const p = new THREE.Mesh(geo, mat);
      p.position.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3);
      p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.5 + 0.2, (Math.random() - 0.5) * 0.8);
      p.userData.life = 1.0;
      this.scene.add(p); this.particles.push(p);
    }
    for (let i = 0; i < 30; i++) {
      const geo = new THREE.BoxGeometry(Math.random() * 0.2 + 0.05, Math.random() * 0.02 + 0.01, Math.random() * 0.2 + 0.05);
      const mat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.3 ? 0xbbddff : 0xff4444, transparent: true, opacity: 0.8 });
      const p = new THREE.Mesh(geo, mat);
      p.position.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3);
      p.userData.vel = new THREE.Vector3((Math.random() - 0.5) * 0.6, Math.random() * 0.4 + 0.1, (Math.random() - 0.5) * 0.6);
      p.userData.rotVel = new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2);
      p.userData.life = 1.0;
      this.scene.add(p); this.particles.push(p);
    }
    const ringGeo = new THREE.RingGeometry(0.1, 1.5, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff8844, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.shockwave = new THREE.Mesh(ringGeo, ringMat);
    this.shockwave.rotation.x = -Math.PI / 2; this.shockwave.position.y = 0.15;
    this.shockwave.userData.life = 1.0; this.scene.add(this.shockwave);
    this.shakeIntensity = 1.5;
    this.impactLight.intensity = 15; this.impactLight.color.set(0xff6622);
    this.particleTime = 100;
  }

  updateParticles() {
    if (this.particles.length === 0 && !this.shockwave) return;
    this.particles.forEach(p => {
      const decay = p.userData.life > 1.0 ? 0.012 : 0.025;
      p.userData.life -= decay;
      p.position.addScaledVector(p.userData.vel, 1);
      p.userData.vel.y -= 0.012;
      p.material.opacity = Math.min(p.userData.life, 1);
      p.material.transparent = true;
      p.scale.setScalar(Math.min(p.userData.life, 1));
      if (p.userData.rotVel) { p.rotation.x += p.userData.rotVel.x; p.rotation.y += p.userData.rotVel.y; }
    });
    this.particles = this.particles.filter(p => p.userData.life > 0.01);
    if (this.shockwave) {
      this.shockwave.userData.life -= 0.015;
      if (this.shockwave.userData.life <= 0) { this.scene.remove(this.shockwave); this.shockwave = null; }
      else {
        const s = 1 + (1 - this.shockwave.userData.life) * 12;
        this.shockwave.scale.set(s, s, s);
        this.shockwave.material.opacity = this.shockwave.userData.life * 0.6;
      }
    }
    this.shakeIntensity *= this.shakeDecay;
    if (this.shakeIntensity < 0.001) this.shakeIntensity = 0;
    this.impactLight.intensity *= 0.92;
    this.impactLight.color.multiplyScalar(0.97);
  }

  deformVehicleAtImpact(vehicle, worldPoint, radius, strength) {
    const localPoint = vehicle.worldToLocal(worldPoint.clone());
    vehicle.traverse(child => {
      if (!child.isMesh || !child.geometry || !child.geometry.attributes.position) return;
      const geo = child.geometry;
      const pos = geo.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const dist = v.distanceTo(localPoint);
        if (dist < radius) {
          const factor = 1 - dist / radius;
          const deform = strength * factor * factor;
          const dir = new THREE.Vector3().subVectors(v, localPoint).normalize();
          v.addScaledVector(dir, -deform);
          pos.setXYZ(i, v.x, v.y, v.z);
        }
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    });
  }

  updateVehicles(frame, phase) {
    if (!this.v1Mesh || !this.v2Mesh || !frame) return;
    const v1Y = this.v1Mesh.userData.wheelBottomY !== undefined ? -this.v1Mesh.userData.wheelBottomY : 0;
    this.v1Mesh.position.set(frame.v1_x, v1Y, -frame.v1_y);
    this.v1Mesh.rotation.y = -(frame.v1_angulo * Math.PI / 180);
    const v2Y = this.v2Mesh.userData.wheelBottomY !== undefined ? -this.v2Mesh.userData.wheelBottomY : 0;
    this.v2Mesh.position.set(frame.v2_x, v2Y, -frame.v2_y);
    this.v2Mesh.rotation.y = -(frame.v2_angulo * Math.PI / 180);
    const dx = Math.abs(frame.v1_x - frame.v2_x);
    const dz = Math.abs(frame.v1_y - frame.v2_y);
    const crashDist = 5.5;
    if (dx < crashDist && dz < crashDist && phase === 'impact' && !this._collided) {
      this._collided = true; this.spawnImpactParticles();
      const impactWorldPt = new THREE.Vector3(
        (frame.v1_x + frame.v2_x) / 2,
        0.8,
        -(frame.v1_y + frame.v2_y) / 2
      );
      this.deformVehicleAtImpact(this.v1Mesh, impactWorldPt, 1.8, 0.15);
      this.deformVehicleAtImpact(this.v2Mesh, impactWorldPt, 1.8, 0.15);
    } else if (dx >= crashDist || dz >= crashDist) { this._collided = false; }
    const brakeGlow = phase === 'pre' ? 4.0 : (phase === 'impact' ? 2.0 : 1.5);
    [this.v1Mesh, this.v2Mesh].forEach(v => {
      if (v) v.children.forEach(c => {
        if (c.isMesh && c.material && c.material.emissive && c.material.emissive.getHex() === 0xcc0000)
          c.material.emissiveIntensity = brakeGlow;
      });
    });
    const wheelSpeed = frame.segundo > 0 ? 15 : 0;
    [this.v1Mesh, this.v2Mesh].forEach(v => {
      if (v && v.userData.wheels) v.userData.wheels.forEach(w => {
        w.children[0].rotation.x += wheelSpeed * 0.016;
        w.children[1].rotation.x += wheelSpeed * 0.016;
      });
    });
    if (this.impactMarker) {
      const pulse = 0.8 + 0.2 * Math.sin(Date.now() * 0.005);
      this.impactMarker.scale.setScalar(pulse);
      this.impactMarker.material.opacity = (phase === 'impact') ? 0.9 : 0.4;
    }
  }

  setCameraMode(mode, frame) {
    this.cameraMode = mode;
    this.controls.enabled = (mode === 'free');
    if (mode === 'free') this.controls.reset();
    else if (mode === 'top') { this.camera.position.set(0, 100, 0.01); this.camera.lookAt(0, 0, 0); }
    else if (mode === 'v1' && frame) { this.camera.position.set(frame.v1_x, 20, -frame.v1_y + 25); this.camera.lookAt(frame.v1_x, 0, -frame.v1_y); }
    else if (mode === 'v2' && frame) { this.camera.position.set(frame.v2_x, 20, -frame.v2_y + 25); this.camera.lookAt(frame.v2_x, 0, -frame.v2_y); }
  }

  updateCameraFollow(mode, frame) {
    if (!frame) return;
    if (mode === 'v1') { this.camera.position.lerp(new THREE.Vector3(frame.v1_x, 18, -frame.v1_y + 22), 0.05); this.camera.lookAt(frame.v1_x, 0, -frame.v1_y); }
    else if (mode === 'v2') { this.camera.position.lerp(new THREE.Vector3(frame.v2_x, 18, -frame.v2_y + 22), 0.05); this.camera.lookAt(frame.v2_x, 0, -frame.v2_y); }
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _render() {
    this.animFrameId = requestAnimationFrame(() => this._render());
    try {
      if (this.dustSystem) {
        const pos = this.dustSystem.geometry.attributes.position.array;
        const t = Date.now();
        for (let i = 0; i < pos.length; i += 3) {
          pos[i] += Math.sin(t * 0.0003 + i) * 0.002;
          pos[i+1] += Math.cos(t * 0.0002 + i * 1.3) * 0.001;
          pos[i+2] += Math.sin(t * 0.00025 + i * 0.7) * 0.002;
          if (pos[i] > 80) pos[i] = -80;
          if (pos[i] < -80) pos[i] = 80;
          if (pos[i+1] > 22) pos[i+1] = 2;
          if (pos[i+1] < 2) pos[i+1] = 22;
          if (pos[i+2] > 80) pos[i+2] = -80;
          if (pos[i+2] < -80) pos[i+2] = 80;
        }
        this.dustSystem.geometry.attributes.position.needsUpdate = true;
      }
      if (this.shakeIntensity > 0.001) {
        this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity * 0.3;
        this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity * 0.3;
      }

      // Animate clouds drifting
      if (this.clouds) {
        this.cloudTime += 0.005;
        this.clouds.forEach((c, i) => {
          c.position.x = c.userData.startX + Math.sin(this.cloudTime * c.userData.speed + i * 2) * 30;
          c.position.z += Math.sin(this.cloudTime * 0.1 + i) * 0.008;
        });
      }

      // Tree canopy sway
      if (this.treeCanopies) {
        const sway = Date.now() * 0.0008;
        this.treeCanopies.forEach((canopy, i) => {
          if (canopy) {
            const s = 1 + Math.sin(sway + i * 1.7) * 0.015;
            canopy.scale.x = s;
            canopy.scale.z = s;
          }
        });
      }

      this.renderer.render(this.scene, this.camera);
    } catch (e) { console.error('Render error:', e); }
  }

  destroy() {
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
    this.renderer.dispose();
  }
}

// ──────────────────────────────────────────────────────────────
//  3D Viewer Component
// ──────────────────────────────────────────────────────────────
const Viewer3D = ({ simulationData, tCurrent, phase, cameraMode, onCameraModeChange }) => {
  const canvasRef = React.useRef(null);
  const sceneRef = React.useRef(null);
  const wrapperRef = React.useRef(null);
  const prevPhaseRef = React.useRef(null);

  React.useEffect(() => {
    if (!canvasRef.current) return;
    const sm = new SceneManager(canvasRef.current);
    sceneRef.current = sm;
    const resizeObs = new ResizeObserver(entries => {
      for (const entry of entries) { const { width, height } = entry.contentRect; sm.resize(width, height); }
    });
    if (wrapperRef.current) resizeObs.observe(wrapperRef.current);
    return () => { resizeObs.disconnect(); sm.destroy(); sceneRef.current = null; };
  }, []);

  React.useEffect(() => {
    if (!sceneRef.current || !simulationData) return;
    const sm = sceneRef.current;
    sm.buildRoad(simulationData.infraestructura);
    // V1: rojo — sedán deportivo (Civic). V2: negro — camioneta (Hilux/SUV).
    // Forzado independientemente del JSON de la IA para consistencia con el relato.
    sm.buildVehicles({
      color: 0xCC0000, type: 'sedan',
      emissive: 0xFF4444,
    }, {
      color: 0x1A1A1A, type: 'camioneta',
      emissive: 0x222222,
    });
    sm.buildFillerTraffic(simulationData.infraestructura);
    sm.buildImpactMarker();
    sm.buildSkidMarks(simulationData.animacion_actores);
    sm.buildTrajectories(simulationData.animacion_actores);
  }, [simulationData]);

  React.useEffect(() => {
    if (!sceneRef.current || !simulationData) return;
    const sm = sceneRef.current;
    const frame = interpolateFrame(simulationData.animacion_actores, tCurrent);
    if (phase === 'impact' && prevPhaseRef.current !== 'impact') sm.spawnImpactParticles();
    prevPhaseRef.current = phase;
    sm.updateParticles();
    sm.updateVehicles(frame, phase);
    if (cameraMode !== 'free') sm.updateCameraFollow(cameraMode, frame);
  }, [tCurrent, simulationData, phase, cameraMode]);

  React.useEffect(() => {
    if (!sceneRef.current || !simulationData) return;
    sceneRef.current.setCameraMode(cameraMode, interpolateFrame(simulationData.animacion_actores, tCurrent));
  }, [cameraMode]);

  const hasData = !!simulationData;

  return (
    <div className="viewer-wrapper" ref={wrapperRef}>
      <canvas ref={canvasRef} className="viewer-canvas" />
      {!hasData && (
        <div className="viewer-overlay">
          <div className="viewer-placeholder-icon">🚗</div>
          <p className="viewer-placeholder-text">Describe el siniestro y genera la simulación para ver la reconstrucción 3D aquí.</p>
        </div>
      )}
      {hasData && (
        <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px', zIndex: 5 }}>
          {['free', 'top', 'v1', 'v2'].map(m => (
            <button key={m} className={`cam-btn${cameraMode === m ? ' active' : ''}`} onClick={() => onCameraModeChange(m)}>
              { m === 'free' ? '🎥 Libre' : m === 'top' ? '🛸 Cenital' : m === 'v1' ? '🚗 V1' : '🚙 V2' }
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
//  Playback Controls Component
// ──────────────────────────────────────────────────────────────
const PlaybackControls = ({ frames, tCurrent, setTCurrent, isPlaying, setIsPlaying, speed, setSpeed }) => {
  const tMax = frames && frames.length > 0 ? frames[frames.length - 1].segundo : 10;
  const phase = getPhase(frames, tCurrent);
  const phaseLabel = { pre: '🔵 PRE-IMPACTO', impact: '💥 IMPACTO', post: '🟠 POST-IMPACTO' }[phase];
  const phaseClass = { pre: 'pre', impact: 'impact', post: 'post' }[phase];

  return (
    <div className="playback-controls">
      <button className={`btn btn-sm ${isPlaying ? 'btn-secondary' : 'btn-neon'}`} onClick={() => setIsPlaying(p => !p)} id="btn-playpause">
        {isPlaying ? '⏸ Pausar' : '▶ Reproducir'}
      </button>
      <button className="btn btn-sm btn-secondary" onClick={() => { setTCurrent(0); setIsPlaying(false); }} id="btn-rewind">⏮ Reiniciar</button>
      <span className="time-display">t = {tCurrent.toFixed(2)}s</span>
      <input className="time-slider" type="range" min="0" max={tMax} step="0.01" value={tCurrent}
        onChange={e => { setIsPlaying(false); setTCurrent(parseFloat(e.target.value)); }} />
      <span className="time-display" style={{ textAlign: 'right' }}>{tMax.toFixed(2)}s</span>
      <select className="speed-select" value={speed} onChange={e => setSpeed(parseFloat(e.target.value))}>
        <option value={0.25}>0.25×</option>
        <option value={0.5}>0.5×</option>
        <option value={1}>1×</option>
        <option value={2}>2×</option>
      </select>
      <span className={`phase-badge ${phaseClass}`}>{phaseLabel}</span>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
//  Data Panel Component
// ──────────────────────────────────────────────────────────────
const DataPanel = ({ frame }) => {
  if (!frame) return null;
  const cells = [
    { label: 'V1 — X', value: `${frame.v1_x.toFixed(1)} m`, cls: 'v1' },
    { label: 'V1 — Y', value: `${frame.v1_y.toFixed(1)} m`, cls: 'v1' },
    { label: 'V1 — Ángulo', value: `${frame.v1_angulo.toFixed(0)}°`, cls: 'v1' },
    { label: 'V2 — X', value: `${frame.v2_x.toFixed(1)} m`, cls: 'v2' },
    { label: 'V2 — Y', value: `${frame.v2_y.toFixed(1)} m`, cls: 'v2' },
    { label: 'V2 — Ángulo', value: `${frame.v2_angulo.toFixed(0)}°`, cls: 'v2' },
  ];
  return (
    <div className="data-grid">
      {cells.map(c => (
        <div key={c.label} className="data-cell">
          <div className="data-cell-label">{c.label}</div>
          <div className={`data-cell-value ${c.cls}`}>{c.value}</div>
        </div>
      ))}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
//  Raw Data Expander
// ──────────────────────────────────────────────────────────────
const RawDataExpander = ({ data }) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <div className="expander-header" onClick={() => setOpen(o => !o)}>
        <span>🔍 Ver datos crudos (JSON de la IA)</span>
        <i className={`expander-icon${open ? ' open' : ''}`}>▼</i>
      </div>
      {open && <div className="expander-body">{JSON.stringify(data, null, 2)}</div>}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
//  Turtle Script Generator (pure JS)
// ──────────────────────────────────────────────────────────────
function buildTurtleScript(simulationData) {
  const { animacion_actores: frames, infraestructura, dictamen_tecnico } = simulationData;
  const framesCode = frames.map(f =>
    `    {'t': ${f.segundo}, 'v1_x': ${f.v1_x}, 'v1_y': ${f.v1_y}, 'v1_a': ${f.v1_angulo}, 'v2_x': ${f.v2_x}, 'v2_y': ${f.v2_y}, 'v2_a': ${f.v2_angulo}},`
  ).join('\n');
  return `#!/usr/bin/env python3
""" ForensIA - Simulacion Forense 2D con Turtle
Infraestructura: ${infraestructura}
Dictamen:
${dictamen_tecnico}
"""
import turtle, time, math
FRAMES = [${framesCode}]
SCALE = 8; ANIM_DELAY = 0.04; INTERP_STEPS = 25; VEH_W, VEH_L = 10, 20
screen = turtle.Screen(); screen.title("FORENSIA - Simulacion 2D")
screen.bgcolor("#0a0e1a"); screen.setup(900, 700); screen.tracer(0)
def lerp(a,b,t): return a+(b-a)*t
def lerp_ang(a,b,t):
    d=((b-a)%360+360)%360
    if d>180: d-=360
    return a+d*t
def draw_road(t):
    t.speed(0); t.hideturtle()
    for bx,by,bw,bh in [(-300,-40,600,80),(-40,-300,80,600)]:
        t.penup(); t.goto(bx,by); t.fillcolor("#1c1c1c"); t.begin_fill()
        for dx,dy in [(bw,0),(0,bh),(-bw,0),(0,-bh)]: t.goto(t.xcor()+dx,t.ycor()+dy)
        t.end_fill()
def draw_vehicle(t,x,y,angle,color,label):
    t.clear(); px,py=x*SCALE,-y*SCALE; heading=90-angle
    rad=math.radians(heading); ca,sa=math.cos(rad),math.sin(rad)
    corners=[(-VEH_W/2,-VEH_L/2),(VEH_W/2,-VEH_L/2),(VEH_W/2,VEH_L/2),(-VEH_W/2,VEH_L/2)]
    wc=[(px+cx*ca-cy*sa,py+cx*sa+cy*ca) for cx,cy in corners]
    t.penup(); t.goto(wc[0]); t.fillcolor(color); t.color(color)
    t.begin_fill(); t.pendown()
    for c in wc[1:]: t.goto(c)
    t.goto(wc[0]); t.end_fill(); t.penup()
    t.goto(px,py+VEH_L/2+8); t.color("#ffffff")
    t.write(label,align="center",font=("Arial",10,"bold")); t.penup()
road_t=turtle.Turtle(); v1_t=turtle.Turtle(); v2_t=turtle.Turtle()
for t in[road_t,v1_t,v2_t]: t.speed(0); t.hideturtle(); t.penup()
draw_road(road_t); screen.update(); time.sleep(0.5)
for i in range(len(FRAMES)-1):
    f0,f1=FRAMES[i],FRAMES[i+1]
    for s in range(INTERP_STEPS+1):
        frac=s/INTERP_STEPS
        v1x=lerp(f0['v1_x'],f1['v1_x'],frac); v1y=lerp(f0['v1_y'],f1['v1_y'],frac); v1a=lerp_ang(f0['v1_a'],f1['v1_a'],frac)
        v2x=lerp(f0['v2_x'],f1['v2_x'],frac); v2y=lerp(f0['v2_y'],f1['v2_y'],frac); v2a=lerp_ang(f0['v2_a'],f1['v2_a'],frac)
        draw_vehicle(v1_t,v1x,v1y,v1a,"#e74c3c","V1")
        draw_vehicle(v2_t,v2x,v2y,v2a,"#2980b9","V2")
        screen.update(); time.sleep(ANIM_DELAY)
screen.update(); turtle.done()`;
}

// ──────────────────────────────────────────────────────────────
//  Main App Component
// ──────────────────────────────────────────────────────────────
const App = () => {
  const [pollinationsOk, setPollinationsOk] = React.useState(null);
  const [pollinationsErr, setPollinationsErr] = React.useState('');
  const [installedModels, setInstalledModels] = React.useState([]);
  const [selectedModel, setSelectedModel] = React.useState(DEFAULT_MODEL);
  const [relato, setRelato] = React.useState(DEFAULT_RELATO);
  const [loading, setLoading] = React.useState(false);
  const [loadingMsg, setLoadingMsg] = React.useState('');
  const [error, setError] = React.useState('');
  const [simulationData, setSimulationData] = React.useState(null);
  const [tCurrent, setTCurrent] = React.useState(0);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);
  const animRef = React.useRef(null);
  const lastTimeRef = React.useRef(null);
  const [cameraMode, setCameraMode] = React.useState('free');

  // ── Check Pollinations status ──
  const checkStatus = React.useCallback(async () => {
    try {
      const r = await fetch(API_BASE + '/api/status', { signal: AbortSignal.timeout(25000) });
      if (r.ok) {
        const data = await r.json();
        setPollinationsOk(!!data.ai_active);
        setPollinationsErr(data.error || '');
        const mr = await fetch(API_BASE + '/api/models');
        if (mr.ok) {
          const md = await mr.json();
          const models = md.installed || [];
          setInstalledModels(models);
          if (models.length > 0 && !models.includes(selectedModel)) setSelectedModel(models[0]);
        }
      } else {
        const errBody = await r.text().catch(() => '');
        setPollinationsOk(false);
        setPollinationsErr('HTTP ' + r.status + (errBody ? ': ' + errBody.slice(0,200) : ''));
      }
    } catch (e) {
      setPollinationsOk(false);
      setPollinationsErr('Error de red: ' + (e.message || e));
    }
  }, [selectedModel]);

  React.useEffect(() => { checkStatus(); const interval = setInterval(() => checkStatus(), 30000); return () => clearInterval(interval); }, []);

  // ── Animation loop ──
  React.useEffect(() => {
    if (!isPlaying || !simulationData) return;
    const tMax = simulationData.animacion_actores[simulationData.animacion_actores.length - 1].segundo;
    lastTimeRef.current = null;
    const tick = (ts) => {
      if (lastTimeRef.current !== null) {
        const dt = (ts - lastTimeRef.current) / 1000;
        setTCurrent(prev => {
          const next = prev + dt * speed;
          if (next >= tMax) { setIsPlaying(false); return tMax; }
          return next;
        });
      }
      lastTimeRef.current = ts;
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [isPlaying, simulationData, speed]);

  // ── Generate simulation ──
  const handleGenerate = async () => {
    if (!relato.trim()) { setError('Por favor escribe un relato del siniestro.'); return; }

    setError(''); setLoading(true); setSimulationData(null);
    setTCurrent(0); setIsPlaying(false);
    setLoadingMsg('Procesando relato con ' + selectedModel + '...');

    try {
      setLoadingMsg('Esperando respuesta de ' + selectedModel + ' (10-30 seg)...');
      const r = await fetch(API_BASE + '/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ relato: relato.trim(), model: selectedModel, base_url: POLLINATIONS_URL })
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: 'HTTP ' + r.status }));
        throw new Error(err.error || 'HTTP ' + r.status);
      }
      const result = await r.json();
      if (!result || !result.infraestructura || !result.animacion_actores || result.animacion_actores.length < 2)
        throw new Error('El JSON no cumple el esquema esperado.');
      result.animacion_actores = result.animacion_actores.map(f => ({
        segundo: parseFloat(f.segundo), v1_x: parseFloat(f.v1_x), v1_y: parseFloat(f.v1_y),
        v1_angulo: parseFloat(f.v1_angulo), v2_x: parseFloat(f.v2_x), v2_y: parseFloat(f.v2_y), v2_angulo: parseFloat(f.v2_angulo),
      }));
      setSimulationData(result); setTCurrent(0); setLoadingMsg('');
    } catch (e) { setError('Error al generar: ' + e.message); }
    finally { setLoading(false); }
  };

  // ── Download Turtle script ──
  const handleDownloadTurtle = async () => {
    if (!simulationData) return;
    try {
      const r = await fetch(API_BASE + '/api/turtle-script', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(simulationData),
      });
      if (!r.ok) throw new Error('No se pudo generar el script.');
      const blob = await r.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'forensia_simulacion.py'; a.click();
      URL.revokeObjectURL(url);
    } catch {
      const script = buildTurtleScript(simulationData);
      const blob = new Blob([script], { type: 'text/plain' }); const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'forensia_simulacion.py'; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const tMax = simulationData ? simulationData.animacion_actores[simulationData.animacion_actores.length - 1].segundo : 10;
  const currentFrame = simulationData ? interpolateFrame(simulationData.animacion_actores, tCurrent) : null;
  const phase = simulationData ? getPhase(simulationData.animacion_actores, tCurrent) : 'pre';
  const modelOptions = installedModels.length > 0 ? installedModels : RECOMMENDED_MODELS;

  return (
    <div className="app-layout">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-icon">🚓</span>
          <div>
            <div className="topbar-title">ForensIA · Reconstrucción Forense 3D</div>
            <div className="topbar-subtitle">Motor NIC-RF · IA en la nube (Pollinations)</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button className="btn btn-sm btn-secondary" onClick={() => checkStatus()} id="btn-refresh-status">🔄 Verificar</button>
          <div className={`topbar-status ${pollinationsOk === true ? 'ok' : 'err'}`}>
            <span className={`status-dot ${pollinationsOk === true ? 'ok' : 'err'}`}></span>
            {pollinationsOk === null ? 'Verificando...' : pollinationsOk ? 'Pollinations ✓ (' + installedModels.length + ' modelo' + (installedModels.length !== 1 ? 's' : '') + ')' : 'Pollinations ✗ Inactivo' + (pollinationsErr ? ' — ' + pollinationsErr : '')}
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside className="sidebar">
        <details className="card" style={{ padding: '0.75rem 1rem' }}>
          <summary className="card-title" style={{ marginBottom: 0, cursor: 'pointer' }}>Configuración IA</summary>
          <div style={{ paddingTop: '1rem' }}>
            <div className="input-group">
              <label htmlFor="model-select">Modelo</label>
              <select id="model-select" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
                {installedModels.length > 0 && <optgroup label="Disponibles">{installedModels.map(m => <option key={m} value={m}>{m}</option>)}</optgroup>}
                {installedModels.length === 0 && <optgroup label="Recomendados">{RECOMMENDED_MODELS.map(m => <option key={m} value={m}>{m}</option>)}</optgroup>}
              </select>
            </div>
            {!pollinationsOk && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>Pollinations inactivo{pollinationsErr ? ': ' + pollinationsErr : ''}</div>}
          </div>
        </details>

        {/* Relato Input */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '1rem' }}>
          <div className="card-title">Relato del siniestro</div>
          <div className="input-group" style={{ flex: 1, marginBottom: '0.75rem' }}>
            <textarea id="relato-input" value={relato} onChange={e => setRelato(e.target.value)} placeholder="Describe el accidente..." style={{ flex: 1, minHeight: '180px', resize: 'none' }} />
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>{error}</div>}

          {loading && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div className="loading-bar"><div className="loading-bar-inner" /></div>
              <div className="loading-text"><div className="spinner" />{loadingMsg}</div>
            </div>
          )}

          <div className="btn-row" style={{ marginTop: 'auto' }}>
            <button className="btn btn-primary" style={{ flex: 1, padding: '0.75rem' }} onClick={handleGenerate} disabled={loading}>
              {loading ? 'Procesando...' : 'Generar Simulación'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setSimulationData(null); setError(''); setTCurrent(0); setIsPlaying(false); }} disabled={loading}>🧹</button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <div className="card" style={{ padding: '1rem' }}>
          <div className="card-title" style={{ marginBottom: '0.75rem' }}>
            Simulación Forense 3D
            {simulationData && <span className="badge badge-neon" style={{ marginLeft: '0.75rem' }}>{simulationData.infraestructura}</span>}
          </div>

          <Viewer3D simulationData={simulationData} tCurrent={tCurrent} phase={phase} cameraMode={cameraMode} onCameraModeChange={setCameraMode} />

          {simulationData && (
            <div style={{ marginTop: '0.75rem' }}>
              <PlaybackControls frames={simulationData.animacion_actores} tCurrent={tCurrent} setTCurrent={setTCurrent}
                isPlaying={isPlaying} setIsPlaying={setIsPlaying} speed={speed} setSpeed={setSpeed} />
            </div>
          )}
        </div>

        {simulationData && currentFrame && (
          <div className="card fade-in-up">
            <div className="card-title" style={{ marginBottom: '0.75rem' }}>Parámetros en t = {tCurrent.toFixed(2)}s</div>
            <DataPanel frame={currentFrame} />
            <div className="btn-row" style={{ marginTop: '1rem' }}>
              <button id="btn-download-turtle" className="btn btn-green" onClick={handleDownloadTurtle}>
                🐢 Descargar Script Python (Turtle)
              </button>
            </div>
          </div>
        )}

        {simulationData && (
          <div className="card fade-in-up">
            <div className="card-title">Dictamen Técnico del Investigador IA</div>
            <div className="dictamen-box">{simulationData.dictamen_tecnico || 'Sin dictamen disponible.'}</div>
          </div>
        )}

        {simulationData && (
          <div className="fade-in-up"><RawDataExpander data={simulationData} /></div>
        )}
      </main>
    </div>
  );
};

// ── Mount React ──
const rootEl = document.getElementById('root');
ReactDOM.createRoot(rootEl).render(React.createElement(App));
