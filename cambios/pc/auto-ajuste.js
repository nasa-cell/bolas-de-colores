/*
  AJUSTE AUTOMÁTICO (sin calibrar a mano)
  ---------------------------------------
  La cámara encuentra sola dónde cae la imagen del proyector, mide la luz del
  salón y sigue a cada Post-it: pegas uno y aparece con su tamaño y en su lugar.

  Cómo mide: el proyector muestra 12 cuadritos blancos sobre negro, luego todo
  negro, y otra vez los cuadritos (en total 1 a 3 segundos). La cámara compara esas
  imágenes: lo que se prendió y apagó son los cuadritos. Como la app sabe dónde
  los dibujó, calcula sola las 4 esquinas. Funciona con webcam y con el celular
  (espera a que llegue la imagen del celular antes de medir).

  Lo carga index.html con una línea (después de los otros archivos de «cambios»).
  Si se borra esa línea, la app vuelve a la calibración a mano de siempre.
  En la consola (tecla H → Calibración) está el interruptor «Ajuste automático»:
  apagado = modo manual, todo como antes.

  Bloques:
   1. Estado (prendido / apagado, se recuerda)
   2. Capa de destellos (cuadritos y negro) y fotos de la cámara
   3. Medir: encontrar los cuadritos y calcular las esquinas
   4. Cuentas de la proyección (homografía con muchos puntos)
   5. Cuándo medir: al empezar, al cambiar la ventana, si la cámara se mueve
   6. Seguir Post-its: separar pegados, ignorar a la persona, aparecer y quitar
   7. Luz: bolas más grandes con mucha luz y brillo de la cámara con poca
   8. Interruptor y estado en la consola
*/
(function () {
  'use strict';
  if (typeof ColorTracker === 'undefined' || typeof PhysicsEngine === 'undefined') return;

  /* ---------- 1. Estado ---------- */
  const CLAVE = 'posits-auto-ajuste-v1';
  let auto = true; // prendido por defecto
  try { const g = localStorage.getItem(CLAVE); if (g !== null) auto = g === '1'; } catch (e) {}
  window.autoAjusteActivo = auto;

  let tracker = null;   // detector de la app (se guarda en el primer cuadro)
  let fisica = null;    // motor de bolas de la app
  let ajustando = false;
  let ajustado = false; // ya se midió con la cámara actual
  let sinProyector = false; // se usa la imagen completa de la cámara como pantalla
  // Modo elegido con los botones: 'con' (se ajusta a la proyección) o 'sin' (imagen completa)
  const CLAVE_MODO = 'posits-modo-proyector-v1';
  let modoProyector = 'con';
  try { if (localStorage.getItem(CLAVE_MODO) === 'sin') modoProyector = 'sin'; } catch (e) {}
  let relojReintento = null;
  let ultimoResultado = null;
  let fallos = 0;

  const ahora = () => performance.now();
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const hayFoto = () => !!(window.PuenteCamara && window.PuenteCamara.hayFoto && window.PuenteCamara.hayFoto());

  /* ---------- 2. Capa de destellos y fotos de la cámara ---------- */
  // 12 cuadritos en 4 columnas y 3 filas (proporción de la pantalla, 0 a 1)
  const COLUMNAS = [0.07, 0.36, 0.64, 0.93];
  const FILAS = [0.09, 0.5, 0.91];
  const PUNTOS = [];
  FILAS.forEach(y => COLUMNAS.forEach(x => PUNTOS.push({ x, y })));
  const ESQ = [PUNTOS[0], PUNTOS[3], PUNTOS[11], PUNTOS[8]]; // sup-izq, sup-der, inf-der, inf-izq

  const capa = document.createElement('canvas');
  capa.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483000;display:none;cursor:none';
  document.body.appendChild(capa);
  const cctx = capa.getContext('2d');

  function dibujarCapa(conPuntos) {
    const w = capa.width = window.innerWidth, h = capa.height = window.innerHeight;
    cctx.fillStyle = '#000'; cctx.fillRect(0, 0, w, h);
    // El texto sale igual en las dos imágenes, así no cuenta como cuadrito
    cctx.fillStyle = '#3a3a3a'; cctx.font = '600 18px system-ui, sans-serif'; cctx.textAlign = 'center';
    cctx.fillText('Ajustando la cámara… no tapes la pantalla', w / 2, h * 0.3);
    if (!conPuntos) return;
    const lado = Math.round(Math.min(w, h) * 0.055);
    cctx.fillStyle = '#fff';
    PUNTOS.forEach(p => cctx.fillRect(Math.round(p.x * w - lado / 2), Math.round(p.y * h - lado / 2), lado, lado));
  }

  // Foto de la cámara en blanco y negro, del mismo tamaño y espejo que usa el detector
  const foto = document.createElement('canvas');
  const fctx = foto.getContext('2d', { willReadFrequently: true });
  function sacarFoto() {
    const w = tracker.procWidth, h = tracker.procHeight;
    if (foto.width !== w || foto.height !== h) { foto.width = w; foto.height = h; }
    fctx.save();
    if (tracker.flipX || tracker.flipY) {
      fctx.translate(tracker.flipX ? w : 0, tracker.flipY ? h : 0);
      fctx.scale(tracker.flipX ? -1 : 1, tracker.flipY ? -1 : 1);
    }
    fctx.drawImage(tracker.video, 0, 0, w, h);
    fctx.restore();
    const d = fctx.getImageData(0, 0, w, h).data;
    const gris = new Uint8Array(w * h);
    for (let i = 0, j = 0; j < gris.length; i += 4, j++) gris[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    return { w, h, gris };
  }

  // Parte de la imagen que cambió mucho entre dos fotos (0 a 1)
  function cuantoCambio(a, b) {
    if (!a || !b || a.gris.length !== b.gris.length) return 1;
    let n = 0;
    for (let i = 0; i < a.gris.length; i += 2) if (Math.abs(a.gris[i] - b.gris[i]) > 20) n++;
    return n / (a.gris.length / 2);
  }

  // Espera a que la cámara muestre lo nuevo (el celular llega con retraso)
  // y a que la imagen se quede quieta (la cámara ajusta su brillo sola).
  async function esperarImagen(anterior, maximo) {
    const inicio = ahora();
    let previa = null, quietas = 0, cambio = !anterior;
    while (ahora() - inicio < maximo) {
      await esperar(70);
      const f = sacarFoto();
      if (!cambio) { if (cuantoCambio(f, anterior) > 0.003) cambio = true; else { previa = f; continue; } }
      if (previa && cuantoCambio(f, previa) < 0.0015) quietas++; else quietas = 0;
      previa = f;
      if (quietas >= 2) return { f, ok: true };
    }
    return { f: previa || sacarFoto(), ok: cambio };
  }

  /* ---------- 3. Medir ---------- */
  async function ajustar(motivo) {
    if (ajustando || !auto || modoProyector !== 'con' || !listo()) return;
    ajustando = true;
    estado('Ajustando…');
    try {
      const antes = sacarFoto();
      capa.style.display = 'block';
      dibujarCapa(true);
      const m1 = await esperarImagen(antes, 3000);
      // La cámara no notó el destello: no mira la pantalla. No vale la pena seguir.
      if (!m1.ok) { capa.style.display = 'none'; fallo(); return; }
      dibujarCapa(false);
      const negro = await esperarImagen(m1.f, 3000);
      dibujarCapa(true);
      const m2 = await esperarImagen(negro.f, 3000);
      capa.style.display = 'none';

      const r = (m1.ok && negro.ok) ? calcular(m1.f, m2.f, negro.f) : null;
      if (!r) { fallo(); return; }
      tracker.mapper.srcCorners = r.esquinas;
      tracker.mapper.computeHomography();
      ultimoResultado = r;
      ajustado = true; fallos = 0; sinProyector = false;
      ponerLuz(r.contraste);
      reiniciarSeguimiento();
      prepararVigilancia();
      pintarVista();
      const luzTxt = r.contraste < 0.3 ? 'mucha' : r.contraste < 0.5 ? 'media' : 'poca';
      estado(`Listo · ${r.usados} de 12 puntos · error ${(r.error * 100).toFixed(1).replace('.', ',')} % · luz del salón: ${luzTxt}`);
      aviso(motivo === 'movida' ? 'La cámara se movió: ya me ajusté sola' : 'Cámara ajustada sola');
    } catch (e) {
      console.warn('Ajuste automático:', e);
      fallo();
    } finally {
      capa.style.display = 'none';
      ajustando = false;
    }
  }

  // Modo «Con proyector»: si la cámara no ve la pantalla, se avisa y se reintenta cada 10 s,
  // como máximo 3 intentos. Después para, hasta que se toque «Ajustar ahora», «Con proyector»
  // o se cambie de cámara. Nunca pasa solo a «Sin proyector»: eso se elige con el botón.
  const INTENTOS_MAX = 3;
  function fallo() {
    fallos++;
    clearTimeout(relojReintento);
    if (fallos >= INTENTOS_MAX) {
      // Tras 3 intentos se apaga el ajuste automático: para volver a probar hay que prenderlo
      ponerAuto(false, true);
      estado(`No vi la pantalla en ${INTENTOS_MAX} intentos: apagué el ajuste automático. Préndelo para intentar de nuevo.`);
      aviso(`No vi la pantalla en ${INTENTOS_MAX} intentos: apagué el ajuste automático. Préndelo para intentar de nuevo`, 8000);
      return;
    }
    estado(`No veo la pantalla (intento ${fallos} de ${INTENTOS_MAX}). Apunta la cámara a la proyección: lo intento de nuevo en 10 s.`);
    aviso('No veo la pantalla: apunta la cámara a la proyección', 5000);
    relojReintento = setTimeout(() => {
      if (auto && modoProyector === 'con' && !ajustado && !ajustando) ajustar('reintento');
    }, 10000);
  }

  // Modo «Sin proyector»: toda la imagen de la cámara es la pantalla, sin destellos.
  function usarImagenCompleta() {
    clearTimeout(relojReintento);
    sinProyector = true;
    ajustado = true;
    if (!tracker) return;
    tracker.mapper.srcCorners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    tracker.mapper.computeHomography();
    reiniciarSeguimiento();
    pintarVista();
    estado('Sin proyector: uso la imagen completa de la cámara.');
  }

  // Encuentra los cuadritos: lo que está prendido en las fotos con puntos y apagado en la negra
  function calcular(m1, m2, negro) {
    const { w, h } = negro, n = w * h;
    const dif = new Uint8Array(n);
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) {
      const v = Math.max(0, ((m1.gris[i] + m2.gris[i]) >> 1) - negro.gris[i]);
      dif[i] = v; hist[v]++;
    }
    // Lo más brillante (0,2 % de la imagen) marca cuánto se prenden los cuadritos
    let acum = 0, alto = 255;
    for (let v = 255; v > 0; v--) { acum += hist[v]; if (acum > n * 0.002) { alto = v; break; } }
    if (alto < 18) return null; // casi no cambió nada: la cámara no ve la proyección
    const umbral = Math.max(14, alto * 0.45);

    // Manchas prendidas (grupos de pixeles vecinos)
    const visto = new Uint8Array(n);
    const manchas = [];
    for (let i = 0; i < n; i++) {
      if (visto[i] || dif[i] < umbral) continue;
      let area = 0, sx = 0, sy = 0, sp = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      const pila = [i]; visto[i] = 1;
      while (pila.length) {
        const j = pila.pop(), x = j % w, y = (j / w) | 0, p = dif[j];
        area++; sx += x * p; sy += y * p; sp += p;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x + 1 < w && !visto[j + 1] && dif[j + 1] >= umbral) { visto[j + 1] = 1; pila.push(j + 1); }
        if (x > 0 && !visto[j - 1] && dif[j - 1] >= umbral) { visto[j - 1] = 1; pila.push(j - 1); }
        if (y + 1 < h && !visto[j + w] && dif[j + w] >= umbral) { visto[j + w] = 1; pila.push(j + w); }
        if (y > 0 && !visto[j - w] && dif[j - w] >= umbral) { visto[j - w] = 1; pila.push(j - w); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      if (area < 4 || area > n * 0.02 || bw / bh > 3 || bh / bw > 3) continue;
      // Centro pesado por el brillo: más preciso que un pixel
      manchas.push({ x: (sx / sp + 0.5) / w, y: (sy / sp + 0.5) / h, fuerza: sp / area, area, fondo: negro.gris[((sy / sp) | 0) * w + ((sx / sp) | 0)] });
    }
    if (manchas.length < 4) return null;
    manchas.sort((a, b) => b.area * b.fuerza - a.area * a.fuerza);
    const lista = manchas.slice(0, 16);

    // Las 4 de las puntas: sup-izq tiene x+y mínimo, inf-der máximo, etc.
    const pick = f => lista.reduce((m, p) => (f(p) > f(m) ? p : m), lista[0]);
    const puntas = [pick(p => -(p.x + p.y)), pick(p => p.x - p.y), pick(p => p.x + p.y), pick(p => p.y - p.x)];
    if (new Set(puntas).size < 4) return null;
    let H = homografia(puntas, ESQ);
    if (!H) return null;

    // Cada mancha se lleva al cuadrito esperado más cercano
    let pares = emparejar(lista, H, 0.12);
    if (pares.length < 4) return null;
    H = homografia(pares.map(p => p.cam), pares.map(p => p.pro)) || H;
    // Se quitan las que no calzan y se vuelve a calcular
    pares = emparejar(lista, H, 0.03);
    if (pares.length < 4) return null;
    H = homografia(pares.map(p => p.cam), pares.map(p => p.pro));
    if (!H) return null;

    let suma = 0;
    pares.forEach(p => { const q = aplicar(H, p.cam.x, p.cam.y); suma += Math.hypot(q.x - p.pro.x, q.y - p.pro.y); });
    const error = suma / pares.length;
    if (error > 0.02) return null;

    const inv = invertir(H);
    if (!inv) return null;
    const esquinas = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => aplicar(inv, x, y));
    if (!esquinas.every(c => isFinite(c.x) && isFinite(c.y) && Math.abs(c.x) < 5 && Math.abs(c.y) < 5)) return null;
    // Con pocos puntos el cálculo siempre cuadra aunque sean reflejos (la luz de la pantalla
    // en la cara o la pared). Se piden 8 de 12 y una pantalla con forma de cuadrilátero de verdad.
    if (pares.length < 8) return null;
    let giro = 0, area = 0;
    for (let k = 0; k < 4; k++) {
      const a = esquinas[k], b = esquinas[(k + 1) % 4], c = esquinas[(k + 2) % 4];
      const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      giro += Math.sign(z); area += a.x * b.y - b.x * a.y;
    }
    if (Math.abs(giro) !== 4) return null;          // se cruza o está doblado
    if (Math.abs(area) / 2 < 0.04) return null;      // la pantalla ocupa muy poco de la imagen

    const fuerzas = pares.map(p => p.cam.fuerza).sort((a, b) => a - b);
    const fondos = pares.map(p => p.cam.fondo).sort((a, b) => a - b);
    const fuerza = fuerzas[fuerzas.length >> 1], fondo = fondos[fondos.length >> 1];
    // contraste: qué tanto se nota la luz del proyector frente a la luz del salón
    const contraste = fuerza / Math.max(1, fuerza + fondo);
    return { esquinas, usados: pares.length, error, contraste };
  }

  function emparejar(manchas, H, distMax) {
    const mejor = new Map();
    for (const m of manchas) {
      const q = aplicar(H, m.x, m.y);
      let k = -1, d = Infinity;
      PUNTOS.forEach((p, i) => { const e = Math.hypot(q.x - p.x, q.y - p.y); if (e < d) { d = e; k = i; } });
      if (d < distMax && (!mejor.has(k) || mejor.get(k).d > d)) mejor.set(k, { cam: m, pro: PUNTOS[k], d });
    }
    return [...mejor.values()];
  }

  /* ---------- 4. Cuentas de la proyección ----------
     Homografía: la fórmula que lleva un punto de la cámara a la pantalla del
     proyector. Con más de 4 puntos se usa la que mejor calza con todos.     */
  function homografia(desde, hasta) {
    const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
    const Atb = new Array(8).fill(0);
    for (let i = 0; i < desde.length; i++) {
      const x = desde[i].x, y = desde[i].y, u = hasta[i].x, v = hasta[i].y;
      const filas = [[[x, y, 1, 0, 0, 0, -u * x, -u * y], u], [[0, 0, 0, x, y, 1, -v * x, -v * y], v]];
      for (const [f, b] of filas) {
        for (let r = 0; r < 8; r++) {
          Atb[r] += f[r] * b;
          for (let c = 0; c < 8; c++) AtA[r][c] += f[r] * f[c];
        }
      }
    }
    const s = resolver(AtA, Atb);
    return s ? [...s, 1] : null;
  }

  function resolver(A, b) {
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let fila = i;
      for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[fila][i])) fila = k;
      [A[i], A[fila]] = [A[fila], A[i]]; [b[i], b[fila]] = [b[fila], b[i]];
      if (Math.abs(A[i][i]) < 1e-12) return null;
      for (let k = i + 1; k < n; k++) {
        const c = A[k][i] / A[i][i];
        for (let j = i; j < n; j++) A[k][j] -= c * A[i][j];
        b[k] -= c * b[i];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return x;
  }

  function aplicar(m, x, y) {
    const w = m[6] * x + m[7] * y + m[8];
    return { x: (m[0] * x + m[1] * y + m[2]) / w, y: (m[3] * x + m[4] * y + m[5]) / w };
  }

  function invertir(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (Math.abs(det) < 1e-12) return null;
    return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d].map(v => v / det);
  }

  /* ---------- 5. Cuándo medir ---------- */
  function listo() {
    return tracker && tracker.isStreaming && !tracker.demoMode && tracker.video.readyState >= 2 && !hayFoto();
  }

  let streamVisto = null, tamVisto = '', desdeListo = 0;
  function revisarArranque() {
    if (!auto || ajustando || !listo()) { desdeListo = 0; return; }
    const tam = tracker.procWidth + 'x' + tracker.procHeight;
    // Cámara nueva o celular girado: se vuelve a medir
    if (tracker.stream !== streamVisto || tam !== tamVisto) {
      if (streamVisto && tam !== tamVisto && ajustado) aviso('La imagen de la cámara cambió: me ajusto de nuevo');
      streamVisto = tracker.stream; tamVisto = tam; ajustado = false; sinProyector = false; fallos = 0; desdeListo = ahora();
    }
    if (!ajustado && fallos === 0 && desdeListo && ahora() - desdeListo > 1200) {
      desdeListo = 0;
      if (modoProyector === 'sin') usarImagenCompleta(); else ajustar('inicio');
    }
  }

  // Si cambia el tamaño de la ventana (pantalla completa, tecla F), la imagen cae en otro lugar
  let relojVentana = null;
  window.addEventListener('resize', () => {
    if (!auto) return;
    clearTimeout(relojVentana);
    relojVentana = setTimeout(() => { if (ajustado && !sinProyector && !ajustando) ajustar('ventana'); }, 900);
  });

  // Pantalla completa al iniciar (el navegador solo deja hacerlo al tocar un botón)
  const botonInicio = document.getElementById('startCameraBtn');
  if (botonInicio) botonInicio.addEventListener('click', () => {
    if (auto && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, true);

  // ¿Se movió la cámara? Se compara una imagen chica con la guardada al medir,
  // probando correrla unos pixeles: si corrida calza mucho mejor, la cámara se movió.
  const CH_W = 64, CH_H = 36;
  const chica = document.createElement('canvas'); chica.width = CH_W; chica.height = CH_H;
  const chctx = chica.getContext('2d', { willReadFrequently: true });
  function imagenChica() {
    chctx.drawImage(tracker.procCanvas, 0, 0, CH_W, CH_H);
    const d = chctx.getImageData(0, 0, CH_W, CH_H).data;
    const g = new Float32Array(CH_W * CH_H);
    for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    return g;
  }
  function errorCorrido(a, b, dx, dy) {
    let s = 0, n = 0;
    for (let y = 3; y < CH_H - 3; y++) for (let x = 3; x < CH_W - 3; x++) {
      s += Math.abs(a[y * CH_W + x] - b[(y + dy) * CH_W + x + dx]); n++;
    }
    return s / n;
  }
  let referencia = null, refDesde = 0, sospechas = 0, cambiosTotales = 0;
  function prepararVigilancia() { referencia = null; refDesde = ahora() + 1500; sospechas = 0; cambiosTotales = 0; }
  setInterval(() => {
    if (!auto || !ajustado || sinProyector || ajustando || !listo() || ahora() < refDesde) return;
    const g = imagenChica();
    if (!referencia) { referencia = g; return; }
    const e0 = errorCorrido(referencia, g, 0, 0);
    let mejor = e0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (dx || dy) mejor = Math.min(mejor, errorCorrido(referencia, g, dx, dy));
    }
    sospechas = (e0 > 4 && mejor < e0 * 0.7) ? sospechas + 1 : 0;
    let grandes = 0;
    for (let i = 0; i < g.length; i++) if (Math.abs(g[i] - referencia[i]) > 22) grandes++;
    cambiosTotales = grandes / g.length > 0.55 ? cambiosTotales + 1 : 0;
    if (sospechas >= 3 || cambiosTotales >= 4) { ajustar('movida'); return; }
    // Cambios chicos de luz: la referencia se actualiza de a poco
    if (e0 < 3) for (let i = 0; i < g.length; i++) referencia[i] = referencia[i] * 0.9 + g[i] * 0.1;
  }, 500);

  /* ---------- 6. Seguir Post-its ---------- */
  const ESPERA_APARECER = 500;   // ms quieto para aparecer
  const ESPERA_QUITAR = 700;     // ms sin verlo para quitarlo
  const TAPADO_MAX = 30000;      // si alguien lo tapa, se guarda hasta 30 s
  const AREA_MAX = 0.05;         // más de 5 % de la pantalla no es un Post-it (ropa, cartel)
  let pistas = [];
  let confirmarYa = 0;
  let previaMov = null, movimiento = null;

  function reiniciarSeguimiento() { pistas = []; confirmarYa = ahora() + 1200; previaMov = null; }

  // Qué partes de la imagen se movieron desde el cuadro anterior (persona, brazo)
  function medirMovimiento() {
    const g = imagenChica();
    const mov = new Uint8Array(g.length);
    if (previaMov) {
      for (let y = 0; y < CH_H; y++) for (let x = 0; x < CH_W; x++) {
        const i = y * CH_W + x;
        if (Math.abs(g[i] - previaMov[i]) > 18) {
          for (let yy = Math.max(0, y - 1); yy <= Math.min(CH_H - 1, y + 1); yy++)
            for (let xx = Math.max(0, x - 1); xx <= Math.min(CH_W - 1, x + 1); xx++) mov[yy * CH_W + xx] = 1;
        }
      }
    }
    previaMov = g;
    movimiento = mov;
  }

  // Brillo medio alrededor de la caja (un anillo en la imagen chica de la cámara).
  // Si alguien se pone delante, el anillo cambia; si solo se quitó el Post-it, no.
  function brilloAlrededor(caja) {
    const inv = tracker.mapper.invMatrix;
    if (!previaMov || !inv) return null;
    let s = 0, n = 0;
    for (let k = 0; k < 24; k++) {
      const ang = k / 24 * Math.PI * 2;
      const u = caja.x + caja.width * (0.5 + Math.cos(ang) * 1.1), v = caja.y + caja.height * (0.5 + Math.sin(ang) * 1.1);
      const c = aplicar(inv, u, v);
      const x = Math.floor(c.x * CH_W), y = Math.floor(c.y * CH_H);
      if (x < 0 || y < 0 || x >= CH_W || y >= CH_H) continue;
      s += previaMov[y * CH_W + x]; n++;
    }
    return n ? s / n : null;
  }

  // Parte de la zona alrededor de la caja donde hay movimiento en la cámara.
  // Se mira una zona más grande que el Post-it: una persona o un brazo mueven
  // mucho alrededor; una bola que pasa mueve solo un puntito.
  function partesMovidas(caja, crecer) {
    const inv = tracker.mapper.invMatrix;
    if (!movimiento || !inv) return 0;
    const x0 = caja.x - caja.width * crecer, y0 = caja.y - caja.height * crecer;
    const an = caja.width * (1 + 2 * crecer), al = caja.height * (1 + 2 * crecer);
    let total = 0, movidas = 0;
    for (let k = 0; k < 36; k++) {
      const u = x0 + an * ((k % 6) + 0.5) / 6, v = y0 + al * (((k / 6) | 0) + 0.5) / 6;
      const c = aplicar(inv, u, v);
      const x = Math.floor(c.x * CH_W), y = Math.floor(c.y * CH_H);
      if (x < 0 || y < 0 || x >= CH_W || y >= CH_H) continue;
      total++; if (movimiento[y * CH_W + x]) movidas++;
    }
    return total ? movidas / total : 0;
  }

  // Dos o más Post-its pegados en fila se parten en partes iguales.
  // Medida de un Post-it suelto: se toma de los que se ven solos (casi cuadrados) y se
  // recuerda. Sin esa medida se usa la forma (los Post-its son cuadrados).
  let medida = null; // { w, h } en proporción de la pantalla
  function aprenderMedida(dets, W, H) {
    const sueltos = dets.filter(d => {
      const r = (d.width * W) / (d.height * H);
      // un pedacito (Post-it tapado a medias) no sirve de medida
      return r > 0.7 && r < 1.4 && (!medida || d.width * d.height > medida.w * medida.h * 0.6);
    });
    if (!sueltos.length) return;
    const med = k => { const v = sueltos.map(d => d[k]).sort((x, y) => x - y); return v[v.length >> 1]; };
    const w = med('width'), h = med('height');
    medida = medida ? { w: medida.w * 0.8 + w * 0.2, h: medida.h * 0.8 + h * 0.2 } : { w, h };
  }

  function cuantos(d, W, H, estricto) {
    const r = (d.width * W) / (d.height * H);
    const horizontal = r >= 1;
    if (medida) {
      const largo = horizontal ? d.width / medida.w : d.height / medida.h;
      const ancho = horizontal ? d.height / medida.h : d.width / medida.w;
      const n = Math.round(largo);
      if (ancho > 0.6 && ancho < 1.5 && n >= 2 && n <= 5 && Math.abs(largo - n) < (estricto ? 0.3 : 0.5)) return { n, horizontal };
      if (ancho > 0.6 && ancho < 1.5 && n < 2) return { n: 1, horizontal };
    }
    const largo = horizontal ? r : 1 / r, n = Math.round(largo);
    if (largo < 1.75 || n > 5 || Math.abs(largo - n) > 0.35) return { n: 1, horizontal };
    return { n, horizontal };
  }

  function pieza(d, desde, hasta, horizontal) {
    const p = horizontal
      ? { x: d.x + d.width * desde, y: d.y, width: d.width * (hasta - desde), height: d.height }
      : { x: d.x, y: d.y + d.height * desde, width: d.width, height: d.height * (hasta - desde) };
    p.color = d.color; p.partida = true;
    p.corners = [{ x: p.x, y: p.y }, { x: p.x + p.width, y: p.y }, { x: p.x + p.width, y: p.y + p.height }, { x: p.x, y: p.y + p.height }];
    return p;
  }

  // En partes iguales (cuando no se ve la línea entre papeles)
  function partirIgual(d, estricto) {
    const W = fisica ? fisica.width : window.innerWidth, H = fisica ? fisica.height : window.innerHeight;
    const { n, horizontal } = cuantos(d, W, H, estricto);
    if (n < 2) return [d];
    const piezas = [];
    for (let k = 0; k < n; k++) piezas.push(pieza(d, k / n, (k + 1) / n, horizontal));
    return piezas;
  }

  function partir(d) {
    // Primero por las líneas que se ven entre papeles (deteccion-colores.js las busca)
    if (d.cortes && d.cortes.lista.length) {
      const bordes = [0, ...d.cortes.lista, 1];
      const piezas = [];
      for (let k = 0; k < bordes.length - 1; k++) piezas.push(...partirIgual(pieza(d, bordes[k], bordes[k + 1], d.cortes.horizontal), true));
      return piezas;
    }
    return partirIgual(d);
  }

  let ultimoPaso = null;
  const r4 = c => [c.x, c.y, c.width, c.height].map(v => +v.toFixed(3));
  const centro = c => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });

  function seguir(nuevas) {
    const t = ahora();
    medirMovimiento();
    let dets = [];
    aprenderMedida(nuevas, fisica ? fisica.width : window.innerWidth, fisica ? fisica.height : window.innerHeight);
    nuevas.forEach(d => { dets.push(...partir(d)); });
    // Muy grande para ser un Post-it (cara, ropa, cartel): fuera
    dets = dets.filter(d => d.width * d.height <= AREA_MAX && (!medida || d.width * d.height <= medida.w * medida.h * 2.2));
    // Sin proyector el Post-it se sostiene con la mano: los dedos tienen color de Post-it naranja.
    // Un recuadro mucho más chico que toca a otro Post-it es la mano, no un Post-it.
    if (sinProyector) {
      const toca = (a, b, m) => a.x < b.x + b.width + m && b.x < a.x + a.width + m && a.y < b.y + b.height + m && b.y < a.y + a.height + m;
      dets = dets.filter(d => !dets.some(o => o !== d && o.width * o.height > d.width * d.height * 2.2 &&
        toca(d, o, 0.25 * Math.min(o.width, o.height))));
    }

    ultimoPaso = { nuevas: nuevas.map(r4), dets: dets.map(r4), medida: medida && [medida.w, medida.h].map(v => +v.toFixed(3)) };
    pistas.forEach(p => { p.visto = false; });
    for (const d of dets) {
      const cd = centro(d);
      let mejor = null, dist = Infinity;
      for (const p of pistas) {
        if (p.visto) continue;
        const cp = centro(p), e = Math.hypot(cd.x - cp.x, cd.y - cp.y);
        if (e < dist && e < 0.6 * Math.max(p.width, p.height, d.width, d.height)) { dist = e; mejor = p; }
      }
      // Sin proyector (cámara que mira la habitación, Post-it en la mano): el recuadro sigue
      // al Post-it tal cual; las reglas de «alguien pasa por delante» son para la pizarra.
      const seMueve = !sinProyector && partesMovidas(d, 1) > 0.3;
      if (mejor) {
        mejor.visto = true;
        mejor.ultimaVez = t; mejor.tapadoDesde = 0;
        if (!seMueve) mejor.anillo = brilloAlrededor(mejor);
        if (seMueve && mejor.confirmado) continue; // algo pasa por delante: se deja donde estaba
        if (!mejor.confirmado) {
          // todavía se está moviendo (lo están pegando). En la mano tiembla un poco: se tolera más.
          if (dist > (sinProyector ? 0.06 : 0.02) || seMueve) mejor.desde = t;
          Object.assign(mejor, { x: d.x, y: d.y, width: d.width, height: d.height, corners: d.corners, color: d.color });
          if (t - mejor.desde >= ESPERA_APARECER || t < confirmarYa) mejor.confirmado = true;
        } else if (!sinProyector && d.width * d.height < mejor.width * mejor.height * 0.7 && !d.partida) {
          // Se ve más chico y no es porque se separaron: lo están tapando en parte. Se deja como estaba.
          continue;
        } else if (Math.abs(d.width - mejor.width) > mejor.width * 0.3 || Math.abs(d.height - mejor.height) > mejor.height * 0.3) {
          // cambió mucho de tamaño (se separaron dos pegados): se toma la medida nueva de una vez
          Object.assign(mejor, { x: d.x, y: d.y, width: d.width, height: d.height, corners: d.corners, color: d.color });
        } else {
          const f = 0.5; // suavizado: quita el temblor sin quedar atrasado
          mejor.x = mejor.x * f + d.x * (1 - f); mejor.y = mejor.y * f + d.y * (1 - f);
          mejor.width = mejor.width * f + d.width * (1 - f); mejor.height = mejor.height * f + d.height * (1 - f);
          mejor.corners = d.corners; mejor.color = d.color || mejor.color;
        }
      } else if (!seMueve || sinProyector) {
        pistas.push({ x: d.x, y: d.y, width: d.width, height: d.height, corners: d.corners, color: d.color,
          desde: t, ultimaVez: t, confirmado: t < confirmarYa, visto: true, tapadoDesde: 0, anillo: brilloAlrededor(d) });
      }
    }

    pistas = pistas.filter(p => {
      if (p.visto) return true;
      if (!p.confirmado) return t - p.ultimaVez < 300;
      if (sinProyector) return t - p.ultimaVez < 400; // sin proyector no se guarda nada tapado
      const ahoraAnillo = brilloAlrededor(p);
      const anilloCambio = p.anillo != null && ahoraAnillo != null && Math.abs(ahoraAnillo - p.anillo) > 18;
      if (partesMovidas(p, 1.5) > 0.3 || anilloCambio) {     // alguien lo tapa: se guarda
        if (!p.tapadoDesde) p.tapadoDesde = t;
        p.ultimaVez = t;
        return t - p.tapadoDesde < TAPADO_MAX;
      }
      return t - p.ultimaVez < ESPERA_QUITAR;
    });

    // Si dos quedaron encima del mismo Post-it, se deja la más chica (la grande era
    // de cuando estaban juntos sin separar)
    const solape = (a, b) => {
      const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      return w > 0 && h > 0 ? (w * h) / Math.min(a.width * a.height, b.width * b.height) : 0;
    };
    pistas = pistas.filter((p, i) => !pistas.some((o, j) => j !== i && o.confirmado && p.confirmado &&
      solape(p, o) > 0.5 && (o.width * o.height < p.width * p.height || (o.width * o.height === p.width * p.height && j > i))));

    return pistas.filter(p => p.confirmado).map(p => ({
      x: p.x, y: p.y, width: p.width, height: p.height, corners: p.corners, color: p.color, lifetime: 1, missCount: 0
    }));
  }

  // Se reemplaza el suavizado de la app por el seguimiento (solo en automático)
  const suavizarOriginal = ColorTracker.prototype.smoothObstacles;
  ColorTracker.prototype.smoothObstacles = function (nuevas) {
    if (!auto || this.demoMode) return suavizarOriginal.call(this, nuevas);
    tracker = this;
    this.obstacles = seguir(nuevas || []);
  };

  // Cada cuadro: guardar el detector, no detectar mientras se mide, brillo y
  // sin las compensaciones a mano (en automático no hacen falta; se guardan para el manual)
  const procesarAnterior = ColorTracker.prototype.processFrame;
  ColorTracker.prototype.processFrame = function () {
    tracker = this;
    if (!auto) {
      if (this.procCtx.filter !== 'none') this.procCtx.filter = 'none';
      return procesarAnterior.call(this);
    }
    revisarArranque();
    if (ajustando) return this.obstacles || [];
    medirBrillo(this);
    marcarBolas(this);
    const guardado = [this.manualOffsetX, this.manualOffsetY, this.manualScaleX, this.manualScaleY, this.sizeOffset];
    this.manualOffsetX = 0; this.manualOffsetY = 0; this.manualScaleX = 1; this.manualScaleY = 1; this.sizeOffset = 0;
    try {
      return procesarAnterior.call(this);
    } finally {
      [this.manualOffsetX, this.manualOffsetY, this.manualScaleX, this.manualScaleY, this.sizeOffset] = guardado;
    }
  };

  // Marca en la cuadrícula del detector (celdas de 3 px) dónde la app dibuja bolas,
  // para que su luz de color no se confunda con un Post-it.
  let tapa = null;
  function marcarBolas(t) {
    const inv = t.mapper.invMatrix;
    const cols = Math.floor(t.procWidth / 3), filas = Math.floor(t.procHeight / 3);
    if (!tapa || tapa.length !== cols * filas) tapa = new Uint8Array(cols * filas); else tapa.fill(0);
    window.autoAjusteTapa = tapa;
    if (!fisica || !inv || !fisica.balls) return;
    const W = fisica.width, H = fisica.height;
    const todas = fisica.balls;
    for (const b of todas) {
      const c = aplicar(inv, b.x / W, b.y / H);
      const o = aplicar(inv, (b.x + b.radius * 1.15 + 1) / W, b.y / H);
      const o2 = aplicar(inv, b.x / W, (b.y + b.radius * 1.15 + 1) / H);
      const rx = Math.hypot(o.x - c.x, o.y - c.y) * cols, ry = Math.hypot(o2.x - c.x, o2.y - c.y) * filas;
      const r = Math.max(rx, ry) + 1;
      const cx = c.x * cols, cy = c.y * filas;
      for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(filas - 1, Math.ceil(cy + r)); y++) {
        for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(cols - 1, Math.ceil(cx + r)); x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) tapa[y * cols + x] = 1;
        }
      }
    }
    // Lo que ya es un Post-it no se tapa: si una bola cae encima, el Post-it no se achica
    for (const p of pistas) {
      if (!p.confirmado) continue;
      const q = [[p.x, p.y], [p.x + p.width, p.y], [p.x + p.width, p.y + p.height], [p.x, p.y + p.height]].map(([u, v]) => aplicar(inv, u, v));
      const x0 = Math.max(0, Math.floor(Math.min(...q.map(e => e.x)) * cols)), x1 = Math.min(cols - 1, Math.ceil(Math.max(...q.map(e => e.x)) * cols));
      const y0 = Math.max(0, Math.floor(Math.min(...q.map(e => e.y)) * filas)), y1 = Math.min(filas - 1, Math.ceil(Math.max(...q.map(e => e.y)) * filas));
      for (let y = y0; y <= y1; y++) tapa.fill(0, y * cols + x0, y * cols + x1 + 1);
    }
  }

  /* ---------- 7. Luz ---------- */
  let factorLuz = 1, radioBase = null, radioPuesto = null;
  function ponerLuz(contraste) {
    // Con mucha luz en el salón la proyección se ve lavada: bolas más grandes y borde más grueso
    factorLuz = contraste < 0.3 ? 1.6 : contraste < 0.5 ? 1.3 : 1;
  }

  const actualizarAnterior = PhysicsEngine.prototype.update;
  PhysicsEngine.prototype.update = function (obstaculos, tiempo) {
    fisica = this;
    if (radioPuesto === null || this.ballRadius !== radioPuesto) radioBase = this.ballRadius; // lo cambió el control
    const quiero = auto ? Math.round(radioBase * factorLuz) : radioBase;
    this.ballRadius = radioPuesto = quiero;
    return actualizarAnterior.call(this, obstaculos, tiempo);
  };

  const marcosAnterior = PhysicsEngine.prototype.drawStickerHighlights;
  PhysicsEngine.prototype.drawStickerHighlights = function (obstaculos) {
    marcosAnterior.call(this, obstaculos);
    if (!auto || factorLuz <= 1) return;
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    this.ctx.lineWidth = 2.5 * factorLuz;
    for (const ob of obstaculos) this.ctx.strokeRect(ob.x * this.width, ob.y * this.height, ob.width * this.width, ob.height * this.height);
    this.ctx.restore();
  };

  // Con poca luz la cámara entrega todo oscuro: se le sube el brillo antes de buscar colores
  let ganancia = 1, ultimaMedida = 0;
  function medirBrillo(t) {
    if (ahora() - ultimaMedida < 1000 || !t.mapper.matrix) return;
    ultimaMedida = ahora();
    chctx.drawImage(t.procCanvas, 0, 0, CH_W, CH_H);
    const d = chctx.getImageData(0, 0, CH_W, CH_H).data;
    let s = 0, n = 0;
    for (let y = 0; y < CH_H; y += 2) for (let x = 0; x < CH_W; x += 2) {
      const p = t.mapper.transform((x + 0.5) / CH_W, (y + 0.5) / CH_H);
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue; // solo dentro de la proyección
      const i = (y * CH_W + x) * 4;
      s += Math.max(d[i], d[i + 1], d[i + 2]); n++;
    }
    if (n < 20) return;
    const medio = s / n;                       // ya incluye el brillo puesto
    ganancia = Math.min(1.8, Math.max(1, ganancia * Math.pow(140 / Math.max(1, medio), 0.3)));
    t.procCtx.filter = ganancia > 1.02 ? `brightness(${ganancia.toFixed(2)})` : 'none';
  }

  /* ---------- 8. Interruptor y estado en la consola ---------- */
  document.head.insertAdjacentHTML('beforeend', `<style>
    .aa-caja { border: 1px solid var(--accent-cyan, #38bdf8); border-radius: 8px; padding: 12px; margin-bottom: 14px; }
    .aa-caja .btn { width: 100%; margin-top: 8px; }
    .aa-estado { font-size: 12px; margin-top: 8px; color: var(--text-secondary, #94a3b8); }
    .aa-apagado { opacity: .4; pointer-events: none; }
    .aa-modo { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px; }
    .aa-modo button { font: 600 12px var(--font-main, system-ui); padding: 9px 4px; border-radius: 6px; cursor: pointer;
      border: 1px solid var(--border-subtle, #334155); background: var(--bg-card, #1e293b); color: var(--text-secondary, #cbd5e1); }
    .aa-modo button.on { border-color: var(--accent-cyan, #38bdf8); color: var(--accent-cyan, #38bdf8); background: rgba(56,189,248,.12); }
    .aa-modo button:disabled { opacity: .4; cursor: default; }
    .aa-aviso { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147482000;
      background: rgba(15,23,42,.92); color: #fff; font: 600 15px system-ui, sans-serif; padding: 10px 18px;
      border-radius: 10px; max-width: min(92vw, 640px); text-align: center; opacity: 0; transition: opacity .3s; pointer-events: none; }
    .aa-aviso.ver { opacity: 1; }
  </style>`);

  const cartel = document.createElement('div');
  cartel.className = 'aa-aviso';
  document.body.appendChild(cartel);
  let relojCartel = null;
  function aviso(texto, ms = 3500) {
    cartel.textContent = texto; cartel.classList.add('ver');
    clearTimeout(relojCartel); relojCartel = setTimeout(() => cartel.classList.remove('ver'), ms);
  }

  const pestana = document.getElementById('tab-calibration');
  const caja = document.createElement('div');
  caja.className = 'control-group aa-caja';
  caja.innerHTML = `
    <div class="toggle-row">
      <label for="autoAjusteToggle">Ajuste automático</label>
      <input type="checkbox" id="autoAjusteToggle" class="switch-input" ${auto ? 'checked' : ''}>
    </div>
    <span class="field-hint">La cámara encuentra sola dónde cae la proyección, mide la luz y sigue a los Post-its. Apágalo para usar las 4 esquinas a mano (modo manual).</span>
    <div class="aa-modo" id="aaModo">
      <button type="button" data-modo="con">Con proyector</button>
      <button type="button" data-modo="sin">Sin proyector</button>
    </div>
    <button type="button" id="autoAjusteAhora" class="btn btn-primary">Ajustar ahora</button>
    <div class="aa-estado" id="autoAjusteEstado">Esperando la cámara…</div>`;
  if (pestana) {
    const intro = pestana.querySelector('.section-intro');
    if (intro) intro.after(caja); else pestana.prepend(caja);
  }
  const textoEstado = caja.querySelector('#autoAjusteEstado');
  function estado(t) { textoEstado.textContent = t; }

  const partesManuales = pestana ? [...pestana.querySelectorAll('.corner-selector-row, .button-row, .fine-tuning-box, .calibration-preview-container')] : [];
  function mostrarModo() {
    partesManuales.forEach(el => el.classList.toggle('aa-apagado', auto));
    caja.querySelector('#autoAjusteAhora').disabled = !auto || modoProyector !== 'con';
    caja.querySelectorAll('#aaModo button').forEach(b => {
      b.classList.toggle('on', b.dataset.modo === modoProyector);
      b.disabled = !auto;
    });
    if (!auto) estado('Modo manual: mueve las 4 esquinas como antes.');
  }

  // Cambia entre «Con proyector» y «Sin proyector» (botones de la consola o del celular)
  function cambiarModo(nuevo) {
    if (nuevo !== 'con' && nuevo !== 'sin') nuevo = modoProyector === 'con' ? 'sin' : 'con';
    modoProyector = nuevo;
    try { localStorage.setItem(CLAVE_MODO, nuevo); } catch (x) {}
    // Elegir «Con proyector» (también desde el celular) vuelve a prender el ajuste automático
    if (nuevo === 'con' && !auto) ponerAuto(true, true);
    clearTimeout(relojReintento);
    if (auto) {
      if (nuevo === 'sin') usarImagenCompleta();
      else {
        ajustado = false; sinProyector = false; fallos = 0;
        if (tracker) tracker.mapper.resetCorners();
        reiniciarSeguimiento();
        estado('Ajustando…');
        if (listo()) ajustar('boton'); else desdeListo = ahora();
      }
    }
    mostrarModo();
    aviso(nuevo === 'con' ? 'Con proyector' : 'Sin proyector: uso la imagen completa de la cámara');
    window.dispatchEvent(new CustomEvent('posits-modo', { detail: nuevo }));
  }
  caja.querySelectorAll('#aaModo button').forEach(b => b.addEventListener('click', () => cambiarModo(b.dataset.modo)));

  // Prende o apaga el ajuste automático (interruptor, botón del celular o tras 3 intentos fallidos)
  function ponerAuto(valor, callado) {
    clearTimeout(relojReintento);
    auto = valor;
    caja.querySelector('#autoAjusteToggle').checked = valor;
    window.autoAjusteActivo = auto;
    try { localStorage.setItem(CLAVE, auto ? '1' : '0'); } catch (x) {}
    pistas = [];
    if (tracker) { tracker.obstacles = []; tracker.procCtx.filter = 'none'; }
    if (auto) { ajustado = false; sinProyector = false; fallos = 0; desdeListo = ahora(); estado('Ajustando…'); }
    mostrarModo();
    if (!callado) aviso(auto ? 'Ajuste automático prendido' : 'Modo manual');
  }
  caja.querySelector('#autoAjusteToggle').addEventListener('change', (e) => ponerAuto(e.target.checked));
  caja.querySelector('#autoAjusteAhora').addEventListener('click', () => {
    fallos = 0;
    if (modoProyector !== 'con') { aviso('«Ajustar ahora» es para el modo «Con proyector»'); return; }
    if (!listo()) { aviso(hayFoto() ? 'Con una foto subida no se puede medir: quita la foto primero' : 'Primero inicia la cámara'); return; }
    ajustar('boton');
  });
  mostrarModo();

  // Vista previa de la consola: la imagen de la cámara con el cuadro que se midió
  function pintarVista() {
    const lienzo = document.getElementById('calibrationCanvas');
    if (!lienzo || !tracker) return;
    const c = lienzo.getContext('2d'), w = lienzo.width, h = lienzo.height;
    c.fillStyle = '#060a12'; c.fillRect(0, 0, w, h);
    c.drawImage(tracker.procCanvas, 0, 0, w, h);
    const e = tracker.mapper.srcCorners;
    c.strokeStyle = '#22c55e'; c.lineWidth = 2; c.beginPath();
    e.forEach((p, i) => (i ? c.lineTo(p.x * w, p.y * h) : c.moveTo(p.x * w, p.y * h)));
    c.closePath(); c.stroke();
  }

  // Para revisar desde la consola del navegador
  window.AutoAjuste = {
    ajustar: () => ajustar('boton'),
    modo: () => modoProyector,
    cambiarModo,
    paso: () => ultimoPaso,
    estado: () => ({ auto, modo: modoProyector, ajustado, sinProyector, ajustando, fallos, resultado: ultimoResultado, factorLuz, ganancia, pistas: pistas.length,
      postits: tracker ? (tracker.obstacles || []).map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height })) : [] })
  };
})();
