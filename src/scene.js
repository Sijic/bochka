import * as THREE from 'three';
import { resolveSiteAsset } from './env.js';

export const BARREL_BATCH_CODES = ['01', '19', '97', '12', '17', '26', '33', '48', '71', '99'];

export class WorkshopScene {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.onHoverBarrel = callbacks.onHoverBarrel || (() => {});
    this.onStrikeBarrel = callbacks.onStrikeBarrel || (() => {});
    this.onCameraMove = callbacks.onCameraMove || (() => {});
    this.onCeilingDrip = callbacks.onCeilingDrip || (() => {});

    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.isPortrait = this.width / Math.max(1, this.height) < 0.88;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.width > 500,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(this.width, this.height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.14;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0907);
    this.scene.fog = new THREE.FogExp2(0x0d0a08, 0.072);

    this.camera = new THREE.PerspectiveCamera(45, this.width / Math.max(1, this.height), 0.1, 38);
    this.baseCamPos = new THREE.Vector3(0, 2.25, 6.1);
    this.baseLookAt = new THREE.Vector3(0, 0.72, -0.45);
    this.currentLookAt = this.baseLookAt.clone();

    this.pointerNDC = new THREE.Vector2(-99, -99);
    this.swayTarget = new THREE.Vector2(0, 0);
    this.swayCurrent = new THREE.Vector2(0, 0);

    this.raycaster = new THREE.Raycaster();
    this.barrels = [];
    this.hitMeshes = [];
    this.proxyHitMeshes = [];
    this.activeBarrelCount = 6;
    this.hoveredIndex = -1;
    this.interactive = false;
    this.goldenMode = false;
    this.contextLost = false;

    this.diving = false;
    this.diveProgress = 0;
    this.diveTargetIndex = -1;
    this.diveStartPos = new THREE.Vector3();
    this.diveStartLook = new THREE.Vector3();

    this.shakeIntensity = 0;
    this.flashIntensity = 0;
    this.sparks = [];
    this.rustPuffs = [];
    this.waterDrops = [];
    this.floorRipples = [];
    this.nextDripCountdown = 0.85;

    // Декорации из фильма: кафельные колонны, маховик, решётчатые окна и висящие цепи
    this.leftColumn = null;
    this.rightColumn = null;
    this.flywheelGroup = null;
    this.chains = [];

    // Кино-реквизит и 2.5D персонажи (v6.1)
    this.wallClockGroup = null;
    this.clockHourPivot = null;
    this.clockMinPivot = null;
    this.clockSecPivot = null;
    this.clockRimMat = null;
    this.clockAirActive = false;
    this.clockAirLeft = 30;
    this.clockBlitz = false;
    this.clockSimSeconds = 8 * 3600 + 15 * 60;
    this.fatherPillarGroup = null;
    this.fatherSpriteMat = null;
    this.fatherMesh = null;
    this.fatherLight = null;
    this.fatherMissJolt = 0;
    this.pastorWalkerGroup = null;
    this.pastorSprite = null;
    this.pastorWalkTex1 = null;
    this.pastorWalkTex2 = null;
    this.pastorWalkDir = 1;
    this.pastorWalkPhase = 0;
    this.activeLevel = 1;
    this._isPortraitLayout = false;
    this._projVec = new THREE.Vector3();

    this.clock = new THREE.Clock();
    this.rafId = 0;
    this.pointerDownInfo = null;

    this._buildLighting();
    this._buildEnvironment();
    this._buildBarrels();
    this._buildParticles();
    this._applyResponsiveCameraAndLayout();
    this._bindEvents();
    this._animate();
  }

  setInteractive(flag) {
    this.interactive = Boolean(flag);
    if (!this.interactive && this.hoveredIndex !== -1) {
      this._setHovered(-1);
    }
  }

  setGoldenMode(enabled) {
    this.goldenMode = Boolean(enabled);
    if (this.mainSpot) {
      this.mainSpot.color.setHex(this.goldenMode ? 0xffcf40 : 0xffe0a3);
      this.mainSpot.intensity = this.goldenMode ? 88 : 72;
    }
    this.barrels.forEach((b) => {
      b.bodyMat.emissive.setHex(this.goldenMode ? 0x3b2804 : 0x000000);
      b.bodyMat.emissiveIntensity = this.goldenMode ? 0.35 : 0.0;
    });
  }

  setActiveBarrelCount(count) {
    const clean = Math.max(2, Math.min(this.barrels.length || 10, Math.round(Number(count) || 6)));
    this.activeBarrelCount = clean;
    this.barrels.forEach((b, idx) => {
      b.group.visible = idx < clean;
    });
    this._applyResponsiveCameraAndLayout();
  }

  resetRound({ targetIndex = 0, portraitUrl = '', golden = false, barrelCount = null } = {}) {
    if (typeof barrelCount === 'number' && !Number.isNaN(barrelCount)) {
      this.activeBarrelCount = Math.max(2, Math.min(this.barrels.length || 10, Math.round(barrelCount)));
    }
    this.diving = false;
    this.diveProgress = 0;
    this.diveTargetIndex = targetIndex;
    this.shakeIntensity = 0;
    this.interiorSpot.intensity = 0;
    this.setGoldenMode(golden);

    this.barrels.forEach((b, idx) => {
      b.group.visible = idx < this.activeBarrelCount;
      b.struck = false;
      b.dentTarget = 0;
      b.dentUniforms.uDentDepth.value = 0;
      b.lidGroup.visible = true;
      b.lidGroup.position.set(0, 1.355, 0);
      b.lidGroup.rotation.set(0, idx * 0.9, 0);
      b.lidVel.set(0, 0, 0);
      b.lidSpin.set(0, 0, 0);
      b.lidFlying = false;
      b.ringMesh.material.opacity = 0;
      b.portraitMesh.visible = idx === targetIndex && idx < this.activeBarrelCount;
    });

    if (portraitUrl) {
      this.setTargetPortrait(targetIndex, portraitUrl);
    }
    this._applyResponsiveCameraAndLayout();
  }

  setTargetPortrait(targetIndex, portraitUrl) {
    this.diveTargetIndex = targetIndex;
    this.barrels.forEach((b, idx) => {
      b.portraitMesh.visible = idx === targetIndex;
    });
    if (!portraitUrl) return;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      portraitUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        this.cachedPortraitTex = tex;
        this.barrels.forEach((b, idx) => {
          b.portraitMesh.visible = idx === this.diveTargetIndex;
          if (idx === this.diveTargetIndex) {
            b.portraitMat.map = tex;
            b.portraitMat.needsUpdate = true;
          }
        });
      },
      undefined,
      () => { /* keep fallback */ }
    );
  }

  /**
   * Мгновенно переносит портрет на выбранную бочку (для 5-го гарантированного удара воронки)
   */
  assignTargetBarrelNow(targetIndex) {
    this.diveTargetIndex = targetIndex;
    this.barrels.forEach((b, idx) => {
      b.portraitMesh.visible = idx === targetIndex;
      if (idx === targetIndex && this.cachedPortraitTex) {
        b.portraitMat.map = this.cachedPortraitTex;
        b.portraitMat.needsUpdate = true;
      }
    });
  }

  getBarrelWorldPositions() {
    return this.barrels.slice(0, this.activeBarrelCount).map((b) => b.group.position.clone());
  }

  /**
   * Удар по бочке: вмятина, искры, встряска и физическое раскачивание висящих ржавых цепей
   */
  triggerStrikeFX(index, worldHitPoint = null) {
    const b = this.barrels[index];
    if (!b) return;
    b.struck = true;

    const hitWorld = worldHitPoint
      ? worldHitPoint.clone()
      : b.group.position.clone().add(new THREE.Vector3(0, 0.86, 0.42));

    const localHit = b.bodyMesh.worldToLocal(hitWorld.clone());
    b.dentUniforms.uDentPos.value.copy(localHit);
    b.dentTarget = 1.0;

    this.shakeIntensity = 0.22;
    this.strikeLight.position.copy(hitWorld).add(new THREE.Vector3(0, 0.18, 0.32));
    this.flashIntensity = 9.5;

    this._spawnSparks(hitWorld, 24);
    this._impulseChains(1.0);
  }

  /**
   * Срывает крышку ПУСТОЙ бочки при промахе (вылетает облако ржавой пыли, бочка остаётся открытой)
   */
  triggerEmptyBarrelOpen(index) {
    const b = this.barrels[index];
    if (!b) return;
    b.struck = true;
    b.portraitMesh.visible = false;

    if (!b.lidFlying && b.lidGroup.visible) {
      b.lidFlying = true;
      const sideDir = index < 3 ? -1 : 1;
      b.lidVel.set(sideDir * (0.9 + Math.random() * 1.1), 3.6 + Math.random() * 0.8, -1.6);
      b.lidSpin.set(-5.2, sideDir * 3.4, 2.6);
    }

    const rimWorld = b.group.position.clone().add(new THREE.Vector3(0, 1.36, 0));
    this._spawnRustDust(rimWorld, 16);
    this._impulseChains(1.25);
  }

  /**
   * Резкий удар тряски камеры при срабатывании 0.4-секундного фирменного скримера
   */
  triggerScreamerShake(intensity = 0.36) {
    this.shakeIntensity = Math.max(this.shakeIntensity || 0, intensity);
    this._impulseChains(1.4);
  }

  /**
   * Срыв стальной крышки победной бочки и нырок камеры внутрь к портрету и голосу
   */
  triggerRevealDive(targetIndex) {
    const b = this.barrels[targetIndex];
    if (!b) return;
    this.interactive = false;
    this._setHovered(-1);

    this.assignTargetBarrelNow(targetIndex);

    b.lidFlying = true;
    b.lidVel.set((Math.random() - 0.5) * 1.8, 4.8, -2.5);
    b.lidSpin.set(-6.8, (Math.random() - 0.5) * 4, 3.4);

    this.shakeIntensity = 0.28;
    const rimWorld = b.group.position.clone().add(new THREE.Vector3(0, 1.38, 0));
    this._spawnSparks(rimWorld, 32);
    this._spawnRustDust(rimWorld, 12);
    this._impulseChains(1.6);

    this.interiorSpot.position.set(b.group.position.x + 0.12, 3.2, b.group.position.z + 0.18);
    this.interiorSpot.target.position.set(b.group.position.x, 0.35, b.group.position.z);
    this.interiorSpot.target.updateMatrixWorld();
    this.interiorSpot.intensity = 15;

    this.diving = true;
    this.diveProgress = 0;
    this.diveTargetIndex = targetIndex;
    this.diveStartPos.copy(this.camera.position);
    this.diveStartLook.copy(this.currentLookAt);
  }

  _impulseChains(power = 1.0) {
    for (const ch of this.chains) {
      const sign = Math.random() > 0.5 ? 1 : -1;
      ch.velZ += sign * (0.9 + Math.random() * 0.9) * power;
      ch.velX += (Math.random() - 0.5) * 1.1 * power;
    }
  }

  _buildLighting() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x14181c);

    const ceilStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe2a8, side: THREE.DoubleSide })
    );
    ceilStrip.position.set(0, 6, 2);
    ceilStrip.rotation.x = Math.PI * 0.5;
    envScene.add(ceilStrip);

    const leftStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 5),
      new THREE.MeshBasicMaterial({ color: 0x6b9ac4, side: THREE.DoubleSide })
    );
    leftStrip.position.set(-7, 2.5, 1);
    leftStrip.rotation.y = Math.PI * 0.5;
    envScene.add(leftStrip);

    const rightRustStrip = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 4),
      new THREE.MeshBasicMaterial({ color: 0xc2611b, side: THREE.DoubleSide })
    );
    rightRustStrip.position.set(7, 2.0, 1);
    rightRustStrip.rotation.y = -Math.PI * 0.5;
    envScene.add(rightRustStrip);

    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xa3b3c2, 0x1e1610, 0.72);
    this.scene.add(hemi);

    // Главный верхний цеховой прожектор
    this.mainSpot = new THREE.SpotLight(0xffcf86, 78, 24, Math.PI * 0.40, 0.56, 1.18);
    this.mainSpot.position.set(0, 6.6, 1.35);
    this.mainSpot.target.position.set(0, 0.1, -0.55);
    this.mainSpot.castShadow = true;
    this.mainSpot.shadow.mapSize.set(1024, 1024);
    this.mainSpot.shadow.bias = -0.0005;
    this.scene.add(this.mainSpot, this.mainSpot.target);

    const frontKey = new THREE.DirectionalLight(0xeadbc8, 1.05);
    frontKey.position.set(0.4, 2.6, 5.4);
    this.scene.add(frontKey);

    // Холодный контровой свет из двухъярусных решётчатых окон позади маховика
    const windowBacklight = new THREE.DirectionalLight(0x6ca0bc, 1.65);
    windowBacklight.position.set(-1.5, 5.2, -5.5);
    this.scene.add(windowBacklight);

    const warmFill = new THREE.PointLight(0xd95b12, 3.5, 11);
    warmFill.position.set(3.4, 1.6, 1.8);
    this.scene.add(warmFill);

    this.strikeLight = new THREE.PointLight(0xffb732, 0, 6.5);
    this.scene.add(this.strikeLight);

    this.interiorSpot = new THREE.SpotLight(0xdbeafe, 0, 6, Math.PI * 0.22, 0.45, 1.1);
    this.scene.add(this.interiorSpot, this.interiorSpot.target);
  }

  _buildEnvironment() {
    // 1. Мокрый бетонный пол с зеркальными лужами
    const floorMaps = this._createWetConcreteTextures();
    const floorGeo = new THREE.PlaneGeometry(24, 20);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorMaps.color,
      roughnessMap: floorMaps.roughness,
      bumpMap: floorMaps.roughness,
      bumpScale: 0.018,
      metalness: 0.2,
      roughness: 0.62,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI * 0.5;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 2. Дальняя заводская стена в тумане
    const wallTex = this._createBackWallWindowShadowTexture();
    const wallGeo = new THREE.PlaneGeometry(22, 10);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.94,
      metalness: 0.06,
    });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 4.2, -5.8);
    this.scene.add(backWall);

    // 3. ДВУХЪЯРУСНЫЕ РЕШЁТЧАТЫЕ ПРОМЫШЛЕННЫЕ ОКНА ПОД ПОТОЛКОМ (контровой лунный свет)
    this._buildTwoTierBarredWindows();

    // 4. ОГРОМНОЕ ЧУГУННОЕ КОЛЕСО-МАХОВИК В КОНТРОВОМ ТУМАНЕ НА ДАЛЬНЕМ ПЛАНЕ
    this._buildGiantFlywheel();

    // 5. КВАДРАТНЫЕ КОЛОННЫ С ОБЛУПИВШЕЙСЯ СЕРО-ЗЕЛЁНОЙ КАФЕЛЬНОЙ ПЛИТКОЙ + РЖАВЫЕ ЦЕПИ
    this._buildTiledColumnsAndChains();
    this._buildFilmWallClock();
    this._buildFilmCharacters();

    // 6. Объёмный конус верхнего прожектора в сыром тумане
    const coneGeo = new THREE.ConeGeometry(4.2, 6.6, 32, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.026,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lightCone = new THREE.Mesh(coneGeo, coneMat);
    lightCone.position.set(0, 3.25, -0.25);
    this.scene.add(lightCone);
  }

  _buildTwoTierBarredWindows() {
    const winGroup = new THREE.Group();
    winGroup.position.set(0, 3.88, -5.35);

    const paneTex = this._createIndustrialWindowTexture();
    const paneMat = new THREE.MeshBasicMaterial({
      map: paneTex,
      transparent: true,
      opacity: 0.76,
    });

    const barMat = new THREE.MeshStandardMaterial({
      color: 0x15181c,
      metalness: 0.75,
      roughness: 0.55,
    });

    const bankPositions = [-3.25, 0, 3.25];
    for (const bx of bankPositions) {
      const bank = new THREE.Group();
      bank.position.x = bx;

      // Два яруса остекления
      for (const tierY of [-0.52, 0.52]) {
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.88), paneMat);
        glass.position.y = tierY;
        bank.add(glass);

        const hFrame = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.06, 0.08), barMat);
        hFrame.position.set(0, tierY - 0.44, 0.03);
        bank.add(hFrame);
      }

      const topFrame = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.07, 0.08), barMat);
      topFrame.position.set(0, 0.98, 0.03);
      bank.add(topFrame);

      // Стальные тюремные/заводские решётки по обоим ярусам
      for (let rx = -1.1; rx <= 1.11; rx += 0.36) {
        const vBar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.98, 6), barMat);
        vBar.position.set(rx, 0, 0.05);
        bank.add(vBar);
      }

      winGroup.add(bank);
    }

    // Косые лучи холодного света из решётчатых окон
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0x93c5fd,
      transparent: true,
      opacity: 0.022,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (const sx of [-2.8, 0.2, 2.9]) {
      const shaft = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 6.2), shaftMat);
      shaft.position.set(sx, 2.7, -3.6);
      shaft.rotation.x = 0.42;
      shaft.rotation.y = sx * -0.06;
      this.scene.add(shaft);
    }

    this.scene.add(winGroup);
  }

  _buildGiantFlywheel() {
    const group = new THREE.Group();
    group.position.set(0, 2.45, -4.55);

    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x16191d,
      metalness: 0.82,
      roughness: 0.48,
    });

    // Массивный чугунный обод маховика
    const outerRim = new THREE.Mesh(new THREE.TorusGeometry(2.55, 0.22, 12, 48), ironMat);
    group.add(outerRim);

    const innerRim = new THREE.Mesh(new THREE.TorusGeometry(2.12, 0.07, 8, 40), ironMat);
    group.add(innerRim);

    // Центральная ступица и вал
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.48, 20), ironMat);
    hub.rotation.x = Math.PI * 0.5;
    group.add(hub);

    // 8 литых чугунных спиц
    const spokeGeo = new THREE.BoxGeometry(0.16, 4.9, 0.14);
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(spokeGeo, ironMat);
      spoke.rotation.z = (i * Math.PI) / 4;
      group.add(spoke);
    }

    // Болты/зубья по внешнему ободу для узнаваемого индустриального силуэта
    const toothGeo = new THREE.BoxGeometry(0.12, 0.18, 0.24);
    for (let t = 0; t < 24; t++) {
      const ang = (t / 24) * Math.PI * 2;
      const tooth = new THREE.Mesh(toothGeo, ironMat);
      tooth.position.set(Math.cos(ang) * 2.74, Math.sin(ang) * 2.74, 0);
      tooth.rotation.z = ang;
      group.add(tooth);
    }

    // Контровое свечение тумана прямо за маховиком, чтобы силуэт читался сквозь дымку
    const haloTex = this._createRadialFogGlowTexture();
    const haloMat = new THREE.MeshBasicMaterial({
      map: haloTex,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 6.8), haloMat);
    halo.position.set(0, 2.55, -5.05);
    this.scene.add(halo);

    this.flywheelGroup = group;
    this.scene.add(group);
  }

  _buildTiledColumnsAndChains() {
    const tileMaps = this._createPeelingTileColumnTextures();
    const colGeo = new THREE.BoxGeometry(0.92, 6.6, 0.92);
    const colMat = new THREE.MeshStandardMaterial({
      map: tileMaps.color,
      roughnessMap: tileMaps.roughness,
      bumpMap: tileMaps.bump,
      bumpScale: 0.032,
      metalness: 0.08,
      roughness: 0.55,
    });

    const plinthGeo = new THREE.BoxGeometry(1.04, 0.42, 1.04);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x181b1e,
      roughness: 0.88,
      metalness: 0.12,
    });

    const createColumnWithChains = (side) => {
      const wrap = new THREE.Group();
      const shaft = new THREE.Mesh(colGeo, colMat);
      shaft.position.y = 3.3;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      wrap.add(shaft);

      const plinth = new THREE.Mesh(plinthGeo, plinthMat);
      plinth.position.y = 0.21;
      plinth.receiveShadow = true;
      wrap.add(plinth);

      // Стальной хомут на колонне + две свисающие ржавые цепи разной длины
      const collar = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.12, 0.98),
        new THREE.MeshStandardMaterial({ color: 0x3b2314, metalness: 0.78, roughness: 0.58 })
      );
      collar.position.y = 3.55;
      wrap.add(collar);

      const chainA = this._createHangingRustChain(13, 3.52, -side * 0.48, 0.22);
      const chainB = this._createHangingRustChain(9, 3.25, -side * 0.34, 0.48);
      wrap.add(chainA.pivot, chainB.pivot);
      this.chains.push(chainA, chainB);

      this.scene.add(wrap);
      return wrap;
    };

    this.leftColumn = createColumnWithChains(-1);
    this.rightColumn = createColumnWithChains(1);
  }

  _createHangingRustChain(linksCount, topY, offsetX, offsetZ) {
    const pivot = new THREE.Group();
    pivot.position.set(offsetX, topY, offsetZ);

    const rustMat = new THREE.MeshStandardMaterial({
      color: 0x4b2815,
      metalness: 0.76,
      roughness: 0.62,
    });

    const linkGeo = new THREE.TorusGeometry(0.052, 0.015, 6, 12);
    linkGeo.scale(0.72, 1.35, 1.0);

    for (let i = 0; i < linksCount; i++) {
      const link = new THREE.Mesh(linkGeo, rustMat);
      link.position.y = -0.09 - i * 0.115;
      link.rotation.y = (i % 2) * (Math.PI * 0.5);
      pivot.add(link);
    }

    // Тяжёлый стальной крюк на конце цепи
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 12, Math.PI * 1.45), rustMat);
    hook.position.y = -0.12 - linksCount * 0.115;
    hook.rotation.z = Math.PI * 0.85;
    pivot.add(hook);

    return {
      pivot,
      angleX: (Math.random() - 0.5) * 0.04,
      angleZ: (Math.random() - 0.5) * 0.04,
      velX: 0,
      velZ: 0,
      freq: 2.5 + Math.random() * 0.6,
    };
  }

  _buildBarrels() {
    const pts = [
      new THREE.Vector2(0.001, 0.02),
      new THREE.Vector2(0.425, 0.02),
      new THREE.Vector2(0.445, 0.035),
      new THREE.Vector2(0.422, 0.06),
      new THREE.Vector2(0.422, 0.41),
      new THREE.Vector2(0.448, 0.445),
      new THREE.Vector2(0.422, 0.48),
      new THREE.Vector2(0.422, 0.89),
      new THREE.Vector2(0.448, 0.925),
      new THREE.Vector2(0.422, 0.96),
      new THREE.Vector2(0.422, 1.33),
      new THREE.Vector2(0.448, 1.355),
      new THREE.Vector2(0.405, 1.375),
      new THREE.Vector2(0.392, 1.35),
      new THREE.Vector2(0.390, 0.22),
      new THREE.Vector2(0.001, 0.22),
    ];
    const sharedBodyGeo = new THREE.LatheGeometry(pts, 44);
    const posAttr = sharedBodyGeo.attributes.position;
    const uvAttr = sharedBodyGeo.attributes.uv;
    for (let k = 0; k < posAttr.count; k++) {
      const rx = Math.hypot(posAttr.getX(k), posAttr.getZ(k));
      const py = posAttr.getY(k);
      const vLinear = rx > 0.40 ? THREE.MathUtils.clamp(py / 1.38, 0, 1) : 0.02;
      uvAttr.setY(k, vLinear);
    }
    uvAttr.needsUpdate = true;
    sharedBodyGeo.computeVertexNormals();

    const lidPlateGeo = new THREE.CylinderGeometry(0.402, 0.402, 0.022, 36);
    const lidRimGeo = new THREE.TorusGeometry(0.408, 0.014, 10, 36);
    lidRimGeo.rotateX(Math.PI * 0.5);
    const bungBigGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.028, 8);
    const bungSmallGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.026, 8);

    const ringGeo = new THREE.RingGeometry(0.48, 0.525, 40);
    ringGeo.rotateX(-Math.PI * 0.5);

    const portraitGeo = new THREE.CircleGeometry(0.382, 44);
    portraitGeo.rotateX(-Math.PI * 0.5);

    // Расширенный невидимый цилиндр-хитбокс (BUG-UX11: уверенный тап по мелким бочкам Блица на 375px и дальней бочке 97)
    const proxyHitGeo = new THREE.CylinderGeometry(0.60, 0.60, 1.78, 12);
    const proxyHitMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      transparent: true,
      opacity: 0,
    });

    const defaultPortraitTex = this._createDefaultPortraitTexture();
    this.cachedPortraitTex = defaultPortraitTex;

    for (let i = 0; i < 10; i++) {
      const group = new THREE.Group();
      const batchCode = BARREL_BATCH_CODES[i] || `${i + 1}`;
      const maps = this._createBarrelPBRTextures(batchCode, i + 1);

      const dentUniforms = {
        uDentPos: { value: new THREE.Vector3(0, 0.8, 0.42) },
        uDentDepth: { value: 0.0 },
      };

      const bodyMat = new THREE.MeshStandardMaterial({
        map: maps.color,
        roughnessMap: maps.roughness,
        bumpMap: maps.bump,
        bumpScale: 0.026,
        metalness: 0.72,
        roughness: 0.46,
        envMapIntensity: 0.95,
      });

      bodyMat.onBeforeCompile = (shader) => {
        shader.uniforms.uDentPos = dentUniforms.uDentPos;
        shader.uniforms.uDentDepth = dentUniforms.uDentDepth;

        shader.vertexShader =
          `uniform vec3 uDentPos;\nuniform float uDentDepth;\nvarying float vDentMask;\n` +
          shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
             float dentDist = distance(transformed, uDentPos);
             float dentMask = smoothstep(0.32, 0.0, dentDist) * uDentDepth;
             vDentMask = dentMask;
             transformed.xz *= (1.0 - dentMask * 0.24);
             transformed.y -= dentMask * 0.035;`
          );

        shader.fragmentShader =
          `varying float vDentMask;\n` +
          shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            `gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.75, 0.62, 0.42), vDentMask * 0.38);
             #include <dithering_fragment>`
          );
      };

      const bodyMesh = new THREE.Mesh(sharedBodyGeo, bodyMat);
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      bodyMesh.userData.barrelIndex = i;
      group.add(bodyMesh);

      const lidGroup = new THREE.Group();
      lidGroup.position.set(0, 1.355, 0);
      lidGroup.rotation.y = i * 0.9;

      const lidMat = new THREE.MeshStandardMaterial({
        color: 0x26292e,
        metalness: 0.82,
        roughness: 0.48,
        bumpMap: maps.bump,
        bumpScale: 0.012,
      });
      const lidPlate = new THREE.Mesh(lidPlateGeo, lidMat);
      lidPlate.userData.barrelIndex = i;
      const lidRim = new THREE.Mesh(lidRimGeo, lidMat);
      lidRim.position.y = 0.01;
      const bung1 = new THREE.Mesh(bungBigGeo, lidMat);
      bung1.position.set(0.21, 0.015, 0.05);
      const bung2 = new THREE.Mesh(bungSmallGeo, lidMat);
      bung2.position.set(-0.2, 0.015, -0.06);

      lidGroup.add(lidPlate, lidRim, bung1, bung2);
      group.add(lidGroup);

      const portraitMat = new THREE.MeshBasicMaterial({
        map: defaultPortraitTex,
        toneMapped: false,
      });
      const portraitMesh = new THREE.Mesh(portraitGeo, portraitMat);
      portraitMesh.position.set(0, 0.61, 0);
      portraitMesh.visible = false;
      group.add(portraitMesh);

      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xeab308,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.012;
      group.add(ringMesh);

      const proxyMesh = new THREE.Mesh(proxyHitGeo, proxyHitMat);
      proxyMesh.position.y = 0.80;
      proxyMesh.userData.barrelIndex = i;
      group.add(proxyMesh);

      this.scene.add(group);
      this.hitMeshes.push(bodyMesh, lidPlate);
      this.proxyHitMeshes.push(proxyMesh);

      this.barrels.push({
        index: i,
        group,
        bodyMesh,
        bodyMat,
        lidGroup,
        ringMesh,
        portraitMesh,
        portraitMat,
        dentUniforms,
        dentTarget: 0,
        struck: false,
        lidFlying: false,
        lidVel: new THREE.Vector3(),
        lidSpin: new THREE.Vector3(),
      });
    }
  }

  _buildParticles() {
    // 1. Взвешенная пыль в луче прожектора
    const count = 65;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 6.5;
      pos[i * 3 + 1] = 0.3 + Math.random() * 4.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4.5 - 0.3;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: 0xfef08a,
      size: 0.032,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dustPoints);

    // 2. Пул искр удара
    const sparkGeo = new THREE.SphereGeometry(0.018, 4, 4);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc83d });
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(sparkGeo, sparkMat);
      m.visible = false;
      this.scene.add(m);
      this.sparks.push({ mesh: m, vel: new THREE.Vector3(), life: 0 });
    }

    // 3. Пул клубов ржавой пыли при вскрытии пустой бочки
    const rustGeo = new THREE.PlaneGeometry(0.28, 0.28);
    const rustTex = this._createSoftSmokeSpriteTexture();
    for (let i = 0; i < 24; i++) {
      const rMat = new THREE.MeshBasicMaterial({
        map: rustTex,
        color: 0xa85520,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const m = new THREE.Mesh(rustGeo, rMat);
      m.visible = false;
      this.scene.add(m);
      this.rustPuffs.push({ mesh: m, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
    }

    // 4. Капли воды с потолка + расходящиеся круги по лужам на мокром бетоне
    const dropGeo = new THREE.SphereGeometry(0.016, 5, 5);
    dropGeo.scale(0.65, 2.4, 0.65);
    const dropMat = new THREE.MeshBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.72,
    });
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      m.visible = false;
      this.scene.add(m);
      this.waterDrops.push({ mesh: m, vy: 0, active: false });
    }

    const rippleGeo = new THREE.RingGeometry(0.08, 0.105, 28);
    rippleGeo.rotateX(-Math.PI * 0.5);
    for (let i = 0; i < 8; i++) {
      const ripMat = new THREE.MeshBasicMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const m = new THREE.Mesh(rippleGeo, ripMat);
      m.visible = false;
      this.scene.add(m);
      this.floorRipples.push({ mesh: m, age: 0, duration: 1.25, active: false });
    }
  }

  _spawnSparks(origin, amount = 22) {
    let spawned = 0;
    for (const s of this.sparks) {
      if (s.life > 0) continue;
      s.life = 0.28 + Math.random() * 0.24;
      s.mesh.visible = true;
      s.mesh.position.copy(origin);
      s.vel.set(
        (Math.random() - 0.5) * 5.2,
        1.4 + Math.random() * 3.4,
        0.6 + (Math.random() - 0.3) * 4.2
      );
      spawned++;
      if (spawned >= amount) break;
    }
  }

  _spawnRustDust(origin, amount = 14) {
    let spawned = 0;
    for (const p of this.rustPuffs) {
      if (p.life > 0) continue;
      p.maxLife = 0.65 + Math.random() * 0.35;
      p.life = p.maxLife;
      p.mesh.visible = true;
      p.mesh.position.copy(origin).add(
        new THREE.Vector3((Math.random() - 0.5) * 0.35, 0.05, (Math.random() - 0.5) * 0.35)
      );
      p.mesh.scale.setScalar(0.65 + Math.random() * 0.5);
      p.vel.set(
        (Math.random() - 0.5) * 1.4,
        0.85 + Math.random() * 1.3,
        (Math.random() - 0.5) * 1.4
      );
      spawned++;
      if (spawned >= amount) break;
    }
  }

  _spawnCeilingDrip() {
    const drop = this.waterDrops.find((d) => !d.active);
    if (!drop) return;
    drop.active = true;
    drop.vy = -4.5;
    const spreadX = this.isPortrait ? 2.1 : 3.8;
    const x = (Math.random() - 0.5) * spreadX * 2;
    const z = -2.2 + Math.random() * 3.4;
    drop.mesh.position.set(x, 5.6, z);
    drop.mesh.visible = true;
  }

  _spawnFloorRipple(x, z) {
    const rip = this.floorRipples.find((r) => !r.active);
    if (!rip) return;
    rip.active = true;
    rip.age = 0;
    rip.duration = 1.15 + Math.random() * 0.35;
    rip.mesh.position.set(x, 0.015, z);
    rip.mesh.scale.setScalar(0.4);
    rip.mesh.material.opacity = 0.52;
    rip.mesh.visible = true;
  }

  _applyResponsiveCameraAndLayout() {
    const aspect = this.width / Math.max(1, this.height);
    this.isPortrait = aspect < 0.88;
    const n = Math.max(2, Math.min(this.barrels.length || 10, this.activeBarrelCount || 6));

    this.barrels.forEach((b, idx) => {
      b.group.visible = idx < n;
    });

    if (this.isPortrait) {
      const coords = [];
      let bScale = 1.0;

      if (n <= 3) {
        bScale = 1.04;
        if (n === 2) {
          coords.push([-0.82, -0.45], [0.82, -0.45]);
        } else {
          coords.push([-1.14, -0.58], [0.0, -1.04], [1.14, -0.58]);
        }
      } else {
        const backCount = Math.ceil(n / 2);
        const frontCount = n - backCount;
        bScale = n >= 9 ? 0.76 : n >= 7 ? 0.84 : 0.96;
        const maxHalfBack = n >= 9 ? 1.56 : n >= 7 ? 1.42 : 1.18;
        const maxHalfFront = n >= 9 ? 1.58 : n >= 7 ? 1.38 : 1.24;

        for (let i = 0; i < backCount; i++) {
          const t = backCount === 1 ? 0 : (i / (backCount - 1)) * 2 - 1;
          const x = t * maxHalfBack;
          const z = -1.42 - (1 - Math.abs(t)) * 0.34;
          coords.push([x, z]);
        }
        for (let j = 0; j < frontCount; j++) {
          const t = frontCount === 1 ? 0 : (j / (frontCount - 1)) * 2 - 1;
          const x = t * maxHalfFront;
          const z = 0.08 + (1 - Math.abs(t)) * 0.28;
          coords.push([x, z]);
        }
      }

      for (let idx = 0; idx < n; idx++) {
        const b = this.barrels[idx];
        const [x, z] = coords[idx] || [0, 0];
        b.group.position.set(x, 0, z);
        b.group.scale.setScalar(bScale);
        b.bodyMesh.rotation.y = Math.PI - x * 0.22;
      }

      if (this.leftColumn) this.leftColumn.position.set(-2.22, 0, -2.35);
      if (this.rightColumn) this.rightColumn.position.set(2.22, 0, -2.35);
      if (this.flywheelGroup) this.flywheelGroup.scale.setScalar(0.82);
      this._isPortraitLayout = true;
      if (this.wallClockGroup) {
        this.wallClockGroup.position.set(0.94, 2.04, -2.72);
        this.wallClockGroup.scale.setScalar(0.95);
      }
      if (this.fatherPillarGroup) {
        this.fatherPillarGroup.position.set(-0.72, 0, -2.42);
        this.fatherPillarGroup.scale.setScalar(0.95);
      }

      this.camera.fov = 50;
      const crowdPull = n >= 9 ? 1.15 : n >= 7 ? 1.09 : 1.0;
      const distScale = Math.max(1, 0.52 / Math.max(0.36, aspect)) * crowdPull;
      this.baseCamPos.set(0, 3.36 * distScale, 5.85 * distScale);
      this.baseLookAt.set(0, n >= 7 ? 0.94 : 0.98, -0.62);
    } else {
      if (n <= 6) {
        const maxAng = n === 2 ? 0.32 : n === 3 ? 0.62 : n === 4 ? 0.84 : n === 5 ? 1.02 : 1.16;
        const radius = n <= 3 ? 2.65 : 3.08;
        const centerZ = 1.38;
        const bScale = n <= 3 ? 1.04 : 1.0;
        for (let idx = 0; idx < n; idx++) {
          const t = n === 1 ? 0 : (idx / (n - 1)) * 2 - 1;
          const a = t * maxAng;
          const x = Math.sin(a) * radius;
          const z = centerZ - Math.cos(a) * radius;
          const b = this.barrels[idx];
          b.group.position.set(x, 0, z);
          b.group.scale.setScalar(bScale);
          b.bodyMesh.rotation.y = Math.PI - a * 0.65;
        }
      } else {
        // Шахматная расстановка на ПК (для 10 бочек: 6 сзади / 4 спереди), чтобы передняя бочка не перекрывала дальнюю 97 (idx=2)
        const backCount = n === 10 ? 6 : Math.ceil(n / 2);
        const frontCount = n - backCount;
        const bScale = n >= 9 ? 0.88 : 0.92;
        const angleJitter = frontCount === backCount ? 0.14 : 0;
        let ptr = 0;
        for (let i = 0; i < backCount; i++) {
          const t = backCount === 1 ? 0 : (i / (backCount - 1)) * 2 - 1;
          const a = t * 1.16;
          const x = Math.sin(a) * 3.48;
          const z = 1.32 - Math.cos(a) * 3.48;
          const b = this.barrels[ptr++];
          b.group.position.set(x, 0, z);
          b.group.scale.setScalar(bScale);
          b.bodyMesh.rotation.y = Math.PI - a * 0.6;
        }
        for (let j = 0; j < frontCount; j++) {
          const t = frontCount === 1 ? 0 : (j / (frontCount - 1)) * 2 - 1;
          const a = t * 0.94 + angleJitter;
          const x = Math.sin(a) * 2.24;
          const z = 1.72 - Math.cos(a) * 2.24;
          const b = this.barrels[ptr++];
          b.group.position.set(x, 0, z);
          b.group.scale.setScalar(bScale);
          b.bodyMesh.rotation.y = Math.PI - a * 0.55;
        }
      }

      if (this.leftColumn) this.leftColumn.position.set(-4.05, 0, -1.78);
      if (this.rightColumn) this.rightColumn.position.set(4.05, 0, -1.78);
      if (this.flywheelGroup) this.flywheelGroup.scale.setScalar(1.0);
      this._isPortraitLayout = false;
      if (this.wallClockGroup) {
        this.wallClockGroup.position.set(2.10, 2.18, -2.72);
        this.wallClockGroup.scale.setScalar(1.12);
      }
      if (this.fatherPillarGroup) {
        this.fatherPillarGroup.position.set(-1.42, 0, -2.48);
        this.fatherPillarGroup.scale.setScalar(1.0);
      }

      this.camera.fov = 42;
      const crowdAdjust = n >= 7 ? 1.12 : 1.0;
      const wideAdjust = (aspect < 1.35 ? 1.14 : 1.0) * crowdAdjust;
      const camY = n >= 7 ? 2.62 * wideAdjust : 2.22 * wideAdjust;
      const camZ = n >= 7 ? 6.24 * wideAdjust : 5.88 * wideAdjust;
      this.baseCamPos.set(0, camY, camZ);
      this.baseLookAt.set(0, n >= 7 ? 0.80 : 0.74, -0.62);
    }

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    if (!this.diving) {
      this.camera.position.copy(this.baseCamPos);
      this.currentLookAt.copy(this.baseLookAt);
      this.camera.lookAt(this.currentLookAt);
    }
  }

  _bindEvents() {
    window.addEventListener('resize', () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.renderer.setSize(this.width, this.height);
      this._applyResponsiveCameraAndLayout();
    });

    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null || e.beta == null) return;
      const gx = THREE.MathUtils.clamp(e.gamma / 30, -1, 1);
      const gy = THREE.MathUtils.clamp((e.beta - 45) / 30, -1, 1);
      this.swayTarget.set(gx * 0.28, -gy * 0.16);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const nx = (e.clientX / Math.max(1, this.width)) * 2 - 1;
      const ny = -(e.clientY / Math.max(1, this.height)) * 2 + 1;
      this.pointerNDC.set(nx, ny);
      this.swayTarget.set(nx * 0.34, ny * 0.18);

      if (this.pointerDownInfo) {
        const dx = e.clientX - this.pointerDownInfo.x;
        const dy = e.clientY - this.pointerDownInfo.y;
        if (Math.hypot(dx, dy) > 14) {
          this.pointerDownInfo.dragged = true;
        }
      }

      if (this.interactive) {
        this._raycastHover();
      }
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (!this.interactive) return;
      const nx = (e.clientX / Math.max(1, this.width)) * 2 - 1;
      const ny = -(e.clientY / Math.max(1, this.height)) * 2 + 1;
      this.pointerNDC.set(nx, ny);

      const hit = this._pickBarrel();
      this.pointerDownInfo = {
        x: e.clientX,
        y: e.clientY,
        time: performance.now(),
        dragged: false,
        barrelIndex: hit ? hit.index : -1,
        point: hit ? hit.point : null,
      };

      if (hit) {
        this._setHovered(hit.index, e.clientX, e.clientY);
      }
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (!this.interactive || !this.pointerDownInfo) return;
      const info = this.pointerDownInfo;
      this.pointerDownInfo = null;

      const elapsed = performance.now() - info.time;
      const isTouch = e.pointerType === 'touch';
      const isListenHold = isTouch && (info.dragged || elapsed > 340);

      if (!isListenHold && info.barrelIndex >= 0 && !info.dragged) {
        this.onStrikeBarrel(info.barrelIndex, info.point);
      }
    });

    this.canvas.addEventListener('pointerleave', () => {
      this.pointerDownInfo = null;
      if (this.hoveredIndex !== -1) this._setHovered(-1);
    });

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });

    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.renderer.setSize(this.width, this.height);
      this._applyResponsiveCameraAndLayout();
    });
  }

  _pickBarrel() {
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitMeshes, false);
    for (const h of hits) {
      const idx = h.object.userData.barrelIndex;
      if (typeof idx === 'number' && idx >= 0 && idx < this.activeBarrelCount && this.barrels[idx]?.group.visible) {
        return { index: idx, point: h.point };
      }
    }
    const proxyHits = this.raycaster.intersectObjects(this.proxyHitMeshes, false);
    for (const h of proxyHits) {
      const idx = h.object.userData.barrelIndex;
      if (typeof idx === 'number' && idx >= 0 && idx < this.activeBarrelCount && this.barrels[idx]?.group.visible) {
        return { index: idx, point: h.point };
      }
    }
    return null;
  }

  projectBarrelScreenPos(index, yOffset = 1.5) {
    const b = this.barrels[index];
    if (!b || !b.group.visible) return { x: -999, y: -999, visible: false };
    const s = b.group.scale.y || 1;
    const v = b.group.position.clone().add(new THREE.Vector3(0, yOffset * s, 0));
    v.project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.width,
      y: (-v.y * 0.5 + 0.5) * this.height,
      visible: v.z < 1,
    };
  }

  _raycastHover() {
    const hit = this._pickBarrel();
    if (!hit) {
      if (this.hoveredIndex !== -1) this._setHovered(-1);
      this.canvas.style.cursor = 'default';
      return;
    }
    const screenPos = this._projectBarrelTop(hit.index);
    this.canvas.style.cursor = this.barrels[hit.index].struck ? 'not-allowed' : 'crosshair';
    this._setHovered(hit.index, screenPos.x, screenPos.y);
  }

  _projectBarrelTop(index) {
    const b = this.barrels[index];
    const v = b.group.position.clone().add(new THREE.Vector3(0, 1.48, 0));
    v.project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.width,
      y: (-v.y * 0.5 + 0.5) * this.height,
    };
  }

  _setHovered(index, sx = 0, sy = 0) {
    if (this.hoveredIndex === index) {
      if (index >= 0) this.onHoverBarrel(index, sx, sy, this.barrels[index].struck);
      return;
    }
    this.hoveredIndex = index;
    this.onHoverBarrel(index, sx, sy, index >= 0 ? this.barrels[index].struck : false);
  }

  _animate() {
    this.rafId = requestAnimationFrame(() => this._animate());
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.contextLost || document.hidden) return;
    const elapsed = this.clock.elapsedTime;

    // 1. Камера или нырок в горловину
    if (this.diving && this.diveTargetIndex >= 0) {
      this.diveProgress = Math.min(1, this.diveProgress + dt * 0.92);
      const ease = 1 - Math.pow(1 - this.diveProgress, 3);
      const bPos = this.barrels[this.diveTargetIndex].group.position;

      const endCam = new THREE.Vector3(bPos.x, 1.98, bPos.z + 0.24);
      const endLook = new THREE.Vector3(bPos.x, 0.52, bPos.z);

      this.camera.position.lerpVectors(this.diveStartPos, endCam, ease);
      this.currentLookAt.lerpVectors(this.diveStartLook, endLook, ease);
      this.camera.lookAt(this.currentLookAt);
    } else {
      this.swayCurrent.lerp(this.swayTarget, dt * 3.8);
      const breathX = Math.sin(elapsed * 0.65) * 0.04;
      const breathY = Math.cos(elapsed * 0.9) * 0.025;

      let sx = 0;
      let sy = 0;
      if (this.shakeIntensity > 0.002) {
        sx = (Math.random() - 0.5) * this.shakeIntensity;
        sy = (Math.random() - 0.5) * this.shakeIntensity;
        this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 1.15);
      }

      this.camera.position.set(
        this.baseCamPos.x + this.swayCurrent.x + breathX + sx,
        this.baseCamPos.y + this.swayCurrent.y + breathY + sy,
        this.baseCamPos.z
      );
      this.currentLookAt.copy(this.baseLookAt);
      this.camera.lookAt(this.currentLookAt);
    }

    this.onCameraMove(this.camera.position);

    // 2. Медленное тяжёлое вращение гигантского чугунного колеса-маховика
    if (this.flywheelGroup) {
      this.flywheelGroup.rotation.z -= dt * 0.16;
    }

    // 2б. Кино-часы на задней стене цеха (тикание / ускорение на таймере / Блиц)
    if (this.wallClockGroup) {
      let speed = 1.0;
      if (this.clockBlitz) {
        speed = 22.0;
      } else if (this.clockAirActive) {
        speed = this.clockAirLeft <= 12 ? 5.0 + (12.0 - this.clockAirLeft) * 0.75 : 5.0;
      }
      this.clockSimSeconds += dt * speed;
      const wholeSec = Math.floor(this.clockSimSeconds);
      const frac = this.clockSimSeconds - wholeSec;
      const secAnglePos = speed <= 1.5 ? wholeSec + Math.pow(frac, 6) : this.clockSimSeconds;

      if (this.clockSecPivot) {
        this.clockSecPivot.rotation.z = -(secAnglePos / 60) * Math.PI * 2;
      }
      if (this.clockMinPivot) {
        this.clockMinPivot.rotation.z = -(this.clockSimSeconds / 3600) * Math.PI * 2;
      }
      if (this.clockHourPivot) {
        this.clockHourPivot.rotation.z = -((this.clockSimSeconds % 43200) / 43200) * Math.PI * 2;
      }
      if (this.clockRimMat) {
        const urgent = this.clockBlitz || (this.clockAirActive && this.clockAirLeft <= 10);
        if (urgent) {
          const pulse = 0.55 + Math.abs(Math.sin(elapsed * 8.0)) * 0.85;
          this.clockRimMat.emissive.setHex(0xb91c1c);
          this.clockRimMat.emissiveIntensity = pulse;
        } else {
          this.clockRimMat.emissive.setHex(0x3a2a14);
          this.clockRimMat.emissiveIntensity = 0.35;
        }
      }
    }

    // 2в. Отец, привязанный к столбу (дыхание, периодическое и ударное дёрганье цепей)
    if (this.fatherPillarGroup?.visible && this.fatherMesh) {
      this.fatherMissJolt = Math.max(0, this.fatherMissJolt - dt * 2.6);
      const breath = 1.0 + Math.sin(elapsed * 2.15) * 0.015;
      this.fatherMesh.scale.y = breath;
      const periodicTug = Math.max(0, Math.sin(elapsed * 1.45) - 0.82) * 0.08;
      const joltAmp = periodicTug + this.fatherMissJolt * 0.055;
      this.fatherMesh.position.x = Math.sin(elapsed * 28.0) * joltAmp;
      this.fatherMesh.rotation.z = Math.sin(elapsed * 19.0) * joltAmp * 0.7;
      if (this.fatherLight) {
        this.fatherLight.intensity = 2.0 + Math.sin(elapsed * 3.1) * 0.25 + this.fatherMissJolt * 1.4;
      }
    }

    // 2г. Идущий Пастор на патруле позади бочек (пошаговая смена поз)
    if (this.pastorWalkerGroup?.visible && this.pastorSprite) {
      const limit = this._isPortraitLayout ? 1.58 : 2.95;
      const walkSpeed = 0.78;
      this.pastorWalkerGroup.position.x += this.pastorWalkDir * walkSpeed * dt;
      if (this.pastorWalkerGroup.position.x > limit) {
        this.pastorWalkerGroup.position.x = limit;
        this.pastorWalkDir = -1;
      } else if (this.pastorWalkerGroup.position.x < -limit) {
        this.pastorWalkerGroup.position.x = -limit;
        this.pastorWalkDir = 1;
      }
      this.pastorWalkPhase += dt * 3.8;
      const frameIdx = Math.floor(this.pastorWalkPhase) % 2;
      const desiredTex = frameIdx === 0 ? this.pastorWalkTex1 : this.pastorWalkTex2;
      if (desiredTex && this.pastorSprite.material.map !== desiredTex) {
        this.pastorSprite.material.map = desiredTex;
        this.pastorSprite.material.needsUpdate = true;
      }
      this.pastorSprite.scale.x = this.pastorWalkDir >= 0 ? 1 : -1;
      this.pastorSprite.position.y = 0.96 + Math.abs(Math.sin(this.pastorWalkPhase * Math.PI)) * 0.032;
    }

    // 3. Физика маятника для висящих ржавых цепей на колоннах
    for (let i = 0; i < this.chains.length; i++) {
      const ch = this.chains[i];
      const spring = -ch.freq * ch.freq;
      const idleDraft = Math.sin(elapsed * 1.1 + i * 1.7) * 0.012;
      ch.velZ += (spring * ch.angleZ) * dt;
      ch.velX += (spring * ch.angleX) * dt;
      ch.velZ *= Math.pow(0.28, dt);
      ch.velX *= Math.pow(0.28, dt);
      ch.angleZ += ch.velZ * dt;
      ch.angleX += ch.velX * dt;
      ch.pivot.rotation.z = ch.angleZ + idleDraft;
      ch.pivot.rotation.x = ch.angleX;
    }

    // 4. Рваный ритм капель воды с потолка и круги на мокром полу
    this.nextDripCountdown -= dt;
    if (this.nextDripCountdown <= 0) {
      this._spawnCeilingDrip();
      this.nextDripCountdown = 0.85 + Math.random() * 2.15;
    }

    for (const d of this.waterDrops) {
      if (!d.active) continue;
      d.vy -= 9.8 * dt;
      d.mesh.position.y += d.vy * dt;
      if (d.mesh.position.y <= 0.03) {
        d.active = false;
        d.mesh.visible = false;
        this._spawnFloorRipple(d.mesh.position.x, d.mesh.position.z);
        if (this.interactive) {
          this.onCeilingDrip(d.mesh.position.x, d.mesh.position.z);
        }
      }
    }

    for (const r of this.floorRipples) {
      if (!r.active) continue;
      r.age += dt;
      const tNorm = r.age / r.duration;
      if (tNorm >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      r.mesh.scale.setScalar(0.5 + tNorm * 5.2);
      r.mesh.material.opacity = (1 - tNorm) * 0.45;
    }

    // 5. Вспышка удара
    if (this.flashIntensity > 0.01) {
      this.flashIntensity = Math.max(0, this.flashIntensity - dt * 42);
      this.strikeLight.intensity = this.flashIntensity;
    } else {
      this.strikeLight.intensity = 0;
    }

    // 6. Бочки и крышки
    for (const b of this.barrels) {
      const curDent = b.dentUniforms.uDentDepth.value;
      if (curDent < b.dentTarget) {
        b.dentUniforms.uDentDepth.value = Math.min(b.dentTarget, curDent + dt * 9.0);
      }

      const targetRingOp = b.index === this.hoveredIndex && this.interactive ? 0.68 : 0.0;
      b.ringMesh.material.opacity += (targetRingOp - b.ringMesh.material.opacity) * Math.min(1, dt * 10);

      if (b.lidFlying) {
        b.lidGroup.position.addScaledVector(b.lidVel, dt);
        b.lidVel.y -= 11.5 * dt;
        b.lidGroup.rotation.x += b.lidSpin.x * dt;
        b.lidGroup.rotation.y += b.lidSpin.y * dt;
        b.lidGroup.rotation.z += b.lidSpin.z * dt;
        if (b.lidGroup.position.y < -1.5) {
          b.lidFlying = false;
          b.lidGroup.visible = false;
        }
      }
    }

    // 7. Частицы искр и ржавой пыли
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.mesh.visible = false;
        continue;
      }
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.y -= 12.0 * dt;
      if (s.mesh.position.y < 0.02) {
        s.mesh.position.y = 0.02;
        s.vel.y *= -0.42;
      }
    }

    for (const p of this.rustPuffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      const norm = 1 - p.life / p.maxLife;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.vel.multiplyScalar(0.95);
      p.mesh.scale.addScalar(dt * 1.45);
      p.mesh.material.opacity = Math.sin(norm * Math.PI) * 0.42;
      p.mesh.lookAt(this.camera.position);
    }

    if (this.dustPoints) {
      this.dustPoints.rotation.y = elapsed * 0.025;
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Облупившаяся серо-зелёная советская кафельная плитка на бетонных колоннах из фильма
   */
  _createPeelingTileColumnTextures() {
    const W = 256;
    const H = 1024;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    const r = document.createElement('canvas');
    r.width = W; r.height = H;
    const rctx = r.getContext('2d');

    const b = document.createElement('canvas');
    b.width = W; b.height = H;
    const bctx = b.getContext('2d');

    // Сырой тёмно-серый бетон под отвалившейся плиткой
    ctx.fillStyle = '#25292c';
    ctx.fillRect(0, 0, W, H);
    rctx.fillStyle = '#dcdcdc';
    rctx.fillRect(0, 0, W, H);
    bctx.fillStyle = '#525252';
    bctx.fillRect(0, 0, W, H);

    const cols = 6;
    const rows = 24;
    const tw = W / cols;
    const th = H / rows;

    let seed = 17;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        // ~24% плиток облупились и отвалились до голого бетона (особенно снизу и по краям)
        const missingChance = gy > 17 ? 0.42 : 0.21;
        if (rand() < missingChance) continue;

        const px = gx * tw + 2;
        const py = gy * th + 2;
        const pw = tw - 4;
        const ph = th - 4;

        // Болотно-серо-зелёная глазурь кафеля с вариацией оттенка
        const shade = Math.floor((rand() - 0.5) * 18);
        const cr = Math.max(40, Math.min(110, 74 + shade));
        const cg = Math.max(55, Math.min(130, 98 + shade));
        const cb = Math.max(50, Math.min(120, 90 + shade));
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fillRect(px, py, pw, ph);

        // Глянцевая глазурь кафеля (низкая шероховатость) и выпуклость плитки
        rctx.fillStyle = '#484848';
        rctx.fillRect(px, py, pw, ph);
        bctx.fillStyle = '#c8c8c8';
        bctx.fillRect(px, py, pw, ph);

        // Трещины и ржавые потёки на отдельных плитках
        if (rand() < 0.32) {
          ctx.strokeStyle = 'rgba(20, 24, 22, 0.65)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(px + 3, py + rand() * ph);
          ctx.lineTo(px + pw - 3, py + rand() * ph);
          ctx.stroke();
        }
      }
    }

    // Ржавые потёки от хомута с цепями вниз по колонне
    const dripGrad = ctx.createLinearGradient(0, H * 0.4, 0, H);
    dripGrad.addColorStop(0, 'rgba(92, 42, 16, 0.45)');
    dripGrad.addColorStop(1, 'rgba(18, 22, 20, 0.55)');
    ctx.fillStyle = dripGrad;
    ctx.fillRect(W * 0.25, H * 0.42, 24, H * 0.55);

    const color = new THREE.CanvasTexture(c);
    color.colorSpace = THREE.SRGBColorSpace;
    const roughness = new THREE.CanvasTexture(r);
    const bump = new THREE.CanvasTexture(b);
    return { color, roughness, bump };
  }

  _createIndustrialWindowTexture() {
    const W = 256;
    const H = 128;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3b5875');
    g.addColorStop(0.55, '#25394d');
    g.addColorStop(1, '#141e29');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Мутные заводские стеклоблоки в копоти
    ctx.strokeStyle = 'rgba(10, 14, 18, 0.85)';
    ctx.lineWidth = 4;
    for (let x = 32; x < W; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, H * 0.5); ctx.lineTo(W, H * 0.5);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _createRadialFogGlowTexture() {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(S * 0.5, S * 0.5, 8, S * 0.5, S * 0.5, S * 0.5);
    g.addColorStop(0, 'rgba(125, 178, 224, 0.55)');
    g.addColorStop(0.45, 'rgba(72, 110, 145, 0.18)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  }

  _createSoftSmokeSpriteTexture() {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  }

  _createBarrelPBRTextures(batchCode, num = 1) {
    const W = 512;
    const H = 512;
    const cCol = document.createElement('canvas');
    cCol.width = W; cCol.height = H;
    const ctx = cCol.getContext('2d');

    const cRough = document.createElement('canvas');
    cRough.width = W; cRough.height = H;
    const rctx = cRough.getContext('2d');

    const cBump = document.createElement('canvas');
    cBump.width = W; cBump.height = H;
    const bctx = cBump.getContext('2d');

    ctx.fillStyle = '#262b31';
    ctx.fillRect(0, 0, W, H);
    rctx.fillStyle = '#747474';
    rctx.fillRect(0, 0, W, H);
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 42; i++) {
      const rx = ((i * 97 + num * 53) % W);
      const ry = ((i * 71 + num * 29) % H);
      const rw = 22 + (i % 5) * 16;
      const rh = 35 + (i % 7) * 24;

      ctx.fillStyle = i % 2 === 0 ? 'rgba(138, 62, 24, 0.42)' : 'rgba(84, 41, 18, 0.36)';
      ctx.beginPath();
      ctx.ellipse(rx, ry, rw, rh, 0.2, 0, Math.PI * 2);
      ctx.fill();

      rctx.fillStyle = 'rgba(235, 235, 235, 0.45)';
      ctx.beginPath();
      rctx.beginPath();
      rctx.ellipse(rx, ry, rw, rh, 0.2, 0, Math.PI * 2);
      rctx.fill();

      bctx.fillStyle = 'rgba(195, 195, 195, 0.35)';
      bctx.fillRect(rx - rw * 0.4, ry - 2, rw * 0.8, 4);
    }

    for (let s = 0; s < 14; s++) {
      const sx = ((s * 37 + num * 41) % W);
      rctx.fillStyle = 'rgba(32, 32, 32, 0.55)';
      rctx.fillRect(sx, 0, 5 + (s % 4) * 3, 180 + (s % 5) * 60);
    }

    ctx.fillStyle = 'rgba(165, 175, 185, 0.16)';
    ctx.fillRect(0, H * 0.32, W, 6);
    ctx.fillRect(0, H * 0.66, W, 6);

    // Потёртый заводской трафарет номера партии (01, 12, 17, 19, 26, 97)
    ctx.save();
    ctx.fillStyle = 'rgba(15, 18, 22, 0.42)';
    ctx.fillRect(W * 0.34, H * 0.37, W * 0.32, H * 0.21);
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.34)';
    ctx.lineWidth = 2;
    ctx.strokeRect(W * 0.34, H * 0.37, W * 0.32, H * 0.21);

    ctx.fillStyle = 'rgba(234, 179, 8, 0.86)';
    ctx.font = '900 72px Impact, "Arial Black", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(batchCode), W * 0.5, H * 0.505);

    // Горизонтальная перемычка настоящего металлического трафарета + потёртости
    ctx.fillStyle = '#262b31';
    ctx.fillRect(W * 0.36, H * 0.448, W * 0.28, 3.5);

    ctx.font = '700 15px monospace';
    ctx.fillStyle = 'rgba(214, 185, 130, 0.56)';
    ctx.fillText(`ПАРТИЯ // ${batchCode}`, W * 0.5, H * 0.556);
    ctx.restore();

    const color = new THREE.CanvasTexture(cCol);
    color.colorSpace = THREE.SRGBColorSpace;
    const roughness = new THREE.CanvasTexture(cRough);
    const bump = new THREE.CanvasTexture(cBump);

    return { color, roughness, bump };
  }

  _createWetConcreteTextures() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const ctx = c.getContext('2d');

    const r = document.createElement('canvas');
    r.width = S; r.height = S;
    const rctx = r.getContext('2d');

    ctx.fillStyle = '#111214';
    ctx.fillRect(0, 0, S, S);
    rctx.fillStyle = '#b8b8b8';
    rctx.fillRect(0, 0, S, S);

    for (let i = 0; i < 22; i++) {
      const x = (i * 89 + 48) % S;
      const y = (i * 137 + 64) % S;
      const rad = 42 + (i % 5) * 28;

      const rg = rctx.createRadialGradient(x, y, rad * 0.1, x, y, rad);
      rg.addColorStop(0, 'rgba(28, 28, 28, 0.72)');
      rg.addColorStop(0.58, 'rgba(65, 65, 65, 0.35)');
      rg.addColorStop(1, 'rgba(184, 184, 184, 0)');
      rctx.fillStyle = rg;
      rctx.beginPath();
      rctx.arc(x, y, rad, 0, Math.PI * 2);
      rctx.fill();

      const cg = ctx.createRadialGradient(x, y, rad * 0.1, x, y, rad);
      cg.addColorStop(0, 'rgba(7, 9, 11, 0.42)');
      cg.addColorStop(1, 'rgba(17, 18, 20, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    for (let g = 128; g < S; g += 128) {
      ctx.beginPath();
      ctx.moveTo(g, 0); ctx.lineTo(g, S);
      ctx.moveTo(0, g); ctx.lineTo(S, g);
      ctx.stroke();
    }

    const color = new THREE.CanvasTexture(c);
    color.colorSpace = THREE.SRGBColorSpace;
    color.wrapS = color.wrapT = THREE.RepeatWrapping;
    color.repeat.set(4, 4);

    const roughness = new THREE.CanvasTexture(r);
    roughness.wrapS = roughness.wrapT = THREE.RepeatWrapping;
    roughness.repeat.set(4, 4);

    return { color, roughness };
  }

  _buildFilmWallClock() {
    const loader = new THREE.TextureLoader();
    const dialTex = loader.load(resolveSiteAsset('public/sprites/film_clock.webp'));
    dialTex.colorSpace = THREE.SRGBColorSpace;
    dialTex.anisotropy = 4;

    const grp = new THREE.Group();
    grp.name = 'filmWallClock';

    // Металлическая рама-кожух и консоль крепления к бетонной стене
    const bracketMat = new THREE.MeshStandardMaterial({
      color: 0x1c1e22,
      roughness: 0.78,
      metalness: 0.55,
    });
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.28), bracketMat);
    bracket.position.set(0, 0.02, -0.14);
    grp.add(bracket);

    const caseMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.43, 0.11, 32), bracketMat);
    caseMesh.rotation.x = Math.PI * 0.5;
    caseMesh.position.z = -0.02;
    grp.add(caseMesh);

    this.clockRimMat = new THREE.MeshStandardMaterial({
      color: 0x524534,
      roughness: 0.45,
      metalness: 0.72,
      emissive: new THREE.Color(0x3a2a14),
      emissiveIntensity: 0.35,
    });
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.028, 12, 36), this.clockRimMat);
    bezel.position.z = 0.038;
    grp.add(bezel);

    // Циферблат с ретроспективно выровненным спрайтом из кадра фильма
    const dialMat = new THREE.MeshStandardMaterial({
      map: dialTex,
      transparent: true,
      alphaTest: 0.1,
      roughness: 0.65,
      metalness: 0.08,
      emissive: new THREE.Color(0xd8c8a8),
      emissiveMap: dialTex,
      emissiveIntensity: 0.28,
    });
    const dialMesh = new THREE.Mesh(new THREE.CircleGeometry(0.39, 32), dialMat);
    dialMesh.position.z = 0.042;
    grp.add(dialMesh);

    // Стрелки: часовая, минутная, секундная (вращаются вокруг -Z в плоскости циферблата)
    const darkHandMat = new THREE.MeshBasicMaterial({ color: 0x141210 });
    const secHandMat = new THREE.MeshBasicMaterial({ color: 0xb91c1c });

    this.clockHourPivot = new THREE.Group();
    this.clockHourPivot.position.z = 0.048;
    const hrMesh = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.19, 0.008), darkHandMat);
    hrMesh.position.y = 0.085;
    this.clockHourPivot.add(hrMesh);
    grp.add(this.clockHourPivot);

    this.clockMinPivot = new THREE.Group();
    this.clockMinPivot.position.z = 0.053;
    const minMesh = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.275, 0.008), darkHandMat);
    minMesh.position.y = 0.128;
    this.clockMinPivot.add(minMesh);
    grp.add(this.clockMinPivot);

    this.clockSecPivot = new THREE.Group();
    this.clockSecPivot.position.z = 0.058;
    const secMesh = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.305, 0.006), secHandMat);
    secMesh.position.y = 0.115;
    this.clockSecPivot.add(secMesh);
    grp.add(this.clockSecPivot);

    const centerPin = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.018, 16), darkHandMat);
    centerPin.rotation.x = Math.PI * 0.5;
    centerPin.position.z = 0.062;
    grp.add(centerPin);

    grp.position.set(2.10, 2.18, -2.72);
    grp.scale.setScalar(1.12);
    this.wallClockGroup = grp;
    this.scene.add(grp);
  }

  _buildFilmCharacters() {
    const loader = new THREE.TextureLoader();

    // 1. Отец (Филипп Рейнхардт), привязанный цепями к бетонной опоре (Ур. 2, 3, 6, 7, 10)
    const fatherGroup = new THREE.Group();
    fatherGroup.name = 'fatherPillar';

    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x3b3833,
      roughness: 0.92,
      metalness: 0.08,
    });
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.36, 3.8, 0.36), pillarMat);
    pillar.position.set(0, 1.9, -0.16);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    fatherGroup.add(pillar);

    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x2a241d, roughness: 0.85, metalness: 0.45 });
    for (const yOff of [0.92, 1.24]) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.022, 8, 20), ropeMat);
      collar.rotation.x = Math.PI * 0.46;
      collar.position.set(0, yOff, -0.04);
      fatherGroup.add(collar);
    }

    const fatherTex = loader.load(resolveSiteAsset('public/sprites/father_pillar.webp'));
    fatherTex.colorSpace = THREE.SRGBColorSpace;
    this.fatherSpriteMat = new THREE.MeshStandardMaterial({
      map: fatherTex,
      transparent: true,
      alphaTest: 0.08,
      roughness: 0.85,
      metalness: 0.04,
      emissive: new THREE.Color(0x241d15),
      emissiveMap: fatherTex,
      emissiveIntensity: 0.38,
      side: THREE.DoubleSide,
    });
    const fatherPlane = new THREE.PlaneGeometry(1.38, 1.96);
    this.fatherMesh = new THREE.Mesh(fatherPlane, this.fatherSpriteMat);
    this.fatherMesh.position.set(0, 0.98, 0.08);
    fatherGroup.add(this.fatherMesh);

    this.fatherLight = new THREE.PointLight(0xfbbf24, 2.0, 4.4, 2);
    this.fatherLight.position.set(0.18, 1.65, 0.55);
    fatherGroup.add(this.fatherLight);

    fatherGroup.position.set(-1.42, 0, -2.48);
    fatherGroup.visible = false;
    this.fatherPillarGroup = fatherGroup;
    this.scene.add(fatherGroup);

    // 2. Идущий Пастор (Тиль Швайгер) позади бочек (Ур. 4, 5, 6, 8, 9, 10)
    const pastorGroup = new THREE.Group();
    pastorGroup.name = 'pastorWalker';

    this.pastorWalkTex1 = loader.load(resolveSiteAsset('public/sprites/pastor_walk_1.webp'));
    this.pastorWalkTex1.colorSpace = THREE.SRGBColorSpace;
    this.pastorWalkTex2 = loader.load(resolveSiteAsset('public/sprites/pastor_walk_2.webp'));
    this.pastorWalkTex2.colorSpace = THREE.SRGBColorSpace;

    const pastorMat = new THREE.MeshStandardMaterial({
      map: this.pastorWalkTex1,
      transparent: true,
      alphaTest: 0.08,
      roughness: 0.84,
      metalness: 0.05,
      emissive: new THREE.Color(0x282118),
      emissiveMap: this.pastorWalkTex1,
      emissiveIntensity: 0.42,
      side: THREE.DoubleSide,
    });
    this.pastorSprite = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 1.92), pastorMat);
    this.pastorSprite.position.set(0, 0.96, 0);
    pastorGroup.add(this.pastorSprite);

    pastorGroup.position.set(-1.2, 0, -2.05);
    pastorGroup.visible = false;
    this.pastorWalkerGroup = pastorGroup;
    this.scene.add(pastorGroup);
  }

  setClockUrgency({ airActive = false, airLeft = 30, isBlitz = false } = {}) {
    this.clockAirActive = Boolean(airActive);
    this.clockAirLeft = Number(airLeft) || 0;
    this.clockBlitz = Boolean(isBlitz);
  }

  setWorkshopLevelDecor(level = 1, modeType = 'solo') {
    this.activeLevel = Number(level) || 1;
    const lv = this.activeLevel;
    const isFatherLvl = modeType !== 'viral' && [2, 3, 6, 7, 10].includes(lv);
    const isPastorLvl = modeType !== 'viral' && [4, 5, 6, 8, 9, 10].includes(lv);

    if (this.wallClockGroup) this.wallClockGroup.visible = true;
    if (this.fatherPillarGroup) this.fatherPillarGroup.visible = isFatherLvl;
    if (this.pastorWalkerGroup) this.pastorWalkerGroup.visible = isPastorLvl;
    this._applyResponsiveCameraAndLayout();
  }

  triggerCharacterMissReaction() {
    if (this.fatherPillarGroup?.visible) {
      this.fatherMissJolt = 1.0;
    }
  }

  getMinBarrelTopY() {
    if (!this.renderer?.domElement || !this.camera) return 260;
    const rect = this.renderer.domElement.getBoundingClientRect();
    let minTopY = rect.height * 0.72;
    const positions = this.getBarrelWorldPositions();
    for (const pos of positions) {
      this._projVec.set(pos.x, pos.y + 1.08, pos.z);
      this._projVec.project(this.camera);
      const sy = ((1 - this._projVec.y) * 0.5) * rect.height;
      if (Number.isFinite(sy)) {
        minTopY = Math.min(minTopY, sy);
      }
    }
    return minTopY;
  }

  projectFatherBubblePos() {
    if (!this.fatherPillarGroup?.visible || !this.renderer?.domElement || !this.camera) {
      return { visible: false, x: 0, y: 0 };
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    const p = this.fatherPillarGroup.position;
    const sc = this.fatherPillarGroup.scale.y || 1;
    this._projVec.set(p.x, p.y + 2.08 * sc, p.z + 0.08);
    this._projVec.project(this.camera);
    return {
      visible: this._projVec.z < 1,
      x: ((this._projVec.x + 1) * 0.5) * rect.width,
      y: ((1 - this._projVec.y) * 0.5) * rect.height,
    };
  }

  _createBackWallWindowShadowTexture() {
    const W = 1024;
    const H = 512;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Тёплый угольный бетон / кирпичная кладка цеха (тон кадров фильма)
    const wallGrad = ctx.createLinearGradient(0, 0, 0, H);
    wallGrad.addColorStop(0, '#181410');
    wallGrad.addColorStop(0.55, '#12100d');
    wallGrad.addColorStop(1, '#0b0907');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, W, H);

    // Пятна сырости и подтёки ржавчины на стене
    for (let i = 0; i < 42; i++) {
      const rx = (i * 197) % W;
      const ry = (i * 89) % (H * 0.65);
      const rw = 24 + (i % 5) * 18;
      const rh = 90 + (i % 7) * 32;
      const drip = ctx.createLinearGradient(rx, ry, rx, ry + rh);
      drip.addColorStop(0, 'rgba(68, 46, 26, 0.14)');
      drip.addColorStop(1, 'rgba(12, 10, 8, 0)');
      ctx.fillStyle = drip;
      ctx.fillRect(rx, ry, rw, rh);
    }

    // Двухъярусные запылённые заводские окна с контрастным переплётом
    for (const wx of [135, 370, 610, 845]) {
      const wg = ctx.createLinearGradient(wx, 24, wx, 240);
      wg.addColorStop(0, 'rgba(130, 168, 194, 0.17)');
      wg.addColorStop(1, 'rgba(72, 92, 104, 0.05)');
      ctx.fillStyle = wg;
      ctx.fillRect(wx, 28, 118, 198);
      ctx.strokeStyle = 'rgba(18, 16, 14, 0.88)';
      ctx.lineWidth = 7;
      ctx.strokeRect(wx, 28, 118, 198);
      ctx.beginPath();
      ctx.moveTo(wx + 59, 28); ctx.lineTo(wx + 59, 226);
      ctx.moveTo(wx, 127); ctx.lineTo(wx + 118, 127);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(234, 179, 8, 0.11)';
    ctx.font = '900 44px Impact, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ЦЕХ · КОРПУС Б — СЕКТОР 04', W * 0.5, H * 0.74);

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _createDefaultPortraitTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 115, 16, 128, 128, 128);
    g.addColorStop(0, '#2c3e50');
    g.addColorStop(1, '#07090b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}
