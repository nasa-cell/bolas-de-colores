/*
  DETECCIÓN DE VARIOS COLORES A LA VEZ
  ------------------------------------
  La app original busca UN solo color (por defecto amarillo). Este archivo
  hace que busque varios colores de Post-it al mismo tiempo, sin configurar
  nada: amarillo, verde limón, verde, rosado fuerte, rosado pálido, naranja,
  celeste, lila y morado.

  Lo carga index.html con una línea. Si se borra esa línea, la app vuelve a
  detectar un solo color como antes.

  Bloques:
   1. Lista de colores (valores medidos con fotos reales de Post-its)
   2. Guardar y leer la lista (para que se recuerde al recargar)
   3. Detección: reemplaza processFrame de la app cuando el modo es "varios"
   4. Botones en la consola (tecla H → pestaña Cromática)
   5. «Clonar color» agrega el color a la lista
   6. Enseñar un Post-it tocándolo (en el video de la consola o en el celular)
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
    // Amarillo empieza en 45° para dejarle 17°-44° al naranja.
    { id: 'amarillo', nombre: 'Amarillo',      h: 57,  tol: 12, minS: 30, maxS: 100, minV: 45, muestra: '#facc15' },
    { id: 'verde',    nombre: 'Verde limón',   h: 85,  tol: 24, minS: 20, maxS: 100, minV: 40, muestra: '#a3e635' },
    // Verde claro (menta): en foto real mide 121°, 22% de color.
    { id: 'verdeclaro', nombre: 'Verde',       h: 125, tol: 15, minS: 14, maxS: 100, minV: 55, muestra: '#86efac' },
    { id: 'rosado',   nombre: 'Rosado fuerte', h: 315, tol: 30, minS: 23, maxS: 100, minV: 50, muestra: '#f472b6' },
    // Rosado fuerte desde 23% de color y pálido hasta 22%: sin hueco ni cruce.
    // Antes se cruzaban y un Post-it pálido (18% de color) salía partido en 2.
    // El pálido es casi blanco: solo cuenta si es muy claro y de tono rosado/lila.
    // Así no se confunde con paredes, madera o enchufes blancos-azulados.
    { id: 'palido',   nombre: 'Rosado pálido', h: 290, tol: 35, minS: 6,  maxS: 22,  minV: 78, muestra: '#f5d0fe' },
    // Naranja: el claro mide 39°, 32% de color, brillo 87%. La madera tiene
    // el mismo tono pero menos de 25% de color, por eso minS 26 y minV 65.
    { id: 'naranja',  nombre: 'Naranja',       h: 30,  tol: 14, minS: 26, maxS: 100, minV: 65, muestra: '#fb923c' },
    { id: 'celeste',  nombre: 'Celeste',       h: 190, tol: 18, minS: 30, maxS: 100, minV: 50, muestra: '#38bdf8' },
    // Lila: claro y poco color. Si tiene menos de 23% de color lo toma «Rosado pálido».
    { id: 'lila',     nombre: 'Lila',          h: 270, tol: 18, minS: 23, maxS: 45,  minV: 60, muestra: '#c4b5fd' },
    { id: 'morado',   nombre: 'Morado',        h: 275, tol: 20, minS: 45, maxS: 100, minV: 25, muestra: '#8b5cf6' }
  ];

  /* ---------- 2. Guardar y leer ---------- */
  const CLAVE = 'posits-varios-colores-v1';
  let estado = { modo: 'varios', apagados: [], clonados: [], ensenados: [] }; // por defecto: todo prendido
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE));
    if (guardado && guardado.modo) estado = Object.assign(estado, guardado);
  } catch (e) { /* sin almacenamiento: se usan los valores por defecto */ }

  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) {}
  }

  // Colores que se buscan ahora mismo (los prendidos + los clonados)
  // Los enseñados van primero: se midieron con la luz del salón y mandan sobre la lista fija.
  function coloresActivos() {
    return estado.ensenados.concat(COLORES_BASE.filter(c => !estado.apagados.includes(c.id)), estado.clonados);
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
    // Tono de cada celda (como flecha en un círculo: x = coseno, y = seno), para juntar
    // las partes de un Post-it cuyo tono cae justo en el límite entre dos colores.
    const tonoX = new Float32Array(cols * filas), tonoY = new Float32Array(cols * filas);
    const conteo = new Uint8Array(lista.length);
    const minimo = celda * celda * 0.35; // igual que la app: 35% de la celda
    // Celdas donde la app está proyectando una bola de color (las marca auto-ajuste.js):
    // la luz de una bola rosada sobre la pantalla blanca parece un Post-it rosado.
    const tapa = window.autoAjusteActivo && window.autoAjusteTapa && window.autoAjusteTapa.length === cols * filas
      ? window.autoAjusteTapa : null;

    for (let gy = 0; gy < filas; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        if (tapa && tapa[gy * cols + gx]) continue;
        conteo.fill(0);
        let sr = 0, sg = 0, sb = 0;
        for (let py = 0; py < celda; py++) {
          for (let px = 0; px < celda; px++) {
            const i = ((gy * celda + py) * w + gx * celda + px) * 4;
            const n = colorDelPixel(datos[i], datos[i + 1], datos[i + 2], lista);
            if (n >= 0) { conteo[n]++; sr += datos[i]; sg += datos[i + 1]; sb += datos[i + 2]; }
            if (mascara) pintarMascara(mascara.data, i, n, lista);
          }
        }
        // Se queda con el color que más se repite en la celda
        let mejor = -1, mayor = 0;
        for (let k = 0; k < conteo.length; k++) if (conteo[k] > mayor) { mayor = conteo[k]; mejor = k; }
        if (mejor >= 0 && mayor >= minimo) {
          grilla[gy * cols + gx] = mejor + 1;
          const t = tonoDe(sr, sg, sb) * Math.PI / 180;
          tonoX[gy * cols + gx] = Math.cos(t); tonoY[gy * cols + gx] = Math.sin(t);
        }
      }
    }

    // 3c. Junta celdas vecinas del mismo color en una caja
    const cajas = juntarCeldas(grilla, cols, filas, celda, w, h, this.minArea, this.maxArea, tonoX, tonoY);
    if (++cuadros % 15 === 1) ganancia = balanceDeBlancos(datos, w, h, cajas); // cada 15 cuadros basta
    // 3d. Color de cada Post-it: el color REAL medido en la imagen, un poco más vivo
    //     (lo usan «Pintar colores» y la miniatura de la foto)

    cajas.forEach(c => {
      c.muestra = lista[c.color].muestra;
      c.colorReal = colorReal(datos, w, h, c, lista);
    });

    // 3e. Desde aquí, todo igual que la app: pasar a coordenadas del proyector,
    //     suavizar el movimiento y dibujar la vista previa.
    if (window.autoAjusteActivo) cajas.forEach(c => buscarCortes(datos, w, h, c, lista));
    const proyectadas = cajas.map(c => Object.assign(proyectarCaja(this, c), { color: c.colorReal, cortes: c.cortes }));
    this.smoothObstacles(proyectadas);
    ponerColores(this.obstacles, proyectadas);
    this.renderPreview(mascara, cajas);
    marcarToque(this);
    return this.obstacles;
  };

  /* ---------- Cortes entre Post-its pegados ----------
     Si la caja es alargada (varios Post-its en fila), se busca la línea entre
     un papel y otro: ahí hay menos color o una sombrita. Se mide columna por
     columna (o fila por fila si la fila es vertical) en la franja del medio.
     Deja en caja.cortes las posiciones (0 a 1 a lo largo de la caja).        */
  function buscarCortes(datos, w, h, caja, lista) {
    const x0 = Math.floor(caja.x * w), x1 = Math.min(w - 1, Math.ceil((caja.x + caja.width) * w));
    const y0 = Math.floor(caja.y * h), y1 = Math.min(h - 1, Math.ceil((caja.y + caja.height) * h));
    const anchoPx = x1 - x0, altoPx = y1 - y0;
    const horizontal = anchoPx >= altoPx;
    const largo = horizontal ? anchoPx : altoPx, corto = horizontal ? altoPx : anchoPx;
    if (largo < corto * 1.6 || corto < 6) return;
    // Franja del medio (sin los bordes, que pueden estar doblados)
    const a0 = Math.floor(corto * 0.2), a1 = Math.ceil(corto * 0.8);
    const perfil = new Float32Array(largo);
    for (let k = 0; k < largo; k++) {
      let s = 0, n = 0;
      for (let j = a0; j < a1; j++) {
        const x = horizontal ? x0 + k : x0 + j, y = horizontal ? y0 + j : y0 + k;
        const i = (y * w + x) * 4, r = datos[i], g = datos[i + 1], b = datos[i + 2];
        const igual = colorDelPixel(r, g, b, lista) === caja.color ? 1 : 0.4;
        s += igual * Math.max(r, g, b); n++;
      }
      perfil[k] = n ? s / n : 0;
    }
    // Sin suavizar: la línea entre dos papeles mide 1 o 2 pixeles
    const suave = perfil;
    const orden = Array.from(suave).sort((p, q) => p - q);
    const tipico = orden[Math.floor(orden.length * 0.6)];
    const separacion = corto * 0.6; // un Post-it no es mucho más angosto que alto
    const cortes = [];
    let ultimo = 0;
    for (let k = 2; k < largo - 2; k++) {
      if (k - ultimo < separacion || largo - k < separacion) continue;
      const v = suave[k];
      // Línea angosta: más oscura que el papel a los dos lados (a 3-5 pixeles)
      const izq = Math.max(suave[Math.max(0, k - 3)], suave[Math.max(0, k - 4)], suave[Math.max(0, k - 5)]);
      const der = Math.max(suave[Math.min(largo - 1, k + 3)], suave[Math.min(largo - 1, k + 4)], suave[Math.min(largo - 1, k + 5)]);
      if (v < tipico * 0.95 && v < izq * 0.9 && v < der * 0.9 &&
          v <= suave[k - 1] && v <= suave[k + 1] && v <= suave[k - 2] && v <= suave[k + 2]) {
        cortes.push(k / largo); ultimo = k;
      }
    }
    if (cortes.length) caja.cortes = { lista: cortes, horizontal };
  }

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

  // Varios Post-its pegados en fila salen como un rectángulo largo y bien lleno.
  // Con el ajuste automático prendido se aceptan (hasta 5 en fila) y auto-ajuste.js
  // los parte en Post-its sueltos. Una veta de madera no llena tanto su caja.
  const FILA_PROPORCION_MAX = 5.5;
  const FILA_RELLENO_MIN = 0.8;

  function pareceUnPostit(anchoCeldas, altoCeldas, celdasConColor) {
    const proporcion = anchoCeldas / altoCeldas;
    const relleno = celdasConColor / (anchoCeldas * altoCeldas);
    if (proporcion >= PROPORCION_MIN && proporcion <= PROPORCION_MAX && relleno >= RELLENO_MIN) return true;
    return !!window.autoAjusteActivo && relleno >= FILA_RELLENO_MIN &&
      proporcion <= FILA_PROPORCION_MAX && proporcion >= 1 / FILA_PROPORCION_MAX;
  }

  // Tono (0-360°) de un color RGB
  function tonoDe(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return 0;
    let t = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (t * 60 + 360) % 360;
  }

  // Una celda de otro color de la lista se suma al Post-it si su tono está a menos de
  // TONO_JUNTAR grados del tono promedio del Post-it (mismo papel con el tono en el límite).
  // Dos Post-its distintos pegados (amarillo y naranja: ~27°) siguen separados.
  const TONO_JUNTAR = 10;
  const COS_JUNTAR = Math.cos(TONO_JUNTAR * Math.PI / 180);

  function juntarCeldas(grilla, cols, filas, celda, w, h, areaMin, areaMax, tonoX, tonoY) {
    const visto = new Uint8Array(cols * filas);
    const cajas = [];
    for (let inicio = 0; inicio < grilla.length; inicio++) {
      const color = grilla[inicio];
      if (!color || visto[inicio]) continue;
      let x0 = cols, x1 = 0, y0 = filas, y1 = 0, total = 0;
      const pila = [inicio], porColor = new Map();
      let sumaX = 0, sumaY = 0; // tono promedio del Post-it mientras crece
      const parecido = t => {
        if (!tonoX) return false;
        const largo = Math.hypot(sumaX, sumaY);
        return largo > 0 && (tonoX[t] * sumaX + tonoY[t] * sumaY) / largo >= COS_JUNTAR;
      };
      const mismo = t => grilla[t] === color || (grilla[t] && parecido(t));
      // Con el ajuste automático se guardan las celdas del borde: así la caja se
      // calcula en la pantalla con la forma real (un Post-it visto de lado o torcido
      // ya no sale más grande que el papel).
      const borde = window.autoAjusteActivo ? [] : null;
      visto[inicio] = 1;
      while (pila.length) {
        const j = pila.pop();
        const x = j % cols, y = (j / cols) | 0;
        total++;
        porColor.set(grilla[j], (porColor.get(grilla[j]) || 0) + 1);
        if (tonoX) { sumaX += tonoX[j]; sumaY += tonoY[j]; }
        if (borde && (x === 0 || y === 0 || x === cols - 1 || y === filas - 1 ||
            !mismo(j - 1) || !mismo(j + 1) || !mismo(j - cols) || !mismo(j + cols))) {
          borde.push(x, y);
        }
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        // vecinos: derecha, izquierda, abajo, arriba (solo del mismo color)
        if (x + 1 < cols)  probar(j + 1);
        if (x > 0)         probar(j - 1);
        if (y + 1 < filas) probar(j + cols);
        if (y > 0)         probar(j - cols);
      }
      function probar(t) { if (!visto[t] && mismo(t)) { visto[t] = 1; pila.push(t); } }

      const area = total * celda * celda;
      if (area >= Math.max(areaMin, AREA_MINIMA) && area <= areaMax && pareceUnPostit(x1 - x0 + 1, y1 - y0 + 1, total)) {
        cajas.push({
          x: x0 * celda / w, y: y0 * celda / h,
          width: (x1 - x0 + 1) * celda / w, height: (y1 - y0 + 1) * celda / h,
          area, color: [...porColor.entries()].sort((a, b) => b[1] - a[1])[0][0] - 1, // el color que más tiene
          borde: borde && { celdas: borde, celda, w, h }
        });
      }
    }
    return cajas;
  }

  // Una celda del borde cuenta aunque el papel la cubra solo en parte (35 %):
  // en promedio sobra un tercio de celda por lado, se descuenta.
  const BORDE_DENTRO = 0.3;

  // Igual que la app original: esquinas → proyector, escala, margen y desplazamiento
  function proyectarCaja(t, b) {
    const esquinas = [
      t.mapper.transform(b.x, b.y), t.mapper.transform(b.x + b.width, b.y),
      t.mapper.transform(b.x + b.width, b.y + b.height), t.mapper.transform(b.x, b.y + b.height)
    ];
    const xs = esquinas.map(p => p.x), ys = esquinas.map(p => p.y);
    let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    if (b.borde) {
      // Cada celda del borde (sus 4 puntas) se lleva a la pantalla y se mide ahí
      const { celdas, celda, w, h } = b.borde;
      minX = minY = Infinity; maxX = maxY = -Infinity;
      for (let k = 0; k < celdas.length; k += 2) {
        for (let q = 0; q < 4; q++) {
          const p = t.mapper.transform((celdas[k] + BORDE_DENTRO + (q & 1) * (1 - 2 * BORDE_DENTRO)) * celda / w,
                                       (celdas[k + 1] + BORDE_DENTRO + (q >> 1) * (1 - 2 * BORDE_DENTRO)) * celda / h);
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        }
      }
    }
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
      <label style="margin-top:12px">Post-its enseñados:</label>
      <p class="vc-nota">¿No ve un Post-it? Tócalo en el video de arriba (o en el celular con «Enseñar Post-it»).
        La app aprende su color con la luz de ahora.</p>
      <div class="vc-colores" id="vcEnsenados"></div>
      <button type="button" class="vc-color on" id="vcOlvidar" style="margin-top:6px;width:100%;justify-content:center">Olvidar los enseñados</button>
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
    const zonaE = document.getElementById('vcEnsenados');
    zonaE.innerHTML = estado.ensenados.length ? '' : '<p class="vc-nota" style="margin:0">Ninguno todavía.</p>';
    estado.ensenados.forEach((c, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'vc-color on';
      b.title = 'Toca para olvidar este color';
      b.innerHTML = `<i style="background:${c.muestra}"></i>${c.nombre}<b>✕</b>`;
      b.onclick = () => { estado.ensenados.splice(n, 1); guardar(); dibujarBotones(); };
      zonaE.appendChild(b);
    });
    document.getElementById('vcOlvidar').hidden = !estado.ensenados.length;
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

  /* ---------- 6. Enseñar un Post-it tocándolo ----------
     Se toca el Post-it en el video (consola o celular). Desde ese punto se
     pinta hacia afuera mientras el color se parezca al tocado: así se mide
     el Post-it entero con la luz de ahora y se guarda un color nuevo con su
     rango. Si el rango también agarra la pared o la pantalla, se angosta; si
     no se puede, se avisa y no se guarda nada.                               */
  const MAX_ENSENADOS = 9;
  let ultimoToque = null; // { x, y, bien, hasta } para dibujar un anillo en el video

  function hsv(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d > 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    return [h, max ? 100 * d / max : 0, 100 * max / 255];
  }
  const difTono = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  const conSigno = (a, b) => ((a - b + 540) % 360) - 180; // a - b entre -180 y 180
  const percentil = (lista, p) => lista[Math.min(lista.length - 1, Math.floor(lista.length * p))];

  function ensenarEn(nx, ny) {
    const t = trackerActual;
    if (estado.modo !== 'varios') return { ok: false, texto: 'Primero elige «Varios colores a la vez» (tecla H, pestaña Cromática).' };
    if (!t || !t.isStreaming || t.demoMode) return { ok: false, texto: 'Primero prende la cámara.' };
    const w = t.procWidth, h = t.procHeight;
    const sx = Math.round(nx * (w - 1)), sy = Math.round(ny * (h - 1));
    if (!(sx >= 0 && sy >= 0 && sx < w && sy < h)) return { ok: false, texto: 'Toca dentro de la imagen.' };
    const datos = t.procCtx.getImageData(0, 0, w, h).data;
    const color = (x, y) => { const i = (y * w + x) * 4; return hsv(datos[i], datos[i + 1], datos[i + 2]); };
    const mal = (texto) => { ultimoToque = { x: nx, y: ny, bien: false, hasta: performance.now() + 1500 }; return { ok: false, texto }; };

    // Color del punto tocado: mediana de un cuadradito de 7x7
    const hs = [], ss = [], vs = [];
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const x = sx + dx, y = sy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const [a, b, c] = color(x, y); hs.push(a); ss.push(b); vs.push(c);
    }
    ss.sort((p, q) => p - q); vs.sort((p, q) => p - q);
    const s0 = percentil(ss, 0.5), v0 = percentil(vs, 0.5);
    const base = hs[Math.floor(hs.length / 2)];
    const tonos = hs.map(x => conSigno(x, base)).sort((p, q) => p - q);
    const h0 = (base + percentil(tonos, 0.5) + 360) % 360;
    if (s0 < 7 || v0 < 18) return mal('Ahí no hay color (es blanco, gris o muy oscuro). Toca el centro del Post-it.');

    // Pintar hacia afuera desde el punto tocado
    const tolTono = s0 < 20 ? 30 : 18;
    const parecido = (x, y) => {
      const [a, b, c] = color(x, y);
      return b >= Math.max(5, s0 * 0.55) && c >= v0 * 0.6 && Math.abs(b - s0) <= Math.max(14, s0 * 0.5) &&
             difTono(a, h0) <= tolTono;
    };
    const visto = new Uint8Array(w * h), cola = [sy * w + sx];
    visto[sy * w + sx] = 1;
    const limite = Math.floor(w * h * 0.08);
    const region = [];
    while (cola.length && region.length <= limite) {
      const k = cola.pop(), x = k % w, y = (k - x) / w;
      if (!parecido(x, y)) continue;
      region.push(k);
      if (x > 0 && !visto[k - 1]) { visto[k - 1] = 1; cola.push(k - 1); }
      if (x < w - 1 && !visto[k + 1]) { visto[k + 1] = 1; cola.push(k + 1); }
      if (y > 0 && !visto[k - w]) { visto[k - w] = 1; cola.push(k - w); }
      if (y < h - 1 && !visto[k + w]) { visto[k + w] = 1; cola.push(k + w); }
    }
    if (region.length > limite) return mal('Ese color se parece a la pared o a la pantalla. Toca justo encima del Post-it.');
    if (region.length < 40) return mal('No encontré un Post-it ahí. Toca el centro del papel.');

    // Rango del color con todos los pixeles del Post-it
    const rt = [], rs = [], rv = [];
    let r = 0, g = 0, b = 0;
    for (const k of region) {
      const i = k * 4, [a, c, d] = hsv(datos[i], datos[i + 1], datos[i + 2]);
      rt.push(conSigno(a, h0)); rs.push(c); rv.push(d);
      r += datos[i]; g += datos[i + 1]; b += datos[i + 2];
    }
    [rt, rs, rv].forEach(l => l.sort((p, q) => p - q));
    const t5 = percentil(rt, 0.05), t95 = percentil(rt, 0.95);
    const nuevo = {
      id: 'ensenado-' + Date.now(),
      h: Math.round((h0 + (t5 + t95) / 2 + 360) % 360),
      tol: Math.round(Math.max(8, Math.min(26, (t95 - t5) / 2 + 6))),
      minS: Math.round(Math.max(5, percentil(rs, 0.05) - 4)),
      maxS: percentil(rs, 0.95) < 28 ? Math.round(Math.min(100, percentil(rs, 0.95) + 10)) : 100,
      minV: Math.round(Math.max(18, percentil(rv, 0.05) - 10)),
      muestra: '#' + [r, g, b].map(x => Math.round(x / region.length).toString(16).padStart(2, '0')).join('')
    };

    // ¿El rango agarra también el fondo? Se cuentan pixeles iguales lejos del Post-it.
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (const k of region) { const x = k % w, y = (k - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const mx = (x1 - x0) * 0.5 + 4, my = (y1 - y0) * 0.5 + 4;
    const fuera = () => {
      let n = 0, total = 0;
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        total++;
        if (x > x0 - mx && x < x1 + mx && y > y0 - my && y < y1 + my) continue;
        const i = (y * w + x) * 4;
        if (colorDelPixel(datos[i], datos[i + 1], datos[i + 2], [nuevo]) === 0) n++;
      }
      return n / total;
    };
    let intento = 0;
    while (fuera() > 0.02 && intento < 6) { nuevo.minS += 4; nuevo.minV += 3; nuevo.tol = Math.max(6, nuevo.tol - 2); intento++; }
    if (fuera() > 0.02) return mal('Ese color se parece mucho al fondo: no lo puedo separar. Prueba con otro color de Post-it.');
    nuevo.nombre = 'Enseñado ' + nuevo.h + '°';

    // Si ya había uno enseñado de color parecido, se reemplaza (queda el de la luz de ahora)
    const igual = estado.ensenados.findIndex(c => difTono(c.h, nuevo.h) < 12 &&
      Math.abs(c.minS - nuevo.minS) < 20 && Math.abs(c.minV - nuevo.minV) < 25);
    let texto;
    if (igual >= 0) { estado.ensenados[igual] = nuevo; texto = 'Color ajustado a la luz de ahora'; }
    else {
      estado.ensenados.push(nuevo);
      if (estado.ensenados.length > MAX_ENSENADOS) estado.ensenados.shift();
      texto = 'Post-it aprendido';
    }
    guardar(); dibujarBotones();
    ultimoToque = { x: nx, y: ny, bien: true, hasta: performance.now() + 1500 };
    // La app vuelve a probar sola que el recuadro de ese Post-it caiga justo (auto-ajuste.js)
    if (window.AutoAjuste && window.AutoAjuste.revisarEn) window.AutoAjuste.revisarEn(nx, ny);
    return { ok: true, texto };
  }

  function olvidarEnsenados() { estado.ensenados = []; guardar(); dibujarBotones(); }

  // Anillo verde (aprendido) o rojo (no se pudo) donde se tocó, sobre el video de la consola
  function marcarToque(t) {
    if (!ultimoToque || performance.now() > ultimoToque.hasta) return;
    const c = t.ctx, pw = t.previewCanvas.width, ph = t.previewCanvas.height;
    c.lineWidth = 3; c.strokeStyle = ultimoToque.bien ? '#22c55e' : '#ef4444';
    c.beginPath(); c.arc(ultimoToque.x * pw, ultimoToque.y * ph, Math.max(8, pw * 0.04), 0, Math.PI * 2); c.stroke();
  }

  // Aviso corto en la PC
  const avisoE = document.createElement('div');
  avisoE.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483001;' +
    'padding:10px 16px;border-radius:8px;font:600 14px system-ui,sans-serif;color:#fff;max-width:90vw;' +
    'box-shadow:0 4px 18px rgba(0,0,0,.35);display:none;text-align:center';
  document.body.appendChild(avisoE);
  let relojAviso = null;
  function avisarPC(r) {
    avisoE.textContent = r.texto;
    avisoE.style.background = r.ok ? '#15803d' : '#b91c1c';
    avisoE.style.display = 'block';
    clearTimeout(relojAviso); relojAviso = setTimeout(() => { avisoE.style.display = 'none'; }, 3500);
  }

  // Tocar el video de la consola. En «varios colores» la pipeta original no sirve,
  // así que el toque enseña el Post-it y no llega a la pipeta.
  const videoConsola = document.getElementById('cameraFeedCanvas');
  if (videoConsola) videoConsola.addEventListener('click', (e) => {
    if (estado.modo !== 'varios') return;
    e.stopImmediatePropagation();
    const caja = videoConsola.getBoundingClientRect();
    avisarPC(ensenarEn((e.clientX - caja.left) / caja.width, (e.clientY - caja.top) / caja.height));
  }, true);
  document.getElementById('vcOlvidar').onclick = () => { olvidarEnsenados(); avisarPC({ ok: true, texto: 'Post-its enseñados olvidados' }); };

  // Para el celular (puente-celular.js) y para probar desde la consola del navegador.
  // x, y van de 0 a 1 en la imagen que procesa la app (ya con el espejo aplicado).
  window.EnsenarPostit = {
    tocar(x, y) { const r = ensenarEn(x, y); avisarPC(r); return r; },
    olvidar() { olvidarEnsenados(); avisarPC({ ok: true, texto: 'Post-its enseñados olvidados' }); },
    lista: () => estado.ensenados.slice()
  };
})();
