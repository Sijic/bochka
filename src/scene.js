import * as THREE from 'three';

export class WorkshopScene {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas;
    this.onHoverBarrel = callbacks.onHoverBarrel || (() => {});
    this.onStrikeBarrel = callbacks.onStrikeBarrel || (() => {});
    this.onCameraMove = callbacks.onCameraMove || (() => {});

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
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0b0c);
    this.scene.fog = new THREE.FogExp2(0x0b0b0c, 0.088);

    this.camera = new THREE.PerspectiveCamera(45, this.width / Math.max(1, this.height), 0.1, 35);
    this.baseCamPos = new THREE.Vector3(0, 2.25, 6.1);
    this.baseLookAt = new THREE.Vector3(0, 0.72, -0.45);
    this.currentLookAt = this.baseLookAt.clone();

    this.pointerNDC = new THREE.Vector2(-99, -99);
    this.swayTarget = new THREE.Vector2(0, 0);
    this.swayCurrent = new THREE.Vector2(0, 0);

    this.raycaster = new THREE.Raycaster();
    this.barrels = [];
    this.hitMeshes = [];
    this.hoveredIndex = -1;
    this.interactive = false;
    this.diving = false;
    this.diveProgress = 0;
    this.diveTargetIndex = -1;
    this.diveStartPos = new THREE.Vector3();
    this.diveStartLook = new THREE.Vector3();

    this.shakeIntensity = 0;
    this.flashIntensity = 0;
    this.sparks = [];
    this.clock = new THREE.Clock();
    this.rafId = 0;

    // Тактильное различение удержания (прослушка) и короткого тапа (удар)
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

  resetRound({ targetIndex = 0, portraitUrl = '' } = {}) {
    this.diving = false;
    this.diveProgress = 0;
    this.diveTargetIndex = targetIndex;
    this.shakeIntensity = 0;
    this.interiorSpot.intensity = 0;

    this.barrels.forEach((b, idx) => {
      b.struck = false;
      b.dentUniforms.uDentDepth.value = 0;
      b.lidGroup.visible = true;
      b.lidGroup.position.set(0, 1.355, 0);
      b.lidGroup.rotation.set(0, idx * 0.9, 0);
      b.lidVel.set(0, 0, 0);
      b.lidSpin.set(0, 0, 0);
      b.lidFlying = false;
      b.ringMesh.material.opacity = 0;
      b.portraitMesh.visible = idx === targetIndex;
    });

    if (portraitUrl) {
      this.setTargetPortrait(targetIndex, portraitUrl);
    }
    this._applyResponsiveCameraAndLayout();
  }

  setTargetPortrait(targetIndex, portraitUrl) {
    this.diveTargetIndex = targetIndex;
    if (!portraitUrl) return;
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      portraitUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        this.barrels.forEach((b, idx) => {
          b.portraitMesh.visible = idx === targetIndex;
          if (idx === targetIndex) {
            b.portraitMat.map = tex;
            b.portraitMat.needsUpdate = true;
          }
        });
      },
      undefined,
      () => { /* fallback texture remains */ }
    );
  }

  getBarrelWorldPositions() {
    return this.barrels.map((b) => b.group.position.clone());
  }

  /**
   * Запускает удар по бочке: вспышка, встряска камеры, шейдерная вмятина и искры
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

    this._spawnSparks(hitWorld, 26);
  }

  /**
   * Срыв стальной крышки и нырок камеры внутрь загаданной бочки к круглому портрету
   */
  triggerRevealDive(targetIndex) {
    const b = this.barrels[targetIndex];
    if (!b) return;
    this.interactive = false;
    this._setHovered(-1);

    b.lidFlying = true;
    b.lidVel.set((Math.random() - 0.5) * 1.8, 4.6, -2.4);
    b.lidSpin.set(-6.5, (Math.random() - 0.5) * 4, 3.2);

    this.shakeIntensity = 0.28;
    const rimWorld = b.group.position.clone().add(new THREE.Vector3(0, 1.38, 0));
    this._spawnSparks(rimWorld, 34);

    // Включаем холодный луч фонаря прямо внутрь открытой бочки
    this.interiorSpot.position.set(b.group.position.x + 0.12, 3.2, b.group.position.z + 0.18);
    this.interiorSpot.target.position.set(b.group.position.x, 0.35, b.group.position.z);
    this.interiorSpot.target.updateMatrixWorld();
    this.interiorSpot.intensity = 14;

    this.diving = true;
    this.diveProgress = 0;
    this.diveTargetIndex = targetIndex;
    this.diveStartPos.copy(this.camera.position);
    this.diveStartLook.copy(this.currentLookAt);
  }

  _buildLighting() {
    // Процедурная индустриальная карта отражений (PMREM) для реалистичного блеска рёбер жёсткости стали
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x14171b);

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

    const hemi = new THREE.HemisphereLight(0xb0c4de, 0x24180e, 0.68);
    this.scene.add(hemi);

    // Главный верхний цеховой прожектор (яркое пятно на мокром бетонном полу)
    this.mainSpot = new THREE.SpotLight(0xffe0a3, 72, 22, Math.PI * 0.38, 0.58, 1.22);
    this.mainSpot.position.set(0, 6.6, 1.35);
    this.mainSpot.target.position.set(0, 0.1, -0.55);
    this.mainSpot.castShadow = true;
    this.mainSpot.shadow.mapSize.set(1024, 1024);
    this.mainSpot.shadow.bias = -0.0005;
    this.scene.add(this.mainSpot, this.mainSpot.target);

    // Мягкий фронтальный заполняющий свет, чтобы рельеф и трафарет бочек читались на любом экране
    const frontKey = new THREE.DirectionalLight(0xdbe6f2, 1.05);
    frontKey.position.set(0.4, 2.6, 5.4);
    this.scene.add(frontKey);

    // Холодный контровой свет слева сзади (подчёркивает стальные рёбра жёсткости)
    const rimLight = new THREE.DirectionalLight(0x6c9ac4, 1.75);
    rimLight.position.set(-3.8, 3.6, -2.8);
    this.scene.add(rimLight);

    // Тёплый ржавый отсвет справа
    const warmFill = new THREE.PointLight(0xea580c, 3.4, 10);
    warmFill.position.set(3.4, 1.6, 1.8);
    this.scene.add(warmFill);

    // Вспышка при ударе металлом
    this.strikeLight = new THREE.PointLight(0xffb732, 0, 6.5);
    this.scene.add(this.strikeLight);

    // Луч фонаря для нырка внутрь вскрытой бочки
    this.interiorSpot = new THREE.SpotLight(0xdbeafe, 0, 6, Math.PI * 0.22, 0.45, 1.1);
    this.scene.add(this.interiorSpot, this.interiorSpot.target);
  }

  _buildEnvironment() {
    // 1. Мокрый бетонный пол с лужами под пятном прожектора
    const floorMaps = this._createWetConcreteTextures();
    const floorGeo = new THREE.PlaneGeometry(22, 18);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorMaps.color,
      roughnessMap: floorMaps.roughness,
      bumpMap: floorMaps.roughness,
      bumpScale: 0.018,
      metalness: 0.18,
      roughness: 0.65,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI * 0.5;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 2. Задняя заводская стена с геометрическими тенями от заводских окон
    const wallTex = this._createBackWallWindowShadowTexture();
    const wallGeo = new THREE.PlaneGeometry(18, 8.5);
    const wallMat = new THREE.MeshStandardMaterial({
      map: wallTex,
      emissiveMap: wallTex,
      emissive: new THREE.Color(0xfff1d0),
      emissiveIntensity: 0.55,
      roughness: 0.92,
      metalness: 0.05,
    });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 3.1, -3.65);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    // 3. Едва заметный объёмный конус прожекторного луча в пыльном воздухе
    const coneGeo = new THREE.ConeGeometry(4.2, 6.6, 32, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.028,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const lightCone = new THREE.Mesh(coneGeo, coneMat);
    lightCone.position.set(0, 3.25, -0.25);
    this.scene.add(lightCone);
  }

  _buildBarrels() {
    // Профиль стальной 200-литровой бочки (LatheGeometry с рёбрами жёсткости и полой внутренностью!)
    const pts = [
      new THREE.Vector2(0.001, 0.02),
      new THREE.Vector2(0.425, 0.02),
      new THREE.Vector2(0.445, 0.035), // нижний закатной обод
      new THREE.Vector2(0.422, 0.06),
      new THREE.Vector2(0.422, 0.41),
      new THREE.Vector2(0.448, 0.445), // нижнее ребро жёсткости
      new THREE.Vector2(0.422, 0.48),
      new THREE.Vector2(0.422, 0.89),
      new THREE.Vector2(0.448, 0.925), // верхнее ребро жёсткости
      new THREE.Vector2(0.422, 0.96),
      new THREE.Vector2(0.422, 1.33),
      new THREE.Vector2(0.448, 1.355), // верхний стальной кант горловины
      new THREE.Vector2(0.405, 1.375),
      new THREE.Vector2(0.392, 1.35),  // уход внутрь полой бочки
      new THREE.Vector2(0.390, 0.22),
      new THREE.Vector2(0.001, 0.22),
    ];
    const sharedBodyGeo = new THREE.LatheGeometry(pts, 44);
    // Линейная развёртка UV по высоте бочки, чтобы трафарет 01..06 не попадал в складку ребра жёсткости
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

    const portraitGeo = new THREE.CircleGeometry(0.365, 40);
    portraitGeo.rotateX(-Math.PI * 0.5);

    const defaultPortraitTex = this._createDefaultPortraitTexture();

    for (let i = 0; i < 6; i++) {
      const group = new THREE.Group();
      const maps = this._createBarrelPBRTextures(i + 1);

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

      // Шейдерная деформация металла (вмятина от удара в точке попадания)
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

      // Съёмная заваренная крышка с горловинами
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

      // Круглый портрет на дне бочки (открывается, когда срывает крышку)
      const portraitMat = new THREE.MeshBasicMaterial({
        map: defaultPortraitTex,
      });
      const portraitMesh = new THREE.Mesh(portraitGeo, portraitMat);
      portraitMesh.position.set(0, 0.56, 0);
      portraitMesh.visible = false;
      group.add(portraitMesh);

      // Тонкий технический индикатор прослушки на мокром полу под бочкой
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xeab308,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.012;
      group.add(ringMesh);

      this.scene.add(group);
      this.hitMeshes.push(bodyMesh, lidPlate);

      this.barrels.push({
        index: i,
        group,
        bodyMesh,
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
    // 1. Мелкая цеховая пыль в луче прожектора
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
      opacity: 0.32,
      depthWrite: false,
    });
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dustPoints);

    // 2. Пул искр для удара металлом по бочке
    const sparkGeo = new THREE.SphereGeometry(0.018, 4, 4);
    const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc83d });
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(sparkGeo, sparkMat);
      m.visible = false;
      this.scene.add(m);
      this.sparks.push({
        mesh: m,
        vel: new THREE.Vector3(),
        life: 0,
      });
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

  _applyResponsiveCameraAndLayout() {
    const aspect = this.width / Math.max(1, this.height);
    this.isPortrait = aspect < 0.88;

    if (this.isPortrait) {
      // Компактный двухуровневый полукруг для смартфонов: все 6 бочек крупные и полностью в кадре
      const mobileCoords = [
        [-1.16, -1.35],
        [0.0, -1.72],
        [1.16, -1.35],
        [-1.24, 0.02],
        [0.0, 0.36],
        [1.24, 0.02],
      ];
      this.barrels.forEach((b, idx) => {
        const [x, z] = mobileCoords[idx];
        b.group.position.set(x, 0, z);
        b.bodyMesh.rotation.y = Math.PI - x * 0.22;
      });

      this.camera.fov = 50;
      const distScale = Math.max(1, 0.52 / Math.max(0.36, aspect));
      this.baseCamPos.set(0, 3.25 * distScale, 5.75 * distScale);
      this.baseLookAt.set(0, 0.62, -0.58);
    } else {
      // Широкий классический полукруг из 6 бочек в пятне верхнего света для десктопа/планшета
      const angles = [-1.16, -0.70, -0.23, 0.23, 0.70, 1.16];
      const radius = 3.08;
      const centerZ = 1.38;
      this.barrels.forEach((b, idx) => {
        const a = angles[idx];
        const x = Math.sin(a) * radius;
        const z = centerZ - Math.cos(a) * radius;
        b.group.position.set(x, 0, z);
        b.bodyMesh.rotation.y = Math.PI - a * 0.65;
      });

      this.camera.fov = 42;
      const wideAdjust = aspect < 1.35 ? 1.14 : 1.0;
      this.baseCamPos.set(0, 2.15 * wideAdjust, 5.85 * wideAdjust);
      this.baseLookAt.set(0, 0.74, -0.55);
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

    // Гироскоп смартфона для живого параллакса камеры
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
      // На тач-экране длительное удержание (> 320 мс) или скольжение пальцем — это прослушивание,
      // а чёткий короткий тап/клик — удар вскрытия бочки!
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
  }

  _pickBarrel() {
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const hits = this.raycaster.intersectObjects(this.hitMeshes, false);
    if (!hits.length) return null;
    const idx = hits[0].object.userData.barrelIndex;
    if (typeof idx !== 'number') return null;
    return { index: idx, point: hits[0].point };
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
    const elapsed = this.clock.elapsedTime;

    // 1. Плавное покачивание камеры (мышь / гироскоп / дыхание) или нырок в горловину бочки
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

    // 2. Вспышка удара
    if (this.flashIntensity > 0.01) {
      this.flashIntensity = Math.max(0, this.flashIntensity - dt * 42);
      this.strikeLight.intensity = this.flashIntensity;
    } else {
      this.strikeLight.intensity = 0;
    }

    // 3. Анимация вмятин, подсветки выбранной бочки и отлетающей стальной крышки
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

    // 4. Частицы искр и пыли
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

    if (this.dustPoints) {
      this.dustPoints.rotation.y = elapsed * 0.025;
    }

    this.renderer.render(this.scene, this.camera);
  }

  _createBarrelPBRTextures(num) {
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

    // Тёмная оружейная сталь
    ctx.fillStyle = '#262b31';
    ctx.fillRect(0, 0, W, H);
    rctx.fillStyle = '#747474';
    rctx.fillRect(0, 0, W, H);
    bctx.fillStyle = '#808080';
    bctx.fillRect(0, 0, W, H);

    // Потёртые полосы и ржавые подтёки
    for (let i = 0; i < 42; i++) {
      const rx = ((i * 97 + num * 53) % W);
      const ry = ((i * 71 + num * 29) % H);
      const rw = 22 + (i % 5) * 16;
      const rh = 35 + (i % 7) * 24;

      ctx.fillStyle = i % 2 === 0 ? 'rgba(138, 62, 24, 0.42)' : 'rgba(84, 41, 18, 0.36)';
      ctx.beginPath();
      ctx.ellipse(rx, ry, rw, rh, 0.2, 0, Math.PI * 2);
      ctx.fill();

      // Ржавчина более матовая (белее в карте roughness)
      rctx.fillStyle = 'rgba(235, 235, 235, 0.45)';
      rctx.beginPath();
      rctx.ellipse(rx, ry, rw, rh, 0.2, 0, Math.PI * 2);
      rctx.fill();

      bctx.fillStyle = 'rgba(195, 195, 195, 0.35)';
      bctx.fillRect(rx - rw * 0.4, ry - 2, rw * 0.8, 4);
    }

    // Мокрые масляные потёки сверху вниз (низкая шероховатость = мокрый блеск)
    for (let s = 0; s < 14; s++) {
      const sx = ((s * 37 + num * 41) % W);
      rctx.fillStyle = 'rgba(32, 32, 32, 0.55)';
      rctx.fillRect(sx, 0, 5 + (s % 4) * 3, 180 + (s % 5) * 60);
    }

    // Царапины на рёбрах жёсткости
    ctx.fillStyle = 'rgba(165, 175, 185, 0.16)';
    ctx.fillRect(0, H * 0.32, W, 6);
    ctx.fillRect(0, H * 0.66, W, 6);

    // Трафаретный индустриальный номер бочки (01 .. 06) ровно между рёбрами жёсткости
    ctx.save();
    ctx.fillStyle = 'rgba(234, 179, 8, 0.72)';
    ctx.font = '900 58px Impact, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`0${num}`, W * 0.5, H * 0.49);
    ctx.font = '700 16px monospace';
    ctx.fillStyle = 'rgba(214, 185, 130, 0.52)';
    ctx.fillText('200L // B-04', W * 0.5, H * 0.55);
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

    // Пятна сырой воды на бетонном полу (тёмные в roughness -> зеркалят прожектор)
    for (let i = 0; i < 24; i++) {
      const x = (i * 89 + 40) % S;
      const y = (i * 137 + 60) % S;
      const rad = 32 + (i % 5) * 22;
      rctx.fillStyle = 'rgba(24, 24, 24, 0.68)';
      rctx.beginPath();
      rctx.ellipse(x, y, rad * 1.3, rad * 0.85, i * 0.4, 0, Math.PI * 2);
      rctx.fill();

      ctx.fillStyle = 'rgba(8, 9, 11, 0.45)';
      ctx.beginPath();
      ctx.ellipse(x, y, rad * 1.2, rad * 0.8, i * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Швы бетонных плит
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

  _createBackWallWindowShadowTexture() {
    const W = 1024;
    const H = 512;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#0d0e10';
    ctx.fillRect(0, 0, W, H);

    // Косые геометрические светотени от высоких заводских окон на задней стене
    ctx.save();
    ctx.translate(W * 0.52, H * 0.46);
    ctx.transform(1, -0.09, -0.28, 1, 0, 0);

    for (let wx = -2; wx <= 1; wx++) {
      for (let wy = -1; wy <= 0; wy++) {
        const px = wx * 148 + 14;
        const py = wy * 126 + 10;
        const grad = ctx.createLinearGradient(px, py, px, py + 106);
        grad.addColorStop(0, 'rgba(234, 196, 118, 0.19)');
        grad.addColorStop(1, 'rgba(180, 145, 85, 0.06)');
        ctx.fillStyle = grad;
        ctx.fillRect(px, py, 124, 104);
      }
    }
    ctx.restore();

    // Выцветшая индустриальная маркировка цеха
    ctx.fillStyle = 'rgba(234, 179, 8, 0.12)';
    ctx.font = '900 44px Impact, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ЦЕХ · КОРПУС Б — СЕКТОР 04', W * 0.5, H * 0.62);

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
