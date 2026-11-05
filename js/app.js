/**
 * Activación Interactiva - Proyección & Post-its
 * Controlador Principal (App)
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Elementos del DOM
  const projectionCanvas = document.getElementById('projectionCanvas');
  const effectsCanvas = document.getElementById('effectsCanvas');
  const webcamVideo = document.getElementById('webcamVideo');
  const cameraFeedCanvas = document.getElementById('cameraFeedCanvas');
  const calibrationCanvas = document.getElementById('calibrationCanvas');

  const configPanel = document.getElementById('configPanel');
  const floatingMenuBtn = document.getElementById('floatingMenuBtn');
  const closePanelBtn = document.getElementById('closePanelBtn');
  const fullscreenBtn = document.getElementById('fullscreenBtn');

  const welcomeOverlay = document.getElementById('welcomeOverlay');
  const startCameraBtn = document.getElementById('startCameraBtn');
  const demoModeBtn = document.getElementById('demoModeBtn');

  const cameraSelect = document.getElementById('cameraSelect');
  const refreshCamerasBtn = document.getElementById('refreshCamerasBtn');
  const pipetteToolBtn = document.getElementById('pipetteToolBtn');
  const pipetteCrosshair = document.getElementById('pipetteCrosshair');
  const eyedropperStatus = document.getElementById('eyedropperStatus');
  const sampledColorPreview = document.getElementById('sampledColorPreview');
  const sampledColorValues = document.getElementById('sampledColorValues');

  // Sliders de Color
  const hueSlider = document.getElementById('hueSlider');
  const hueVal = document.getElementById('hueVal');
  const hueToleranceSlider = document.getElementById('hueToleranceSlider');
  const hueToleranceVal = document.getElementById('hueToleranceVal');
  const minSatSlider = document.getElementById('minSatSlider');
  const minSatVal = document.getElementById('minSatVal');
  const minValSlider = document.getElementById('minValSlider');
  const minValVal = document.getElementById('minValVal');
  const minAreaSlider = document.getElementById('minAreaSlider');
  const minAreaVal = document.getElementById('minAreaVal');
  const maxAreaSlider = document.getElementById('maxAreaSlider');
  const maxAreaVal = document.getElementById('maxAreaVal');
  const smoothingSlider = document.getElementById('smoothingSlider');
  const smoothingVal = document.getElementById('smoothingVal');
  const showMaskToggle = document.getElementById('showMaskToggle');

  // Calibración
  const resetCalibrationBtn = document.getElementById('resetCalibrationBtn');
  const toggleTestPatternBtn = document.getElementById('toggleTestPatternBtn');
  const flipCameraXToggle = document.getElementById('flipCameraXToggle');
  const flipCameraYToggle = document.getElementById('flipCameraYToggle');

  // Física
  const spawnRateSlider = document.getElementById('spawnRateSlider');
  const spawnRateVal = document.getElementById('spawnRateVal');
  const gravitySlider = document.getElementById('gravitySlider');
  const gravityVal = document.getElementById('gravityVal');
  const bouncinessSlider = document.getElementById('bouncinessSlider');
  const bouncinessVal = document.getElementById('bouncinessVal');
  const ballRadiusSlider = document.getElementById('ballRadiusSlider');
  const ballRadiusVal = document.getElementById('ballRadiusVal');
  const maxBallsSlider = document.getElementById('maxBallsSlider');
  const maxBallsVal = document.getElementById('maxBallsVal');
  const ballStyleSelect = document.getElementById('ballStyleSelect');
  const spawnerModeSelect = document.getElementById('spawnerModeSelect');
  const clearBallsBtn = document.getElementById('clearBallsBtn');
  const burstBallsBtn = document.getElementById('burstBallsBtn');

  // Efectos & Audio
  const splatterToggle = document.getElementById('splatterToggle');
  const highlightStickersToggle = document.getElementById('highlightStickersToggle');
  const trailLengthSlider = document.getElementById('trailLengthSlider');
  const trailLengthVal = document.getElementById('trailLengthVal');
  const audioEnabledToggle = document.getElementById('audioEnabledToggle');
  const audioVolumeSlider = document.getElementById('audioVolumeSlider');
  const audioVolumeVal = document.getElementById('audioVolumeVal');
  const audioScaleSelect = document.getElementById('audioScaleSelect');

  const toastContainer = document.getElementById('toastContainer');

  // 2. Instanciación de Módulos
  const mapper = new PerspectiveMapper();
  const tracker = new ColorTracker(webcamVideo, cameraFeedCanvas, mapper);
  const physics = new PhysicsEngine(projectionCanvas, effectsCanvas);
  const audio = new SoundSynthesizer();

  // Conectar colisión de física con audio
  physics.onCollision = (collisionData) => {
    audio.playBounce(collisionData.x, collisionData.speed);
  };

  // Estados de control
  let isPanelVisible = false;
  let isPipetteActive = false;
  let isTestPatternActive = false;
  let isSimulationPaused = false;
  let activeCornerDrag = -1;

  // Presets de Post-it
  const postitPresets = {
    yellow: { h: 60, tol: 24, s: 40, v: 45 },
    green:  { h: 125, tol: 28, s: 35, v: 35 },
    pink:   { h: 335, tol: 25, s: 35, v: 40 },
    orange: { h: 25,  tol: 18, s: 45, v: 45 },
    cyan:   { h: 185, tol: 22, s: 35, v: 40 }
  };

  // ==========================================================================
  // GESTIÓN DEL MENÚ Y ATAJOS DE TECLADO (TECLA H)
  // ==========================================================================
  function togglePanel(forceState = null) {
    isPanelVisible = forceState !== null ? forceState : !isPanelVisible;
    if (isPanelVisible) {
      configPanel.classList.remove('hidden');
      drawCalibrationCanvas();
    } else {
      configPanel.classList.add('hidden');
      isPipetteActive = false;
      updatePipetteUI();
    }
  }

  window.addEventListener('keydown', (e) => {
    // Si el usuario escribe en un input, ignorar atajos
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range' && e.target.type !== 'checkbox') return;

    const key = e.key.toLowerCase();
    if (key === 'h') {
      e.preventDefault();
      togglePanel();
      showToast(isPanelVisible ? "Menú abierto (H)" : "Menú oculto (H)");
    } else if (key === 'f') {
      e.preventDefault();
      toggleFullscreen();
    } else if (key === 'r') {
      e.preventDefault();
      physics.clearBalls();
      showToast("Bolas reiniciadas (R)");
    } else if (key === ' ') {
      e.preventDefault();
      isSimulationPaused = !isSimulationPaused;
      showToast(isSimulationPaused ? "Pausa" : "Reanudado");
    }
  });

  floatingMenuBtn.addEventListener('click', () => togglePanel());
  closePanelBtn.addEventListener('click', () => togglePanel(false));

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.warn(err));
    } else {
      document.exitFullscreen().catch(err => console.warn(err));
    }
  }
  fullscreenBtn.addEventListener('click', toggleFullscreen);

  // Tabs del panel
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');

      if (tabId === 'tab-calibration') {
        drawCalibrationCanvas();
      }
    });
  });

  // ==========================================================================
  // INICIO DE CÁMARA & DISPOSITIVOS
  // ==========================================================================
  async function loadCameraDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      cameraSelect.innerHTML = '';
      if (videoDevices.length === 0) {
        cameraSelect.innerHTML = '<option value="">No se encontraron cámaras</option>';
        return;
      }

      videoDevices.forEach((device, index) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Cámara ${index + 1}`;
        cameraSelect.appendChild(option);
      });
    } catch (err) {
      console.warn("Error listando cámaras:", err);
    }
  }

  startCameraBtn.addEventListener('click', async () => {
    audio.init();
    welcomeOverlay.classList.add('hidden');
    showToast("Iniciando cámara...");
    const success = await tracker.startCamera();
    if (success) {
      await loadCameraDevices();
      showToast("Cámara iniciada. Presiona H para ajustar.", "success");
    } else {
      showToast("No se pudo acceder a la cámara. Activando modo Demo.", "warning");
      tracker.setDemoMode(true);
    }
  });

  demoModeBtn.addEventListener('click', () => {
    audio.init();
    welcomeOverlay.classList.add('hidden');
    tracker.setDemoMode(true);
    showToast("Modo Demo activado con Post-its simulados", "success");
    togglePanel(true);
  });

  refreshCamerasBtn.addEventListener('click', loadCameraDevices);

  cameraSelect.addEventListener('change', async () => {
    if (cameraSelect.value) {
      showToast("Cambiando de cámara...");
      await tracker.startCamera(cameraSelect.value);
    }
  });

  // ==========================================================================
  // CLONAR COLOR (PIPETA / EYEDROPPER)
  // ==========================================================================
  pipetteToolBtn.addEventListener('click', () => {
    isPipetteActive = !isPipetteActive;
    updatePipetteUI();
  });

  function updatePipetteUI() {
    if (isPipetteActive) {
      pipetteToolBtn.classList.add('btn-primary');
      pipetteToolBtn.classList.remove('btn-accent');
      eyedropperStatus.textContent = "Haz clic en el video";
      eyedropperStatus.style.background = "rgba(0, 229, 255, 0.25)";
      pipetteCrosshair.style.display = 'block';
    } else {
      pipetteToolBtn.classList.remove('btn-primary');
      pipetteToolBtn.classList.add('btn-accent');
      eyedropperStatus.textContent = "Inactivo";
      eyedropperStatus.style.background = "rgba(255, 255, 255, 0.08)";
      pipetteCrosshair.style.display = 'none';
    }
  }

  cameraFeedCanvas.addEventListener('mousemove', (e) => {
    if (!isPipetteActive) return;
    const rect = cameraFeedCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    pipetteCrosshair.style.left = `${x}px`;
    pipetteCrosshair.style.top = `${y}px`;
  });

  cameraFeedCanvas.addEventListener('click', (e) => {
    const rect = cameraFeedCanvas.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;

    const sample = tracker.sampleColorAt(normX, normY);
    if (sample) {
      applyColorSettings(sample.hsv.h, tracker.hueTolerance, sample.hsv.s, sample.hsv.v);
      sampledColorPreview.style.backgroundColor = `rgb(${sample.rgb.r}, ${sample.rgb.g}, ${sample.rgb.b})`;
      sampledColorValues.textContent = `HSV: ${sample.hsv.h}°, ${sample.hsv.s}%, ${sample.hsv.v}%`;
      showToast(`Color clonado: Hue ${sample.hsv.h}°`, "success");
      isPipetteActive = false;
      updatePipetteUI();
    }
  });

  function applyColorSettings(h, tol, s, v) {
    tracker.targetHue = h;
    tracker.hueTolerance = tol;
    tracker.minSaturation = s;
    tracker.minValue = v;

    hueSlider.value = h;
    hueVal.textContent = `${h}°`;

    hueToleranceSlider.value = tol;
    hueToleranceVal.textContent = `${tol}°`;

    minSatSlider.value = s;
    minSatVal.textContent = `${s}%`;

    minValSlider.value = v;
    minValVal.textContent = `${v}%`;

    sampledColorPreview.style.backgroundColor = `hsl(${h}, 90%, 55%)`;
    saveSettings();
  }

  // Presets
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const presetName = btn.getAttribute('data-preset');
      const p = postitPresets[presetName];
      if (p) {
        applyColorSettings(p.h, p.tol, p.s, p.v);
        showToast(`Preset aplicado: ${btn.textContent.trim()}`);
      }
    });
  });

  // Sliders de Color
  hueSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    tracker.targetHue = val;
    hueVal.textContent = `${val}°`;
    sampledColorPreview.style.backgroundColor = `hsl(${val}, 90%, 55%)`;
    saveSettings();
  });

  hueToleranceSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    tracker.hueTolerance = val;
    hueToleranceVal.textContent = `${val}°`;
    saveSettings();
  });

  minSatSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    tracker.minSaturation = val;
    minSatVal.textContent = `${val}%`;
    saveSettings();
  });

  minValSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    tracker.minValue = val;
    minValVal.textContent = `${val}%`;
    saveSettings();
  });

  minAreaSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    tracker.minArea = val;
    minAreaVal.textContent = `${val} px`;
  });

  maxAreaSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    tracker.maxArea = val;
    maxAreaVal.textContent = `${Math.round(val / 1000)}k px`;
  });

  smoothingSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    tracker.smoothingFactor = val / 100;
    smoothingVal.textContent = `${val}%`;
  });

  showMaskToggle.addEventListener('change', (e) => {
    tracker.showMask = e.target.checked;
  });

  // ==========================================================================
  // CALIBRACIÓN INTERACTIVA DE 4 ESQUINAS
  // ==========================================================================
  const calCtx = calibrationCanvas.getContext('2d');

  function drawCalibrationCanvas() {
    const w = calibrationCanvas.width;
    const h = calibrationCanvas.height;

    // Fondo oscuro o frame de cámara
    calCtx.fillStyle = '#060a12';
    calCtx.fillRect(0, 0, w, h);

    if (tracker.isStreaming && tracker.video.readyState >= 2) {
      calCtx.globalAlpha = 0.45;
      calCtx.drawImage(tracker.procCanvas, 0, 0, w, h);
      calCtx.globalAlpha = 1.0;
    }

    const corners = mapper.srcCorners.map(c => ({
      x: c.x * w,
      y: c.y * h
    }));

    // Cuadrilátero de calibración
    calCtx.strokeStyle = '#00e5ff';
    calCtx.lineWidth = 2;
    calCtx.fillStyle = 'rgba(0, 229, 255, 0.12)';

    calCtx.beginPath();
    calCtx.moveTo(corners[0].x, corners[0].y);
    calCtx.lineTo(corners[1].x, corners[1].y);
    calCtx.lineTo(corners[2].x, corners[2].y);
    calCtx.lineTo(corners[3].x, corners[3].y);
    calCtx.closePath();
    calCtx.fill();
    calCtx.stroke();

    // Líneas guía internas (Grid 2x2)
    calCtx.strokeStyle = 'rgba(0, 229, 255, 0.35)';
    calCtx.setLineDash([3, 3]);

    const midTop = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
    const midBot = { x: (corners[3].x + corners[2].x) / 2, y: (corners[3].y + corners[2].y) / 2 };
    const midLeft = { x: (corners[0].x + corners[3].x) / 2, y: (corners[0].y + corners[3].y) / 2 };
    const midRight = { x: (corners[1].x + corners[2].x) / 2, y: (corners[1].y + corners[2].y) / 2 };

    calCtx.beginPath();
    calCtx.moveTo(midTop.x, midTop.y);
    calCtx.lineTo(midBot.x, midBot.y);
    calCtx.moveTo(midLeft.x, midLeft.y);
    calCtx.lineTo(midRight.x, midRight.y);
    calCtx.stroke();
    calCtx.setLineDash([]);

    // Dibujar los 4 pines de esquina interactivos
    corners.forEach((c, idx) => {
      calCtx.fillStyle = activeCornerDrag === idx ? '#ff007f' : '#00e5ff';
      calCtx.shadowColor = '#00e5ff';
      calCtx.shadowBlur = 10;
      calCtx.beginPath();
      calCtx.arc(c.x, c.y, 8, 0, Math.PI * 2);
      calCtx.fill();
      calCtx.shadowBlur = 0;

      // Etiqueta del pin
      calCtx.fillStyle = '#ffffff';
      calCtx.font = 'bold 10px Outfit';
      calCtx.textAlign = 'center';
      calCtx.textBaseline = 'middle';
      calCtx.fillText(idx + 1, c.x, c.y);
    });
  }

  calibrationCanvas.addEventListener('mousedown', (e) => {
    const rect = calibrationCanvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;

    // Buscar si hizo clic cerca de una de las 4 esquinas
    let closestIdx = -1;
    let minDist = 0.08;

    mapper.srcCorners.forEach((c, i) => {
      const dist = Math.hypot(c.x - mx, c.y - my);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    });

    if (closestIdx !== -1) {
      activeCornerDrag = closestIdx;
      drawCalibrationCanvas();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (activeCornerDrag !== -1) {
      const rect = calibrationCanvas.getBoundingClientRect();
      const normX = (e.clientX - rect.left) / rect.width;
      const normY = (e.clientY - rect.top) / rect.height;

      mapper.setCorner(activeCornerDrag, normX, normY);
      drawCalibrationCanvas();
    }
  });

  window.addEventListener('mouseup', () => {
    if (activeCornerDrag !== -1) {
      activeCornerDrag = -1;
      drawCalibrationCanvas();
      saveSettings();
    }
  });

  resetCalibrationBtn.addEventListener('click', () => {
    mapper.resetCorners();
    drawCalibrationCanvas();
    saveSettings();
    showToast("Esquinas restablecidas");
  });

  toggleTestPatternBtn.addEventListener('click', () => {
    isTestPatternActive = !isTestPatternActive;
    toggleTestPatternBtn.classList.toggle('btn-primary', isTestPatternActive);
    toggleTestPatternBtn.classList.toggle('btn-accent', !isTestPatternActive);
    showToast(isTestPatternActive ? "Patrón de calibración activo" : "Patrón desactivado");
  });

  flipCameraXToggle.addEventListener('change', (e) => {
    tracker.flipX = e.target.checked;
    saveSettings();
  });

  flipCameraYToggle.addEventListener('change', (e) => {
    tracker.flipY = e.target.checked;
    saveSettings();
  });

  // ==========================================================================
  // CONFIGURACIÓN DE FÍSICA Y BOLAS
  // ==========================================================================
  spawnRateSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    physics.spawnRate = val;
    spawnRateVal.textContent = `${val} /s`;
  });

  gravitySlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    physics.gravity = val;
    gravityVal.textContent = val.toFixed(2);
  });

  bouncinessSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    physics.bounciness = val;
    bouncinessVal.textContent = val.toFixed(2);
  });

  ballRadiusSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    physics.ballRadius = val;
    ballRadiusVal.textContent = `${val} px`;
  });

  maxBallsSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    physics.maxBalls = val;
    maxBallsVal.textContent = val;
  });

  ballStyleSelect.addEventListener('change', (e) => {
    physics.ballStyle = e.target.value;
  });

  spawnerModeSelect.addEventListener('change', (e) => {
    physics.spawnerMode = e.target.value;
  });

  clearBallsBtn.addEventListener('click', () => {
    physics.clearBalls();
    showToast("Bolas eliminadas");
  });

  burstBallsBtn.addEventListener('click', () => {
    physics.burst(30);
    showToast("Ráfaga de bolas generada", "success");
  });

  // ==========================================================================
  // EFECTOS VISUALES & AUDIO
  // ==========================================================================
  splatterToggle.addEventListener('change', (e) => {
    physics.enableSplatter = e.target.checked;
  });

  highlightStickersToggle.addEventListener('change', (e) => {
    physics.highlightStickers = e.target.checked;
  });

  trailLengthSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    physics.trailAlpha = val;
    let label = 'Largo';
    if (val > 0.3) label = 'Corto';
    else if (val > 0.15) label = 'Medio';
    trailLengthVal.textContent = `${label} (${val.toFixed(2)})`;
  });

  document.querySelectorAll('input[name="screenMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      physics.debugMode = (e.target.value === 'debug');
    });
  });

  audioEnabledToggle.addEventListener('change', (e) => {
    audio.enabled = e.target.checked;
    if (audio.enabled) audio.init();
  });

  audioVolumeSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    audio.setVolume(val / 100);
    audioVolumeVal.textContent = `${val}%`;
  });

  audioScaleSelect.addEventListener('change', (e) => {
    audio.style = e.target.value;
  });

  // Interacción en pantalla para crear obstáculos en modo Demo o generar bolas
  projectionCanvas.addEventListener('click', (e) => {
    audio.init();
    if (tracker.demoMode) {
      const normX = e.clientX / window.innerWidth;
      const normY = e.clientY / window.innerHeight;
      tracker.addVirtualObstacle(normX, normY);
      showToast("Post-it virtual añadido");
    } else {
      physics.spawnBall(e.clientX, e.clientY, (Math.random() - 0.5) * 5, -2);
    }
  });

  // ==========================================================================
  // PATRÓN DE PRUEBA DE PROYECCIÓN (GRID DE CALIBRACIÓN)
  // ==========================================================================
  function drawTestPattern(ctx, w, h) {
    ctx.save();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;

    // Borde perimétrico
    ctx.strokeRect(10, 10, w - 20, h - 20);

    // Cruz central
    ctx.beginPath();
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Círculos concéntricos
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.25, 0, Math.PI * 2);
    ctx.arc(w / 2, h / 2, Math.min(w, h) * 0.45, 0, Math.PI * 2);
    ctx.stroke();

    // Texto de calibración
    ctx.fillStyle = '#00e5ff';
    ctx.font = '24px Outfit';
    ctx.textAlign = 'center';
    ctx.fillText("PATRÓN DE CALIBRACIÓN - ALINEAR ESQUINAS CON LA CÁMARA", w / 2, h / 2 - 40);
    ctx.font = '16px monospace';
    ctx.fillText("Presiona '▦ Patrón de Prueba' en el menú para desactivar", w / 2, h / 2 + 50);

    ctx.restore();
  }

  // ==========================================================================
  // BUCLE PRINCIPAL DE ANIMACIÓN (LOOP)
  // ==========================================================================
  function mainLoop(timestamp) {
    // 1. Procesar detección de Post-its en la cámara
    const detectedObstacles = tracker.processFrame();

    // 2. Si el patrón de prueba está activo, dibujarlo en el lienzo principal
    if (isTestPatternActive) {
      physics.ctx.fillStyle = '#000000';
      physics.ctx.fillRect(0, 0, physics.width, physics.height);
      drawTestPattern(physics.ctx, physics.width, physics.height);
    } else if (!isSimulationPaused) {
      // 3. Si está en modo Debug, proyectar cámara semitransparente de fondo
      if (physics.debugMode && tracker.isStreaming) {
        physics.ctx.save();
        physics.ctx.globalAlpha = 0.25;
        physics.ctx.drawImage(tracker.procCanvas, 0, 0, physics.width, physics.height);
        physics.ctx.restore();
      }

      // 4. Actualizar simulación de física con los obstáculos detectados
      physics.update(detectedObstacles, timestamp);
    }

    requestAnimationFrame(mainLoop);
  }

  requestAnimationFrame(mainLoop);

  // ==========================================================================
  // PERSISTENCIA (LOCALSTORAGE)
  // ==========================================================================
  function saveSettings() {
    try {
      const data = {
        hue: tracker.targetHue,
        tol: tracker.hueTolerance,
        sat: tracker.minSaturation,
        val: tracker.minValue,
        corners: mapper.srcCorners,
        flipX: tracker.flipX,
        flipY: tracker.flipY
      };
      localStorage.setItem('interactive_projection_config', JSON.stringify(data));
    } catch (e) {
      console.warn("No se pudo guardar en localStorage:", e);
    }
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem('interactive_projection_config');
      if (raw) {
        const d = JSON.parse(raw);
        if (d.corners) {
          mapper.srcCorners = d.corners;
          mapper.computeHomography();
        }
        if (d.hue !== undefined) {
          applyColorSettings(d.hue, d.tol || 22, d.sat || 35, d.val || 30);
        }
        if (d.flipX !== undefined) {
          tracker.flipX = d.flipX;
          flipCameraXToggle.checked = d.flipX;
        }
        if (d.flipY !== undefined) {
          tracker.flipY = d.flipY;
          flipCameraYToggle.checked = d.flipY;
        }
      }
    } catch (e) {
      console.warn("No se pudo cargar de localStorage:", e);
    }
  }

  loadSettings();

  // ==========================================================================
  // SISTEMA DE NOTIFICACIONES TOAST
  // ==========================================================================
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }
});
