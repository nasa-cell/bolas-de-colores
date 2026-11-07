/*
  SEGUIMIENTO DE POST-ITS Y LUZ
  -----------------------------
  Sigue a cada Post-it: pegas uno y aparece con su tamaño y en su lugar; separa los
  pegados e ignora a la persona que pasa. Avisa cuando la cámara se mueve y cuida el
  brillo de la imagen. El ajuste de la cámara lo hace la tecla A (a-transparencia.js),
  que este archivo carga al final.

  Bloques:
   1. Estado
   2. Cuentas de la proyección (homografía con muchos puntos)
   3. Arranque de la cámara y aviso si se mueve
   4. Seguir Post-its: separar pegados, ignorar a la persona, aparecer y quitar
   5. Luz: bolas más grandes con mucha luz y brillo de la cámara con poca
   6. Modo sin proyector en la consola y avisos
*/
(function () {
  'use strict';
  if (typeof ColorTracker === 'undefined' || typeof PhysicsEngine === 'undefined') return;

  /* ---------- 1. Estado ---------- */
  window.autoAjusteActivo = true; // deteccion-colores.js lo usa para partir Post-its y tapar las bolas

  let tracker = null;   // detector de la app (se guarda en el primer cuadro)
  let fisica = null;    // motor de bolas de la app
  let ajustado = false; // ya hay un ajuste hecho con la tecla A (o modo sin proyector)
  let sinProyector = false; // se usa la imagen completa de la cámara como pantalla
  const CLAVE_MODO = 'posits-modo-proyector-v1';
  let modoProyector = 'con';
  try { if (localStorage.getItem(CLAVE_MODO) === 'sin') modoProyector = 'sin'; } catch (e) {}

  const ahora = () => performance.now();
  const hayFoto = () => !!(window.PuenteCamara && window.PuenteCamara.hayFoto && window.PuenteCamara.hayFoto());

  // Modo «Sin proyector»: toda la imagen de la cámara es la pantalla.
  function usarImagenCompleta() {
    sinProyector = true;
    ajustado = true;
    if (!tracker) return;
    tracker.mapper.srcCorners = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    tracker.mapper.computeHomography();
    reiniciarSeguimiento();
    pintarVista();
    estado('Sin proyector: uso la imagen completa de la cámara.');
  }

  /* ---------- 2. Cuentas de la proyección ----------
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

  /* ---------- 3. Arranque de la cámara y aviso si se mueve ---------- */
  function listo() {
    return tracker && tracker.isStreaming && !tracker.demoMode && tracker.video.readyState >= 2 && !hayFoto();
  }

  // Cámara nueva o celular girado: a-transparencia.js decide si recupera el ajuste o empieza de cero
  let streamVisto = null, tamVisto = '';
  function revisarArranque() {
    if (!listo()) return;
    const tam = tracker.procWidth + 'x' + tracker.procHeight;
    if (tracker.stream === streamVisto && tam === tamVisto) return;
    const primera = !streamVisto;
    streamVisto = tracker.stream; tamVisto = tam;
    if (modoProyector === 'sin') { usarImagenCompleta(); return; }
    sinProyector = false;
    window.dispatchEvent(new CustomEvent('posits-camara-lista', { detail: { primera, tam } }));
  }

  // Si cambia el tamaño de la ventana (pantalla completa, tecla F), la imagen cae en otro lugar
  let relojVentana = null;
  window.addEventListener('resize', () => {
    clearTimeout(relojVentana);
    relojVentana = setTimeout(() => {
      if (ajustado && !sinProyector) window.dispatchEvent(new CustomEvent('posits-ventana-cambio'));
    }, 900);
  });

  // Pantalla completa al iniciar (el navegador solo deja hacerlo al tocar un botón)
  const botonInicio = document.getElementById('startCameraBtn');
  if (botonInicio) botonInicio.addEventListener('click', () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
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
    if (!ajustado || sinProyector || !listo() || ahora() < refDesde) return;
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
    if (sospechas >= 3 || cambiosTotales >= 4) {
      prepararVigilancia();
      window.dispatchEvent(new CustomEvent('posits-camara-movida'));
      return;
    }
    // Cambios chicos de luz: la referencia se actualiza de a poco
    if (e0 < 3) for (let i = 0; i < g.length; i++) referencia[i] = referencia[i] * 0.9 + g[i] * 0.1;
  }, 500);

  /* ---------- 4. Seguir Post-its ---------- */
  const ESPERA_APARECER = 500;   // ms quieto para aparecer
  const ESPERA_APARECER_RAPIDO = 250; // igual, mientras se están pegando Post-its con la imagen a la vista
  let rapido = false;
  const ESPERA_QUITAR = 700;     // ms sin verlo para quitarlo
  const TAPADO_MAX = 30000;      // si alguien lo tapa, se guarda hasta 30 s
  const AREA_MAX = 0.05;         // más de 5 % de la pantalla no es un Post-it (ropa, cartel)
  const AREA_MAX_CERCA = 0.12;   // con la cámara cerca: hasta 12 % si hay otros Post-its del mismo tamaño
  let pistas = [];
  let confirmarYa = 0;
  let previaMov = null, movimiento = null;

  function reiniciarSeguimiento() { pistas = []; confirmarYa = ahora() + 1200; previaMov = null; }

  // Marcos corregidos a mano en el paso «¿está correcto?»: valen para el Post-it de ese lugar
  let ajustesMarco = [];
  function conMarco(p) {
    const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
    const k = ajustesMarco.find(o => Math.abs(o.x - cx) < p.width && Math.abs(o.y - cy) < p.height);
    return { x: p.x + (k ? k.dx : 0), y: p.y + (k ? k.dy : 0), width: p.width, height: p.height };
  }

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
    // Más de 5 % (cámara cerca) solo si hay al menos 2 Post-its más de tamaño parecido:
    // una cara o una camisa sola no pasa.
    const parecidos = d => dets.filter(o => o !== d && o.width * o.height > d.width * d.height * 0.5 &&
      o.width * o.height < d.width * d.height * 2).length;
    dets = dets.filter(d => {
      const area = d.width * d.height;
      if (medida && area > medida.w * medida.h * 2.2) return false;
      return area <= AREA_MAX || (area <= AREA_MAX_CERCA && parecidos(d) >= 2);
    });
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
          if (t - mejor.desde >= (rapido ? ESPERA_APARECER_RAPIDO : ESPERA_APARECER) || t < confirmarYa) mejor.confirmado = true;
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

    return pistas.filter(p => p.confirmado).map(p => Object.assign(conMarco(p), {
      corners: p.corners, color: p.color, lifetime: 1, missCount: 0
    }));
  }

  // Se reemplaza el suavizado de la app por el seguimiento
  const suavizarOriginal = ColorTracker.prototype.smoothObstacles;
  ColorTracker.prototype.smoothObstacles = function (nuevas) {
    if (this.demoMode) return suavizarOriginal.call(this, nuevas);
    tracker = this;
    this.obstacles = seguir(nuevas || []);
  };

  // Cada cuadro: guardar el detector, brillo y sin las compensaciones a mano (ya no hacen falta)
  const procesarAnterior = ColorTracker.prototype.processFrame;
  ColorTracker.prototype.processFrame = function () {
    tracker = this;
    revisarArranque();
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
    // Sin proyector la cámara no ve las bolas (están solo en la pantalla): no hay nada que tapar.
    // Si se tapara, las bolas amontonadas sobre un Post-it nuevo no dejarían verlo.
    if (sinProyector || !fisica || !inv || !fisica.balls) return;
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


  /* ---------- 5. Luz ---------- */
  let factorLuz = 1, radioBase = null, radioPuesto = null;
  function ponerLuz(brillo) {
    // Con mucha luz en el salón la proyección se ve lavada: bolas más grandes y borde más grueso.
    // brillo: promedio de 0 a 255 de lo que ve la cámara.
    factorLuz = brillo > 200 ? 1.6 : brillo > 160 ? 1.3 : 1;
  }

  const actualizarAnterior = PhysicsEngine.prototype.update;
  PhysicsEngine.prototype.update = function (obstaculos, tiempo) {
    fisica = this;
    if (radioPuesto === null || this.ballRadius !== radioPuesto) radioBase = this.ballRadius; // lo cambió el control
    const quiero = Math.round(radioBase * factorLuz);
    this.ballRadius = radioPuesto = quiero;
    return actualizarAnterior.call(this, obstaculos, tiempo);
  };

  const marcosAnterior = PhysicsEngine.prototype.drawStickerHighlights;
  PhysicsEngine.prototype.drawStickerHighlights = function (obstaculos) {
    marcosAnterior.call(this, obstaculos);
    if (factorLuz <= 1) return;
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    this.ctx.lineWidth = 2.5 * factorLuz;
    for (const ob of obstaculos) this.ctx.strokeRect(ob.x * this.width, ob.y * this.height, ob.width * this.width, ob.height * this.height);
    this.ctx.restore();
  };

  // Con poca luz la cámara entrega todo oscuro: se le sube el brillo antes de buscar colores.
  // Tope: lo más claro de la imagen (casi siempre los Post-its) no debe llegar a blanco (máx. ×2,2),
  // porque un Post-it quemado pierde su color. Con pared oscura o negra antes se subía
  // hasta ×1,8 y los Post-its naranja y verdes salían blancos.
  let ganancia = 1, ultimaMedida = 0;
  function medirBrillo(t) {
    if (ahora() - ultimaMedida < 1000 || !t.mapper.matrix) return;
    ultimaMedida = ahora();
    chctx.drawImage(t.procCanvas, 0, 0, CH_W, CH_H);
    const d = chctx.getImageData(0, 0, CH_W, CH_H).data;
    const brillos = [];
    for (let y = 0; y < CH_H; y++) for (let x = 0; x < CH_W; x++) {
      const p = t.mapper.transform((x + 0.5) / CH_W, (y + 0.5) / CH_H);
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue; // solo dentro de la proyección
      const i = (y * CH_W + x) * 4;
      brillos.push(Math.max(d[i], d[i + 1], d[i + 2]));
    }
    if (brillos.length < 80) return;
    brillos.sort((a, b) => a - b);
    // Los valores medidos ya traen el brillo puesto: se quitan para ver la imagen tal cual
    const medio = brillos.reduce((s, v) => s + v, 0) / brillos.length / ganancia;
    const claro = brillos[Math.floor(brillos.length * 0.995)] / ganancia; // casi lo más claro (no un solo punto suelto)
    // Se sube hasta que lo claro quede cerca de 225 (con margen para no quemar). El promedio solo
    // decide si hace falta: con una pared clara pero Post-its oscuros también se sube.
    const quiero = medio > 140 && claro > 200 ? 1 : Math.min(225 / Math.max(1, claro), 2.2);
    ganancia = Math.max(1, ganancia * 0.5 + Math.max(1, quiero) * 0.5);
    t.procCtx.filter = ganancia > 1.02 ? `brightness(${ganancia.toFixed(2)})` : 'none';
  }

  /* ---------- 6. Modo sin proyector en la consola y avisos ---------- */
  document.head.insertAdjacentHTML('beforeend', `<style>
    .aa-caja { border: 1px solid var(--accent-cyan, #38bdf8); border-radius: 8px; padding: 12px; margin-bottom: 14px; }
    .aa-estado { font-size: 12px; margin-top: 8px; color: var(--text-secondary, #94a3b8); }
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
      <label for="sinProyectorToggle">Sin proyector</label>
      <input type="checkbox" id="sinProyectorToggle" class="switch-input" ${modoProyector === 'sin' ? 'checked' : ''}>
    </div>
    <span class="field-hint">Usa la imagen completa de la cámara en la pantalla de la PC. Con proyector, el ajuste se hace con la tecla A.</span>
    <div class="aa-estado" id="autoAjusteEstado">Esperando la cámara…</div>`;
  if (pestana) {
    const intro = pestana.querySelector('.section-intro');
    if (intro) intro.after(caja); else pestana.prepend(caja);
  }
  const textoEstado = caja.querySelector('#autoAjusteEstado');
  function estado(t) { textoEstado.textContent = t; }

  // Las 4 esquinas de antes y «Superponer Cámara»: ahora todo eso se hace con la tecla A
  if (pestana) {
    pestana.querySelectorAll('.corner-selector-row, .button-row, .fine-tuning-box, .calibration-preview-container')
      .forEach(el => { el.style.display = 'none'; });
    const superponer = document.getElementById('liveCameraWallToggle');
    const grupo = superponer && superponer.closest('.control-group');
    if (grupo) grupo.style.display = 'none';
  }

  // Cambia entre con proyector y sin proyector (consola o botón «Modo» del celular)
  function cambiarModo(nuevo) {
    if (nuevo !== 'con' && nuevo !== 'sin') nuevo = modoProyector === 'con' ? 'sin' : 'con';
    modoProyector = nuevo;
    try { localStorage.setItem(CLAVE_MODO, nuevo); } catch (x) {}
    caja.querySelector('#sinProyectorToggle').checked = nuevo === 'sin';
    if (nuevo === 'sin') usarImagenCompleta();
    else { sinProyector = false; ajustado = false; reiniciarSeguimiento(); estado('Con proyector: ajusta con la tecla A.'); }
    aviso(nuevo === 'con' ? 'Con proyector' : 'Sin proyector: uso la imagen completa de la cámara');
    window.dispatchEvent(new CustomEvent('posits-modo', { detail: nuevo }));
  }
  caja.querySelector('#sinProyectorToggle').addEventListener('change', (e) => cambiarModo(e.target.checked ? 'sin' : 'con'));

  // Vista previa de la consola: la imagen de la cámara con el cuadro del ajuste
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

  // Lo que usa a-transparencia.js (y para revisar desde la consola del navegador)
  window.AutoAjuste = {
    modo: () => modoProyector,
    cambiarModo,
    aviso,
    ponerEstado: estado,
    paso: () => ultimoPaso,
    detector: () => tracker,
    camaraLista: listo,
    mates: { homografia, aplicar, invertir },
    imagenChica,
    tamChica: { w: CH_W, h: CH_H },
    ponerLuz,
    // Pone la fórmula cámara → pantalla en la app
    ponerMatriz(H) {
      const inv = invertir(H);
      if (!inv) return false;
      const esquinas = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => aplicar(inv, x, y));
      if (!esquinas.every(c => isFinite(c.x) && isFinite(c.y) && Math.abs(c.x) < 20 && Math.abs(c.y) < 20)) return false;
      tracker.mapper.srcCorners = esquinas;
      tracker.mapper.computeHomography();
      pintarVista();
      return true;
    },
    reiniciarSeguimiento,
    // Con la imagen a la vista importa más la rapidez: el celular manda fotos más livianas
    ponerRapido(si) {
      if (rapido === si) return;
      rapido = si;
      window.dispatchEvent(new CustomEvent('posits-camara-rapida', { detail: si }));
    },
    marcarAjustado(si) { ajustado = si; if (si) prepararVigilancia(); },
    ponerAjustesMarco(lista) { ajustesMarco = lista; },
    estado: () => ({ modo: modoProyector, ajustado, sinProyector, factorLuz, ganancia, pistas: pistas.length,
      postits: tracker ? (tracker.obstacles || []).map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height })) : [] })
  };

  // La función de la tecla A va en su propio archivo, junto a este
  const guion = document.createElement('script');
  guion.src = 'cambios/pc/a-transparencia.js';
  document.body.appendChild(guion);
})();
