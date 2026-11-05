/**
 * ColorTracker & Post-it Detection Engine
 * Procesa la cámara en HSV, detecta blobs de color de notas Post-it,
 * filtra ruido y genera los obstáculos para el motor de física.
 */

class ColorTracker {
  constructor(videoElement, previewCanvas, perspectiveMapper) {
    this.video = videoElement;
    this.previewCanvas = previewCanvas;
    this.ctx = previewCanvas.getContext('2d', { willReadFrequently: true });
    this.mapper = perspectiveMapper;

    // Canvas oculto de procesamiento a resolución óptima (320x240)
    this.procWidth = 320;
    this.procHeight = 240;
    this.procCanvas = document.createElement('canvas');
    this.procCanvas.width = this.procWidth;
    this.procCanvas.height = this.procHeight;
    this.procCtx = this.procCanvas.getContext('2d', { willReadFrequently: true });

    // Parámetros de detección de color (HSV)
    this.targetHue = 60;        // Tono amarillo neón por defecto
    this.hueTolerance = 22;     // Rango de tolerancia
    this.minSaturation = 35;    // Sat. mínima (%)
    this.minValue = 30;         // Brillo mínimo (%)

    // Filtros de tamaño de Post-it (en píxeles de procesamiento)
    this.minArea = 150;
    this.maxArea = 40000;
    this.smoothingFactor = 0.70; // 0 (instantáneo) a 0.95 (muy suave)

    // Opciones de visualización y cámara
    this.showMask = false;
    this.flipX = false;
    this.flipY = false;

    // Lista de obstáculos activos suavizados (en coordenadas normalizadas 0.0 - 1.0)
    this.obstacles = [];

    // Modo Demo (obstáculos manuales si no hay cámara)
    this.demoMode = false;
    this.virtualObstacles = [];

    // Estado de la cámara
    this.stream = null;
    this.isStreaming = false;
  }

  /**
   * Inicia la captura de video de la cámara web
   */
  async startCamera(deviceId = null) {
    try {
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
      }

      const constraints = {
        video: deviceId 
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.video.srcObject = this.stream;
      await this.video.play();
      this.isStreaming = true;
      this.demoMode = false;
      return true;
    } catch (err) {
      console.warn("No se pudo iniciar la cámara web:", err);
      return false;
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    this.isStreaming = false;
  }

  /**
   * Muestrear el color en una posición (x, y) del canvas de preview para clonar el color del Post-it
   */
  sampleColorAt(normX, normY) {
    if (!this.isStreaming || this.video.readyState < 2) {
      return null;
    }

    // Dibujar frame actual en canvas de procesamiento
    this.procCtx.save();
    if (this.flipX || this.flipY) {
      this.procCtx.translate(this.flipX ? this.procWidth : 0, this.flipY ? this.procHeight : 0);
      this.procCtx.scale(this.flipX ? -1 : 1, this.flipY ? -1 : 1);
    }
    this.procCtx.drawImage(this.video, 0, 0, this.procWidth, this.procHeight);
    this.procCtx.restore();

    const px = Math.floor(Math.max(0, Math.min(this.procWidth - 1, normX * this.procWidth)));
    const py = Math.floor(Math.max(0, Math.min(this.procHeight - 1, normY * this.procHeight)));

    // Promedio de un área de 5x5 alrededor del punto para evitar ruido de un solo píxel
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    const half = 2;
    const imgData = this.procCtx.getImageData(
      Math.max(0, px - half),
      Math.max(0, py - half),
      Math.min(5, this.procWidth - px),
      Math.min(5, this.procHeight - py)
    );
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      rSum += d[i];
      gSum += d[i + 1];
      bSum += d[i + 2];
      count++;
    }

    const r = Math.round(rSum / count);
    const g = Math.round(gSum / count);
    const b = Math.round(bSum / count);

    const hsv = this.rgbToHsv(r, g, b);
    this.targetHue = hsv.h;
    // Si la saturación o brillo eran bajos, dar un mínimo razonable
    this.minSaturation = Math.max(20, Math.floor(hsv.s * 0.7));
    this.minValue = Math.max(25, Math.floor(hsv.v * 0.7));

    return { rgb: { r, g, b }, hsv };
  }

  /**
   * Procesa el frame de video y extrae los obstáculos de los Post-its
   */
  processFrame() {
    if (this.demoMode) {
      return this.virtualObstacles;
    }

    if (!this.isStreaming || this.video.readyState < 2) {
      return this.obstacles;
    }

    const w = this.procWidth;
    const h = this.procHeight;

    // 1. Dibujar frame de la cámara en el canvas de procesamiento
    this.procCtx.save();
    if (this.flipX || this.flipY) {
      this.procCtx.translate(this.flipX ? w : 0, this.flipY ? h : 0);
      this.procCtx.scale(this.flipX ? -1 : 1, this.flipY ? -1 : 1);
    }
    this.procCtx.drawImage(this.video, 0, 0, w, h);
    this.procCtx.restore();

    const frameData = this.procCtx.getImageData(0, 0, w, h);
    const data = frameData.data;

    // 2. Clasificación binaria rápida por color HSV y clustering en celdas
    // Submuestreamos en una cuadrícula celular rápida (ej. celdas de 6x6 píxeles)
    const cellSize = 6;
    const gridCols = Math.floor(w / cellSize);
    const gridRows = Math.floor(h / cellSize);
    const grid = new Uint8Array(gridCols * gridRows);

    // Máscara visual si está activada
    const maskData = this.showMask ? this.procCtx.createImageData(w, h) : null;
    const md = maskData ? maskData.data : null;

    const tHue = this.targetHue;
    const tTol = this.hueTolerance;
    const minS = this.minSaturation / 100;
    const minV = this.minValue / 100;

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        let matchCount = 0;
        const startX = gx * cellSize;
        const startY = gy * cellSize;

        // Comprobamos los píxeles dentro de la celda
        for (let py = 0; py < cellSize; py++) {
          const y = startY + py;
          for (let px = 0; px < cellSize; px++) {
            const x = startX + px;
            const idx = (y * w + x) * 4;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // Conversión rápida a HSV inline
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const delta = max - min;
            const v = max / 255;
            const s = max === 0 ? 0 : delta / max;

            let isMatch = false;
            if (v >= minV && s >= minS) {
              let hue = 0;
              if (delta > 0) {
                if (max === r) {
                  hue = 60 * (((g - b) / delta) % 6);
                } else if (max === g) {
                  hue = 60 * (((b - r) / delta) + 2);
                } else {
                  hue = 60 * (((r - g) / delta) + 4);
                }
                if (hue < 0) hue += 360;
              }

              // Diferencia circular de tono (Hue)
              const diff = Math.min(Math.abs(hue - tHue), 360 - Math.abs(hue - tHue));
              if (diff <= tTol) {
                isMatch = true;
                matchCount++;
              }
            }

            if (md) {
              const mIdx = idx;
              if (isMatch) {
                md[mIdx] = 0;
                md[mIdx + 1] = 229;
                md[mIdx + 2] = 255;
                md[mIdx + 3] = 255;
              } else {
                md[mIdx] = 10;
                md[mIdx + 1] = 12;
                md[mIdx + 2] = 18;
                md[mIdx + 3] = 255;
              }
            }
          }
        }

        // Si más del 40% de la celda coincide, marcar la celda como activa
        if (matchCount >= (cellSize * cellSize * 0.4)) {
          grid[gy * gridCols + gx] = 1;
        }
      }
    }

    // 3. Connected Components / Blobs sobre la cuadrícula
    const visited = new Uint8Array(gridCols * gridRows);
    const rawBoxes = [];

    for (let gy = 0; gy < gridRows; gy++) {
      for (let gx = 0; gx < gridCols; gx++) {
        const gIdx = gy * gridCols + gx;
        if (grid[gIdx] === 1 && visited[gIdx] === 0) {
          // Iniciar Flood-Fill BFS para este blob
          let minGX = gx, maxGX = gx;
          let minGY = gy, maxGY = gy;
          let cellCount = 0;

          const queue = [gx, gy];
          visited[gIdx] = 1;

          while (queue.length > 0) {
            const cy = queue.pop();
            const cx = queue.pop();
            cellCount++;

            if (cx < minGX) minGX = cx;
            if (cx > maxGX) maxGX = cx;
            if (cy < minGY) minGY = cy;
            if (cy > maxGY) maxGY = cy;

            // Vecinos (4-conectividad)
            const neighbors = [
              [cx + 1, cy], [cx - 1, cy],
              [cx, cy + 1], [cx, cy - 1]
            ];

            for (const [nx, ny] of neighbors) {
              if (nx >= 0 && nx < gridCols && ny >= 0 && ny < gridRows) {
                const nIdx = ny * gridCols + nx;
                if (grid[nIdx] === 1 && visited[nIdx] === 0) {
                  visited[nIdx] = 1;
                  queue.push(nx, ny);
                }
              }
            }
          }

          // Convertir celdas a píxeles
          const pixelArea = cellCount * cellSize * cellSize;
          if (pixelArea >= this.minArea && pixelArea <= this.maxArea) {
            const bx = (minGX * cellSize) / w;
            const by = (minGY * cellSize) / h;
            const bw = ((maxGX - minGX + 1) * cellSize) / w;
            const bh = ((maxGY - minGY + 1) * cellSize) / h;

            rawBoxes.push({
              x: bx,
              y: by,
              width: bw,
              height: bh,
              area: pixelArea
            });
          }
        }
      }
    }

    // 4. Mapear las coordenadas de cada obstáculo a la pantalla mediante Homografía
    const mappedBoxes = rawBoxes.map(b => {
      // Mapeamos las 4 esquinas del bounding box a través de la calibración
      const pTL = this.mapper.transform(b.x, b.y);
      const pBR = this.mapper.transform(b.x + b.width, b.y + b.height);
      const pTR = this.mapper.transform(b.x + b.width, b.y);
      const pBL = this.mapper.transform(b.x, b.y + b.height);

      const minX = Math.min(pTL.x, pBR.x, pTR.x, pBL.x);
      const maxX = Math.max(pTL.x, pBR.x, pTR.x, pBL.x);
      const minY = Math.min(pTL.y, pBR.y, pTR.y, pBL.y);
      const maxY = Math.max(pTL.y, pBR.y, pTR.y, pBL.y);

      return {
        x: Math.max(0, Math.min(1, minX)),
        y: Math.max(0, Math.min(1, minY)),
        width: Math.max(0.02, Math.min(1, maxX - minX)),
        height: Math.max(0.02, Math.min(1, maxY - minY)),
        corners: [pTL, pTR, pBR, pBL]
      };
    });

    // 5. Suavizado temporal (EMA - Exponential Moving Average)
    this.smoothObstacles(mappedBoxes);

    // 6. Actualizar Canvas de Preview en el menú
    this.renderPreview(maskData, rawBoxes);

    return this.obstacles;
  }

  /**
   * Suaviza la posición y tamaño de los obstáculos para evitar parpadeos
   */
  smoothObstacles(newBoxes) {
    const factor = this.smoothingFactor;
    const matchThreshold = 0.08; // Distancia máxima para considerar el mismo Post-it

    const updated = [];
    const unmatchedNew = [...newBoxes];

    for (const oldBox of this.obstacles) {
      let bestIdx = -1;
      let bestDist = Infinity;

      for (let i = 0; i < unmatchedNew.length; i++) {
        const nb = unmatchedNew[i];
        const dist = Math.hypot(
          (oldBox.x + oldBox.width / 2) - (nb.x + nb.width / 2),
          (oldBox.y + oldBox.height / 2) - (nb.y + nb.height / 2)
        );
        if (dist < bestDist && dist < matchThreshold) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1) {
        // Encontrado: interpolar suavemente
        const nb = unmatchedNew.splice(bestIdx, 1)[0];
        updated.push({
          x: oldBox.x * factor + nb.x * (1 - factor),
          y: oldBox.y * factor + nb.y * (1 - factor),
          width: oldBox.width * factor + nb.width * (1 - factor),
          height: oldBox.height * factor + nb.height * (1 - factor),
          corners: nb.corners,
          lifetime: (oldBox.lifetime || 0) + 1,
          missCount: 0
        });
      } else {
        // No se detectó en este frame: permitir persistencia por unos frames antes de borrar
        const miss = (oldBox.missCount || 0) + 1;
        if (miss < 6) {
          updated.push({
            ...oldBox,
            missCount: miss
          });
        }
      }
    }

    // Agregar nuevos que no hicieron match
    for (const nb of unmatchedNew) {
      updated.push({
        ...nb,
        lifetime: 1,
        missCount: 0
      });
    }

    this.obstacles = updated;
  }

  /**
   * Renderiza el visor en miniatura del panel de control
   */
  renderPreview(maskData, rawBoxes) {
    const pw = this.previewCanvas.width;
    const ph = this.previewCanvas.height;

    if (this.showMask && maskData) {
      this.ctx.putImageData(maskData, 0, 0);
    } else {
      this.ctx.drawImage(this.procCanvas, 0, 0, pw, ph);
    }

    // Dibujar rectángulos de detección sobre el preview
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = '#00e5ff';
    this.ctx.fillStyle = 'rgba(0, 229, 255, 0.2)';

    for (const box of rawBoxes) {
      const rx = box.x * pw;
      const ry = box.y * ph;
      const rw = box.width * pw;
      const rh = box.height * ph;

      this.ctx.fillRect(rx, ry, rw, rh);
      this.ctx.strokeRect(rx, ry, rw, rh);
    }
  }

  /**
   * Conversión de RGB a HSV
   */
  rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    const s = max === 0 ? 0 : d / max;
    const v = max;

    if (max !== min) {
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return {
      h: Math.round(h * 360),
      s: Math.round(s * 100),
      v: Math.round(v * 100)
    };
  }

  /**
   * Activa el modo demo con 4 Post-its virtuales para probar sin cámara
   */
  setDemoMode(enabled = true) {
    this.demoMode = enabled;
    if (enabled) {
      this.stopCamera();
      this.virtualObstacles = [
        { x: 0.15, y: 0.28, width: 0.16, height: 0.08, lifetime: 999 },
        { x: 0.65, y: 0.32, width: 0.18, height: 0.08, lifetime: 999 },
        { x: 0.38, y: 0.50, width: 0.24, height: 0.09, lifetime: 999 },
        { x: 0.18, y: 0.70, width: 0.18, height: 0.08, lifetime: 999 },
        { x: 0.60, y: 0.74, width: 0.22, height: 0.08, lifetime: 999 }
      ];
      this.obstacles = [...this.virtualObstacles];
    }
  }

  addVirtualObstacle(normX, normY, width = 0.16, height = 0.08) {
    const ob = {
      x: Math.max(0, normX - width / 2),
      y: Math.max(0, normY - height / 2),
      width,
      height,
      lifetime: 999
    };
    this.virtualObstacles.push(ob);
    this.obstacles = [...this.virtualObstacles];
  }
}

window.ColorTracker = ColorTracker;
