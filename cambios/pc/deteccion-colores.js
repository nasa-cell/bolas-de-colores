/*
  DETECCIÓN DE VARIOS COLORES A LA VEZ
  ------------------------------------
  La app original busca UN solo color (por defecto amarillo). Este archivo
  hace que busque varios colores de Post-it al mismo tiempo, sin configurar
  nada: amarillo, verde limón, rosado fuerte, rosado pálido, naranja y celeste.

  Lo carga index.html con una línea. Si se borra esa línea, la app vuelve a
  detectar un solo color como antes.

  Bloques:
   1. Lista de colores (valores medidos con fotos reales de Post-its)
   2. Guardar y leer la lista (para que se recuerde al recargar)
   3. Detección: reemplaza processFrame de la app cuando el modo es "varios"
   4. Botones en la consola (tecla H → pestaña Cromática)
   5. «Clonar color» agrega el color a la lista
*/
(function () {
  'use strict';
  if (typeof ColorTracker === 'undefined') return;

  /* ---------- 1. Lista de colores ----------
     h    = tono central (0-360°)      tol  = cuánto se puede alejar del tono
     minS = color mínimo (saturación %) maxS = color máximo (solo para pálidos)
     minV = brillo mínimo %
     muestra = color del botón en pantalla                                   */
  const COLORES_BASE = [
    { id: 'amarillo', nombre: 'Amarillo',      h: 55,  tol: 16, minS: 30, maxS: 100, minV: 45, muestra: '#facc15' },
    { id: 'verde',    nombre: 'Verde limón',   h: 85,  tol: 24, minS: 20, maxS: 100, minV: 40, muestra: '#a3e635' },
    { id: 'rosado',   nombre: 'Rosado fuerte', h: 315, tol: 30, minS: 18, maxS: 100, minV: 50, muestra: '#f472b6' },
    // El pálido es casi blanco: solo cuenta si es muy claro y de tono rosado/lila.
    // Así no se confunde con paredes, madera o enchufes blancos-azulados.
    { id: 'palido',   nombre: 'Rosado pálido', h: 290, tol: 35, minS: 6,  maxS: 22,  minV: 78, muestra: '#f5d0fe' },
    { id: 'naranja',  nombre: 'Naranja',       h: 24,  tol: 12, minS: 50, maxS: 100, minV: 55, muestra: '#fb923c' },
    { id: 'celeste',  nombre: 'Celeste',       h: 190, tol: 18, minS: 30, maxS: 100, minV: 50, muestra: '#38bdf8' }
  ];

  /* ---------- 2. Guardar y leer ---------- */
  const CLAVE = 'posits-varios-colores-v1';
  let estado = { modo: 'varios', apagados: [], clonados: [] }; // por defecto: todo prendido
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE));
    if (guardado && guardado.modo) estado = Object.assign(estado, guardado);
  } catch (e) { /* sin almacenamiento: se usan los valores por defecto */ }

  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) {}
  }

  // Colores que se buscan ahora mismo (los prendidos + los clonados)
  function coloresActivos() {
    return COLORES_BASE.filter(c => !estado.apagados.includes(c.id)).concat(estado.clonados);
  }

  /* ---------- 3. Detección ----------
     Misma idea que la app original (cuadrícula de 3x3 px y grupos vecinos),
     pero cada celda recuerda QUÉ color tiene. Así dos Post-its de colores
     distintos pegados uno al lado del otro salen como 2 cajas, no 1.       */
  const processFrameOriginal = ColorTracker.prototype.processFrame;
  let trackerActual = null; // se guarda para usarlo en «Clonar color»

  ColorTracker.prototype.processFrame = function () {
    trackerActual = this;
    if (estado.modo !== 'varios') {
      // Modo "un color" = como antes. Los Post-its quedan con el color que se busca.
      const obstaculos = processFrameOriginal.call(this);
      const color = 'hsl(' + this.targetHue + ', 90%, 60%)';
      if (Array.isArray(obstaculos)) obstaculos.forEach(ob => { if (!ob.color) ob.color = color; });
      return obstaculos;
    }
    if (this.demoMode) {
      // Modo simulación: los Post-its de mentira también tienen color
      this.virtualObstacles.forEach((ob, i) => { if (!ob.color) ob.color = COLORES_BASE[i % COLORES_BASE.length].muestra; });
      return this.virtualObstacles;
    }
    if (!this.isStreaming || this.video.readyState < 2) return this.obstacles;

    const lista = coloresActivos();
    const w = this.procWidth, h = this.procHeight;

    // 3a. Copia la imagen de la cámara (con el espejo si está activado)
    this.procCtx.save();
    if (this.flipX || this.flipY) {
      this.procCtx.translate(this.flipX ? w : 0, this.flipY ? h : 0);
      this.procCtx.scale(this.flipX ? -1 : 1, this.flipY ? -1 : 1);
    }
    this.procCtx.drawImage(this.video, 0, 0, w, h);
    this.procCtx.restore();
    this.currentCenterSample = this.sampleCenterCard();

    const datos = this.procCtx.getImageData(0, 0, w, h).data;
    const mascara = this.showMask ? this.procCtx.createImageData(w, h) : null;

    // 3b. Cada celda de 3x3 px: ¿de qué color es? (0 = ninguno, 1..N = color de la lista)
    const celda = 3;
    const cols = Math.floor(w / celda), filas = Math.floor(h / celda);
    const grilla = new Uint8Array(cols * filas);
    const conteo = new Uint8Array(lista.length);
    const minimo = celda * celda * 0.35; // igual que la app: 35% de la celda

    for (let gy = 0; gy < filas; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        conteo.fill(0);
        for (let py = 0; py < celda; py++) {
          for (let px = 0; px < celda; px++) {
            const i = ((gy * celda + py) * w + gx * celda + px) * 4;
            const n = colorDelPixel(datos[i], datos[i + 1], datos[i + 2], lista);
            if (n >= 0) conteo[n]++;
            if (mascara) pintarMascara(mascara.data, i, n, lista);
          }
        }
        // Se queda con el color que más se repite en la celda
        let mejor = -1, mayor = 0;
        for (let k = 0; k < conteo.length; k++) if (conteo[k] > mayor) { mayor = conteo[k]; mejor = k; }
        if (mejor >= 0 && mayor >= minimo) grilla[gy * cols + gx] = mejor + 1;
      }
    }

    // 3c. Junta celdas vecinas del mismo color en una caja
    const cajas = juntarCeldas(grilla, cols, filas, celda, w, h, this.minArea, this.maxArea);
    // 3d. Color de cada Post-it: el color REAL medido en la imagen, un poco más vivo
    //     (lo usan «Pintar colores» y la miniatura de la foto)
    if (++cuadros % 15 === 1) ganancia = balanceDeBlancos(datos, w, h, cajas); // cada 15 cuadros basta
    cajas.forEach(c => {
      c.muestra = lista[c.color].muestra;
      c.colorReal = colorReal(datos, w, h, c, lista);
    });

    // 3e. Desde aquí, todo igual que la app: pasar a coordenadas del proyector,
    //     suavizar el movimiento y dibujar la vista previa.
    const proyectadas = cajas.map(c => Object.assign(proyectarCaja(this, c), { color: c.colorReal }));
    this.smoothObstacles(proyectadas);
    ponerColores(this.obstacles, proyectadas);
    this.renderPreview(mascara, cajas);
    return this.obstacles;
  };

  /* ---------- Color real del Post-it ----------
     Promedio de los pixeles de la caja que sí son del color del Post-it (se saltan
     la pared y la sombra). Después se aviva: la cámara entrega colores apagados y en
     el proyector, sobre negro, se verían casi blancos.                            */
  function colorReal(datos, w, h, caja, lista) {
    const x0 = Math.floor(caja.x * w), x1 = Math.min(w, Math.ceil((caja.x + caja.width) * w));
    const y0 = Math.floor(caja.y * h), y1 = Math.min(h, Math.ceil((caja.y + caja.height) * h));
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y += 2) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * w + x) * 4;
        if (colorDelPixel(datos[i], datos[i + 1], datos[i + 2], lista) !== caja.color) continue;
        r += datos[i]; g += datos[i + 1]; b += datos[i + 2]; n++;
      }
    }
    if (!n) return lista[caja.color].muestra;
    // Se quita el tinte de la cámara antes de avivar el color
    return masVivo(Math.min(255, r / n * ganancia[0]), Math.min(255, g / n * ganancia[1]), Math.min(255, b / n * ganancia[2]));
  }

  /* ---------- Balance de blancos ----------
     Muchas cámaras tiñen la imagen (por ejemplo, todo un poco azul). Se buscan las
     partes blancas o gris claro de la imagen (enchufes, papel, pared clara), SIN contar
     los Post-its, y se calcula cuánto subir cada canal (rojo, verde, azul) para que
     esas partes queden blancas de verdad. Solo afecta al color de las bolitas.     */
  let ganancia = [1, 1, 1];
  let cuadros = 0;
  const GANANCIA_MAX = 1.4;   // no se corrige más de 40% por canal (evita colores locos)

  function balanceDeBlancos(datos, w, h, cajas) {
    const dentroDePostit = (x, y) => cajas.some(c =>
      x >= c.x * w && x <= (c.x + c.width) * w && y >= c.y * h && y <= (c.y + c.height) * h);
    const claros = [];
    for (let y = 0; y < h; y += 3) {
      for (let x = 0; x < w; x += 3) {
        const i = (y * w + x) * 4, r = datos[i], g = datos[i + 1], b = datos[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        // claro (más de 55% de brillo) y casi sin color (menos de 22%)
        if (max > 140 && (max - min) / max < 0.22 && !dentroDePostit(x, y)) claros.push([r, g, b, r + g + b]);
      }
    }
    if (claros.length < 40) return [1, 1, 1]; // no hay nada blanco en la imagen: no se corrige
    // Se usa el 10% más brillante (lo más parecido a «blanco»)
    claros.sort((a, b) => b[3] - a[3]);
    const top = claros.slice(0, Math.max(20, Math.floor(claros.length * 0.1)));
    const prom = [0, 1, 2].map(k => top.reduce((s, p) => s + p[k], 0) / top.length);
    const mayor = Math.max(...prom);
    return prom.map(v => Math.min(GANANCIA_MAX, mayor / Math.max(1, v)));
  }

  // Mismo tono, con más color y sin pasar de claro. Se redondea para que el color
  // no cambie un poquito en cada cuadro (las bolitas no «parpadean»).
  const COLOR_MINIMO = 0.75;   // saturación mínima (0 a 1)
  const LUZ_MIN = 0.5, LUZ_MAX = 0.72;
  function masVivo(r, g, b) {
    // RGB → HSL (tono, saturación, luz)
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let tono = 0, sat = 0, luz = (max + min) / 2;
    if (d > 0) {
      sat = d / (1 - Math.abs(2 * luz - 1));
      if (max === r) tono = ((g - b) / d) % 6; else if (max === g) tono = (b - r) / d + 2; else tono = (r - g) / d + 4;
      tono = (tono * 60 + 360) % 360;
    }
    sat = Math.max(sat, COLOR_MINIMO);
    luz = Math.min(LUZ_MAX, Math.max(LUZ_MIN, luz));
    // HSL → RGB
    const c = (1 - Math.abs(2 * luz - 1)) * sat, xx = c * (1 - Math.abs((tono / 60) % 2 - 1)), m = luz - c / 2;
    const [r1, g1, b1] = tono < 60 ? [c, xx, 0] : tono < 120 ? [xx, c, 0] : tono < 180 ? [0, c, xx]
                       : tono < 240 ? [0, xx, c] : tono < 300 ? [xx, 0, c] : [c, 0, xx];
    return '#' + [r1, g1, b1].map(v => Math.min(255, Math.round((v + m) * 255 / 16) * 16).toString(16).padStart(2, '0')).join('');
  }

  // El suavizado de la app crea cajas nuevas y pierde el color: se le vuelve a poner
  // a cada una el color de la caja detectada más cercana (lo usa «Pintar colores»).
  function ponerColores(obstaculos, detectadas) {
    for (const ob of obstaculos) {
      let mejor = null, menor = Infinity;
      for (const d of detectadas) {
        const dist = Math.hypot(ob.x + ob.width / 2 - d.x - d.width / 2, ob.y + ob.height / 2 - d.y - d.height / 2);
        if (dist < menor) { menor = dist; mejor = d; }
      }
      if (mejor) ob.color = mejor.color;
    }
  }

  // Devuelve el número del color que coincide con el pixel, o -1 si ninguno
  function colorDelPixel(r, g, b, lista) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (max === 0) return -1;
    const s = 100 * d / max, v = 100 * max / 255;
    let tono = 0;
    if (d > 0) {
      if (max === r) tono = 60 * (((g - b) / d) % 6);
      else if (max === g) tono = 60 * ((b - r) / d + 2);
      else tono = 60 * ((r - g) / d + 4);
      if (tono < 0) tono += 360;
    }
    for (let k = 0; k < lista.length; k++) {
      const c = lista[k];
      if (s < c.minS || s > c.maxS || v < c.minV) continue;
      const dif = Math.abs(tono - c.h);
      if (Math.min(dif, 360 - dif) <= c.tol) return k;
    }
    return -1;
  }

  // Máscara (opción «ver máscara» de la consola): cada Post-it con su color
  const cacheRgb = {};
  function pintarMascara(m, i, n, lista) {
    if (n < 0) { m[i] = 10; m[i + 1] = 12; m[i + 2] = 18; m[i + 3] = 255; return; }
    const hex = lista[n].muestra;
    const rgb = cacheRgb[hex] || (cacheRgb[hex] = [1, 3, 5].map(p => parseInt(hex.substr(p, 2), 16)));
    m[i] = rgb[0]; m[i + 1] = rgb[1]; m[i + 2] = rgb[2]; m[i + 3] = 255;
  }

  /* ---------- Filtro de forma: solo Post-its, no otras cosas ----------
     Un Post-it es casi cuadrado y de color parejo. Se descartan:
      - manchas chicas (brillos, puntos de color)            → AREA_MINIMA
      - rayas largas (vetas de madera, cables, bordes)       → proporción
      - formas raras o huecas (ropa, dibujos, sombras)       → relleno       */
  const AREA_MINIMA = 150;          // px en la imagen de 640 de ancho (~12x12 px)
  const PROPORCION_MIN = 0.4;       // ancho/alto: 0.4 a 2.5 (permite verlos de costado)
  const PROPORCION_MAX = 2.5;
  const RELLENO_MIN = 0.55;         // al menos 55% de su caja con color (permite la punta doblada)

  function pareceUnPostit(anchoCeldas, altoCeldas, celdasConColor) {
    const proporcion = anchoCeldas / altoCeldas;
    const relleno = celdasConColor / (anchoCeldas * altoCeldas);
    return proporcion >= PROPORCION_MIN && proporcion <= PROPORCION_MAX && relleno >= RELLENO_MIN;
  }

  function juntarCeldas(grilla, cols, filas, celda, w, h, areaMin, areaMax) {
    const visto = new Uint8Array(cols * filas);
    const cajas = [];
    for (let inicio = 0; inicio < grilla.length; inicio++) {
      const color = grilla[inicio];
      if (!color || visto[inicio]) continue;
      let x0 = cols, x1 = 0, y0 = filas, y1 = 0, total = 0;
      const pila = [inicio];
      visto[inicio] = 1;
      while (pila.length) {
        const j = pila.pop();
        const x = j % cols, y = (j / cols) | 0;
        total++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        // vecinos: derecha, izquierda, abajo, arriba (solo del mismo color)
        if (x + 1 < cols)  probar(j + 1);
        if (x > 0)         probar(j - 1);
        if (y + 1 < filas) probar(j + cols);
        if (y > 0)         probar(j - cols);
      }
      function probar(t) { if (grilla[t] === color && !visto[t]) { visto[t] = 1; pila.push(t); } }

      const area = total * celda * celda;
      if (area >= Math.max(areaMin, AREA_MINIMA) && area <= areaMax && pareceUnPostit(x1 - x0 + 1, y1 - y0 + 1, total)) {
        cajas.push({
          x: x0 * celda / w, y: y0 * celda / h,
          width: (x1 - x0 + 1) * celda / w, height: (y1 - y0 + 1) * celda / h,
          area, color: color - 1
        });
      }
    }
    return cajas;
  }

  // Igual que la app original: esquinas → proyector, escala, margen y desplazamiento
  function proyectarCaja(t, b) {
    const esquinas = [
      t.mapper.transform(b.x, b.y), t.mapper.transform(b.x + b.width, b.y),
      t.mapper.transform(b.x + b.width, b.y + b.height), t.mapper.transform(b.x, b.y + b.height)
    ];
    const xs = esquinas.map(p => p.x), ys = esquinas.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    let ancho = Math.max(0.015, maxX - minX) * (t.manualScaleX || 1);
    let alto = Math.max(0.015, maxY - minY) * (t.manualScaleY || 1);
    if (t.sizeOffset) { ancho += ancho * t.sizeOffset; alto += alto * t.sizeOffset; }
    const cx = (minX + maxX) / 2 + (t.manualOffsetX || 0);
    const cy = (minY + maxY) / 2 + (t.manualOffsetY || 0);
    return {
      x: Math.max(0, Math.min(1 - ancho, cx - ancho / 2)),
      y: Math.max(0, Math.min(1 - alto, cy - alto / 2)),
      width: Math.max(0.01, ancho), height: Math.max(0.01, alto),
      corners: [esquinas[0], esquinas[1], esquinas[2], esquinas[3]]
    };
  }

  /* ---------- 4. Botones en la consola ---------- */
  document.head.insertAdjacentHTML('beforeend', `<style>
    .vc-grupo { margin-bottom: 18px; }
    .vc-modo { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 8px 0; }
    .vc-modo button, .vc-color { font: 600 12px var(--font-main); padding: 8px; border-radius: 6px; cursor: pointer;
      border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-secondary); }
    .vc-modo button.on { border-color: var(--accent-cyan); color: var(--accent-cyan); background: rgba(56,189,248,.1); }
    .vc-colores { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; }
    .vc-color { display: flex; align-items: center; gap: 7px; text-align: left; opacity: .45; }
    .vc-color.on { opacity: 1; color: var(--text-primary); border-color: #475569; }
    .vc-color i { width: 12px; height: 12px; border-radius: 3px; flex: none; }
    .vc-color b { margin-left: auto; font-size: 11px; color: var(--text-muted); }
    .vc-nota { font-size: 11px; color: var(--text-muted); margin-top: 6px; }
    .vc-bloque[hidden] { display: none !important; }
  </style>`);

  // Se pone arriba de «Calibraciones cromáticas estándar»
  const ancla = [...document.querySelectorAll('#tab-color .control-group')]
    .find(g => g.querySelector('.presets-grid'));
  const caja = document.createElement('div');
  caja.className = 'control-group vc-grupo';
  caja.innerHTML = `
    <label>Colores que detecta:</label>
    <div class="vc-modo">
      <button type="button" data-modo="varios">Varios colores a la vez</button>
      <button type="button" data-modo="uno">Un solo color (como antes)</button>
    </div>
    <div class="vc-bloque" id="vcBloque">
      <div class="vc-colores" id="vcColores"></div>
      <p class="vc-nota">Toca un color para prenderlo o apagarlo. «Clonar Color de Tarjeta» agrega un color nuevo.</p>
    </div>`;
  if (ancla) ancla.parentNode.insertBefore(caja, ancla);
  else document.getElementById('tab-color')?.appendChild(caja);

  function dibujarBotones() {
    caja.querySelectorAll('[data-modo]').forEach(b => b.classList.toggle('on', b.dataset.modo === estado.modo));
    document.getElementById('vcBloque').hidden = estado.modo !== 'varios';
    // En modo "varios" los controles viejos de un solo color no hacen nada: se avisa
    if (ancla) ancla.style.opacity = estado.modo === 'varios' ? '.45' : '';

    const zona = document.getElementById('vcColores');
    zona.innerHTML = '';
    COLORES_BASE.forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vc-color' + (estado.apagados.includes(c.id) ? '' : ' on');
      b.innerHTML = `<i style="background:${c.muestra}"></i>${c.nombre}`;
      b.onclick = () => {
        const i = estado.apagados.indexOf(c.id);
        if (i >= 0) estado.apagados.splice(i, 1); else estado.apagados.push(c.id);
        guardar(); dibujarBotones();
      };
      zona.appendChild(b);
    });
    estado.clonados.forEach((c, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vc-color on';
      b.title = 'Toca para quitar este color';
      b.innerHTML = `<i style="background:${c.muestra}"></i>${c.nombre}<b>✕</b>`;
      b.onclick = () => { estado.clonados.splice(n, 1); guardar(); dibujarBotones(); };
      zona.appendChild(b);
    });
  }

  caja.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => {
    estado.modo = b.dataset.modo; guardar(); dibujarBotones();
  });
  dibujarBotones();

  /* ---------- 5. «Clonar color» agrega a la lista ---------- */
  const botonClonar = document.getElementById('cloneCardBtn');
  if (botonClonar) botonClonar.addEventListener('click', () => {
    if (estado.modo !== 'varios' || !trackerActual) return;
    const m = trackerActual.sampleCenterCard();
    if (!m || m.hsv.s < 6) return; // sin tarjeta o casi gris: la app ya muestra el aviso
    const { h, s, v } = m.hsv;
    estado.clonados.push({
      id: 'clonado-' + Date.now(),
      nombre: 'Clonado ' + h + '°',
      h, tol: 20,
      minS: Math.max(6, Math.round(s * 0.6)), maxS: 100,
      minV: Math.max(25, Math.round(v * 0.7)),
      muestra: '#' + [m.rgb.r, m.rgb.g, m.rgb.b].map(x => x.toString(16).padStart(2, '0')).join('')
    });
    guardar(); dibujarBotones();
  });
})();
