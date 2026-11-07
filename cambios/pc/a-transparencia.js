/*
  A TRANSPARENCIA
  ---------------
  Ajusta la cámara con el proyector sin destellos, en 5 pasos:
   1. Mide la luz sola.
   2. Avisa «Listo, luz medida» y pide señalar los Post-its.
   3. Con la tecla A sale la imagen de la cámara transparente. Se toca cada
      Post-it de verdad con el puntero que se ve sobre la pared: la imagen se mueve sola.
   4. Pregunta si está correcto. Se corrige arrastrando un marco, la imagen o sus esquinas.
   5. Listo: sugiere dónde pegar Post-its nuevos con buena luz.

  El menú trae una mini cámara: se arrastran sus 4 números hasta los mismos números de la
  pared y la imagen queda calzada sin tocar la pared. También se puede tocar cada Post-it
  ahí: lo mide y la imagen crece sola hasta donde están. Ese toque no dice dónde cae en la
  pared, así que es un cálculo aproximado, y un toque en la pared o los números mandan
  sobre él. Va a color, y sus Post-its salen tan chicos en la pared que la cámara
  no los toma por reales.

  Al cerrar el menú se ocultan las sugerencias. El botón X (o la tecla X) las vuelve a
  mostrar junto con la imagen transparente, para ver cómo se van pegando los Post-its.

  Cómo se ubica: el puntero dice dónde está el Post-it en la pantalla y la cámara dice
  dónde está en su imagen. Con esas parejas de puntos sale la fórmula cámara → pantalla
  (1 pareja corre la imagen, 2 también la giran y escalan, 3 la enderezan, 4 o más
  corrigen la perspectiva). Las mismas parejas sirven para reajustar sola si se mueve
  la cámara.

  El menú se abre y se cierra como la consola H,
  con el botón ☰ A o la tecla A.

  La imagen va a color. Se limita la transparencia a un mínimo para que la cámara no tome
  sus Post-its por reales. Mientras se ve, las fotos del celular son más livianas y un
  Post-it nuevo aparece más rápido.

  Lo carga auto-ajuste.js. Bloques:
   1. Estado y guardado
   2. Cuentas con las parejas de puntos
   3. Pantalla: imagen, capa de toques, marcas y menú
   4. Pasos
   5. Señalar
   6. Corregir arrastrando y mini cámara
   7. Sugerir dónde pegar
   8. Reajustar si se mueve la cámara
   9. Eventos y teclas A y X
*/
(function () {
  'use strict';
  const AA = window.AutoAjuste;
  if (!AA) return;
  const { homografia, aplicar, invertir } = AA.mates;

  /* ---------- 1. Estado y guardado ---------- */
  const CLAVE = 'posits-a-transparencia-v1';
  const MIN_SUGERENCIAS = 6, MAX_SUGERENCIAS = 8;
  const TOTAL_PASOS = 5;

  let paso = 'espera'; // espera, luz, luzlista, senalar, revisar, fin, sin
  let pares = [];      // { cam:{x,y}, pro:{x,y}, w, h, color }: el mismo Post-it en la cámara y en la pantalla
  let base = null;     // fórmula de partida: las parejas la van corrigiendo
  let ajustes = [];    // marcos corregidos a mano, uno por lugar
  let esquinas = [];   // { cam, pan }: los 4 puntos que se arrastran para corregir la perspectiva
  let transparencia = 60;
  // Más opaca, la cámara toma los Post-its de la imagen a color por Post-its de verdad
  const TRANSPARENCIA_MIN = 55;
  let sugerencias = [];
  let mapaLuz = null, zonaOscura = null, resumenLuz = '';
  let mensaje = '';
  let menuAbierto = false;
  let toques = [];
  let perdida = false; // se movió la cámara y no pudo reajustar sola
  let verX = false;    // botón X prendido: sugerencias e imagen a la vista, sin el menú
  let ajusteMano = false; // ya se arrastraron los números de la mini cámara

  const detector = () => AA.detector();
  const matriz = () => detector().mapper.matrix.slice();
  const razon = () => window.innerHeight / window.innerWidth;

  function guardar() {
    const t = detector();
    if (!t) return;
    try {
      localStorage.setItem(CLAVE, JSON.stringify({
        esquinas: t.mapper.srcCorners, pares, ajustes,
        tam: t.procWidth + 'x' + t.procHeight,
        ventana: window.innerWidth + 'x' + window.innerHeight
      }));
    } catch (e) { /* sin almacenamiento: el ajuste vale hasta recargar */ }
  }

  function leerGuardado() {
    try { return JSON.parse(localStorage.getItem(CLAVE)); } catch (e) { return null; }
  }

  /* ---------- 2. Cuentas con las parejas de puntos ---------- */
  function multiplicar(a, b) {
    const r = new Array(9);
    for (let f = 0; f < 3; f++) for (let c = 0; c < 3; c++) {
      r[f * 3 + c] = a[f * 3] * b[c] + a[f * 3 + 1] * b[c + 3] + a[f * 3 + 2] * b[c + 6];
    }
    return r;
  }
  const correr = (dx, dy) => [1, 0, dx, 0, 1, dy, 0, 0, 1];

  // Giro + escala que lleva p1→q1 y p2→q2, sin deformar (se cuenta en proporción de la pantalla real)
  function parecida(p1, p2, q1, q2) {
    const r = razon();
    const ax = p2.x - p1.x, ay = (p2.y - p1.y) * r, bx = q2.x - q1.x, by = (q2.y - q1.y) * r;
    const d = ax * ax + ay * ay;
    if (d < 1e-9) return null;
    const c = (ax * bx + ay * by) / d, s = (ax * by - ay * bx) / d;
    const e = q1.x - (c * p1.x - s * p1.y * r), f = q1.y * r - (s * p1.x + c * p1.y * r);
    return [c, -s * r, e, s / r, c, f / r, 0, 0, 1];
  }

  // La fórmula sin perspectiva que lleva 3 puntos a otros 3
  function afin(a, b) {
    const [p, q, s] = a;
    const det = p.x * (q.y - s.y) - p.y * (q.x - s.x) + (q.x * s.y - s.x * q.y);
    if (Math.abs(det) < 1e-6) return null;
    const fila = k => [
      (b[0][k] * (q.y - s.y) - p.y * (b[1][k] - b[2][k]) + (b[1][k] * s.y - b[2][k] * q.y)) / det,
      (p.x * (b[1][k] - b[2][k]) - b[0][k] * (q.x - s.x) + (q.x * b[2][k] - s.x * b[1][k])) / det,
      (p.x * (q.y * b[2][k] - s.y * b[1][k]) - p.y * (q.x * b[2][k] - s.x * b[1][k]) + b[0][k] * (q.x * s.y - s.x * q.y)) / det
    ];
    return [...fila('x'), ...fila('y'), 0, 0, 1];
  }

  const areaTrio = (a, b, c) => Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;

  // Los 3 puntos más repartidos: dan la fórmula más firme
  function mejorTrio(lista) {
    let mejor = null, area = -1;
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) for (let k = j + 1; k < lista.length; k++) {
      const a = areaTrio(lista[i], lista[j], lista[k]);
      if (a > area) { area = a; mejor = [i, j, k]; }
    }
    return { indices: mejor, area };
  }

  function masLejanos(lista) {
    let mejor = [0, 1], d = -1;
    for (let i = 0; i < lista.length; i++) for (let j = i + 1; j < lista.length; j++) {
      const e = Math.hypot(lista[i].x - lista[j].x, lista[i].y - lista[j].y);
      if (e > d) { d = e; mejor = [i, j]; }
    }
    return mejor;
  }

  // ¿La fórmula es creíble? No puede doblar la imagen de la cámara ni fallar en las parejas.
  function formulaSana(H, lista) {
    const puntas = [[0, 0], [1, 0], [1, 1], [0, 1]];
    if (!puntas.every(([x, y]) => H[6] * x + H[7] * y + H[8] > 0.01)) return false;
    const q = puntas.map(([x, y]) => aplicar(H, x, y));
    let signo = 0;
    for (let k = 0; k < 4; k++) {
      const a = q[k], b = q[(k + 1) % 4], c = q[(k + 2) % 4];
      const z = Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
      if (signo && z !== signo) return false;
      signo = z;
    }
    return (lista || []).every(p => {
      const m = aplicar(H, p.cam.x, p.cam.y);
      return Math.hypot(m.x - p.pro.x, m.y - p.pro.y) < 0.06;
    });
  }

  // Fórmula cámara → pantalla según las parejas que hay
  function formulaConPares() {
    const n = pares.length;
    if (!n) return base.slice();
    const enBase = pares.map(p => aplicar(base, p.cam.x, p.cam.y));
    const destino = pares.map(p => p.pro);
    if (n === 1) return multiplicar(correr(destino[0].x - enBase[0].x, destino[0].y - enBase[0].y), base);
    if (n >= 4) {
      const H = homografia(pares.map(p => p.cam), destino);
      if (H && formulaSana(H, pares)) return H;
    }
    if (n >= 3) {
      const { indices, area } = mejorTrio(enBase);
      if (area > 0.002) {
        const M = afin(indices.map(i => enBase[i]), indices.map(i => destino[i]));
        if (M) return multiplicar(M, base);
      }
    }
    const [i, j] = masLejanos(enBase);
    const M = parecida(enBase[i], enBase[j], destino[i], destino[j]);
    return M ? multiplicar(M, base) : base.slice();
  }

  function aplicarFormula(H) {
    if (!AA.ponerMatriz(H)) return false;
    AA.reiniciarSeguimiento();
    return true;
  }

  // Post-its que la cámara ve ahora, en su propia imagen
  function postitsCamara() {
    return (window.CajasCamara || [])
      .filter(c => c.width * c.height < 0.12)
      .map(c => ({ x: c.x + c.width / 2, y: c.y + c.height / 2, w: c.width, h: c.height, color: c.colorReal }));
  }

  function tonoDe(color) {
    if (typeof color !== 'string') return null;
    let r, g, b;
    const hsl = color.match(/^hsl\(\s*([\d.]+)/);
    if (hsl) return +hsl[1];
    const hex = color.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
    const rgb = color.match(/^rgba?\(\s*(\d+)\D+(\d+)\D+(\d+)/);
    if (hex) [r, g, b] = hex.slice(1).map(v => parseInt(v, 16));
    else if (rgb) [r, g, b] = rgb.slice(1).map(Number);
    else return null;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (!d) return null;
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }
  function coloresCompatibles(a, b) {
    const t1 = tonoDe(a), t2 = tonoDe(b);
    if (t1 === null || t2 === null) return true;
    const d = Math.abs(t1 - t2) % 360;
    return Math.min(d, 360 - d) < 45;
  }

  // Busca qué Post-it de la cámara corresponde a cada punto de la pantalla, probando giros
  // y escalas. Sirve aunque la cámara se haya movido. manchas ya vienen llevadas a la pantalla.
  function buscarUbicacion(puntos, manchas) {
    const anchos = manchas.map(m => m.ancho).sort((a, b) => a - b);
    const tol = Math.max(0.025, (anchos[anchos.length >> 1] || 0.05) * 0.9);
    let mejor = { n: 0, suma: Infinity, asignados: [] };
    for (let i = 0; i < puntos.length; i++) for (let j = i + 1; j < puntos.length; j++) {
      for (let k = 0; k < manchas.length; k++) {
        if (!coloresCompatibles(puntos[i].color, manchas[k].color)) continue;
        for (let l = 0; l < manchas.length; l++) {
          if (l === k || !coloresCompatibles(puntos[j].color, manchas[l].color)) continue;
          const M = parecida(manchas[k], manchas[l], puntos[i], puntos[j]);
          if (!M) continue;
          const escala = Math.hypot(M[0], M[3]);
          if (escala < 0.5 || escala > 2) continue;
          const llevadas = manchas.map(m => aplicar(M, m.x, m.y));
          const usadas = new Set(), asignados = [];
          let n = 0, suma = 0;
          for (const p of puntos) {
            let cual = -1, dist = tol;
            llevadas.forEach((q, e) => {
              if (usadas.has(e) || !coloresCompatibles(p.color, manchas[e].color)) return;
              const d = Math.hypot(q.x - p.x, (q.y - p.y) * razon());
              if (d < dist) { dist = d; cual = e; }
            });
            asignados.push(cual);
            if (cual >= 0) { usadas.add(cual); n++; suma += dist; }
          }
          if (n > mejor.n || (n === mejor.n && suma < mejor.suma)) mejor = { n, suma, asignados };
        }
      }
    }
    return mejor;
  }

  /* ---------- 3. Pantalla: imagen, capa de toques, marcas y menú ---------- */
  document.head.insertAdjacentHTML('beforeend', `<style>
    #atImagen { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; z-index: 900; pointer-events: none;
      transform-origin: 0 0; display: none; }
    #atCaptura { position: fixed; inset: 0; z-index: 950; display: none; cursor: crosshair; touch-action: none; }
    #atMarcas { position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; z-index: 960; pointer-events: none; }
    #atBoton { position: fixed; right: 132px; bottom: 24px; z-index: 999; display: flex; align-items: center; gap: 8px;
      padding: 7px 14px; background: #0f172a; border: 1px solid #334155; border-radius: var(--radius-sm, 6px);
      color: #f8fafc; font: 700 15px var(--font-main, system-ui); cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.5); }
    #atBoton:hover { background: #1e293b; border-color: #475569; }
    #atBoton.pide { border-color: #38bdf8; color: #38bdf8; }
    #atMenu { position: fixed; left: 0; top: 0; bottom: 0; width: min(330px, calc(100vw - 32px)); z-index: 1001;
      background: rgba(13,17,24,.97); border-right: 1px solid #334155; color: #f8fafc;
      font: 500 15px/1.45 var(--font-main, system-ui); padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px;
      transform: translateX(-102%); transition: transform .2s ease; visibility: hidden; }
    #atMenu.ver { transform: none; visibility: visible; }
    @media (prefers-reduced-motion: reduce) { #atMenu { transition: none; } }
    #atMenu header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    #atMenu header b { font-size: 16px; font-weight: 800; }
    #atMenu .at-paso { font: 500 13px var(--font-mono, monospace); color: #38bdf8; }
    #atMenu h3 { margin: 0; font-size: 18px; font-weight: 800; }
    #atMenu p { margin: 0; color: #cbd5e1; }
    #atMenu p.at-msg { color: #f8fafc; font-weight: 700; }
    #atMenu button { font: 700 14px var(--font-main, system-ui); color: #f8fafc; background: #1e293b;
      border: 1px solid #334155; border-radius: 7px; padding: 10px 12px; cursor: pointer; }
    #atMenu button:hover:not(:disabled) { border-color: #38bdf8; }
    #atMenu button:disabled { opacity: .45; cursor: default; }
    #atMenu button.at-fuerte { background: #0284c7; border-color: #38bdf8; color: #fff; }
    #atMenu button:focus-visible, #atBoton:focus-visible, #atMenu input:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
    #atMenu .at-fila { display: flex; flex-wrap: wrap; gap: 6px; }
    #atMenu .at-fila button { flex: 1 1 auto; }
    #atMenu label { display: grid; gap: 4px; font-size: 14px; }
    #atMenu label span { display: flex; justify-content: space-between; gap: 8px; }
    #atMenu label b { font: 500 13px var(--font-mono, monospace); color: #38bdf8; }
    #atMenu input[type="range"] { width: 100%; accent-color: #38bdf8; margin: 0; }
    #atMenu .at-barra { height: 8px; border-radius: 4px; background: #334155; overflow: hidden; }
    #atMenu .at-barra i { display: block; height: 100%; width: 0; background: #38bdf8; }
    @media (min-width: 700px) { body.at-menu-abierto .toast-container { left: 354px; } }
    #atBotonX { position: fixed; right: 196px; bottom: 24px; z-index: 999; padding: 7px 14px; background: #0f172a;
      border: 1px solid #334155; border-radius: var(--radius-sm, 6px); color: #f8fafc; font: 700 15px var(--font-main, system-ui);
      cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.5); }
    #atBotonX:hover { background: #1e293b; border-color: #475569; }
    #atBotonX[aria-pressed="true"] { background: #0284c7; border-color: #38bdf8; color: #fff; }
    #atBotonX:focus-visible, #atBarraX input:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
    #atBarraX { position: fixed; left: 24px; bottom: 24px; z-index: 999; width: min(430px, calc(100vw - 300px)); display: grid; gap: 6px;
      padding: 9px 11px; background: rgba(13,17,24,.95); border: 1px solid #334155; border-radius: 8px; color: #f8fafc;
      font: 500 14px/1.4 var(--font-main, system-ui); }
    #atBarraX[hidden] { display: none; }
    #atBarraX p { margin: 0; font-weight: 700; }
    #atBarraX label { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; font-size: 13px; }
    #atBarraX label b { font: 500 13px var(--font-mono, monospace); color: #38bdf8; }
    #atBarraX input[type="range"] { width: 100%; accent-color: #38bdf8; margin: 0; }
    #atMini { display: block; width: 100%; max-height: 38vh; border: 1px solid #334155; border-radius: 6px; background: #111;
      cursor: crosshair; touch-action: none; }
    #atMiniSitio { display: grid; gap: 3px; }
    #atMiniSitio span { font: 500 12px var(--font-mono, monospace); color: #38bdf8; }
    body.at-x-abierto .toast-container { bottom: 112px; }
    @media (max-width: 699px) { #atBarraX { left: 16px; bottom: 70px; width: calc(100vw - 32px); } body.at-x-abierto .toast-container { bottom: 170px; } }
  </style>`);

  document.body.insertAdjacentHTML('beforeend', `
    <canvas id="atImagen"></canvas>
    <div id="atCaptura"></div>
    <canvas id="atMarcas"></canvas>
    <button id="atBoton" type="button" title="Tecla A: ajustar con transparencia">☰ A</button>
    <button id="atBotonX" type="button" aria-pressed="false" title="Tecla X: ver sugerencias y cámara">X</button>
    <div id="atBarraX" hidden>
      <p id="atMensajeX" role="status"></p>
      <label for="atTranspX">Transparencia <input id="atTranspX" type="range" min="${TRANSPARENCIA_MIN}" max="100" value="${transparencia}"> <b id="atTranspXValor">${transparencia} %</b></label>
    </div>
    <aside id="atMenu" aria-label="A transparencia"></aside>`);
  const imagen = document.getElementById('atImagen'), ictx = imagen.getContext('2d');
  const captura = document.getElementById('atCaptura');
  const marcas = document.getElementById('atMarcas'), mctx = marcas.getContext('2d');
  const boton = document.getElementById('atBoton');
  const menu = document.getElementById('atMenu');
  const mini = document.createElement('canvas');
  mini.id = 'atMini';
  mini.setAttribute('aria-label', 'Mini cámara: arrastra los números o toca un Post-it');
  const mctxMini = mini.getContext('2d');
  const botonX = document.getElementById('atBotonX');
  const barraX = document.getElementById('atBarraX');
  const mensajeX = document.getElementById('atMensajeX');
  const transparenciaX = document.getElementById('atTranspX');
  const transparenciaXValor = document.getElementById('atTranspXValor');

  // index.html todavía avisa «Presiona H para ajustar», y ahora el ajuste es con la tecla A
  const avisos = document.getElementById('toastContainer');
  if (avisos) new MutationObserver(cambios => cambios.forEach(c => c.addedNodes.forEach(n => {
    if (n.textContent && n.textContent.includes('Presiona H para ajustar')) {
      const hoja = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      while (hoja.nextNode()) hoja.currentNode.nodeValue = hoja.currentNode.nodeValue.replace(' Presiona H para ajustar.', '');
    }
  }))).observe(avisos, { childList: true });

  function abrirMenu(si) {
    menuAbierto = si;
    menu.classList.toggle('ver', si);
    document.body.classList.toggle('at-menu-abierto', si); // los avisos no tapan los botones del menú
    if (si) { boton.classList.remove('pide'); dibujarMenu(); }
  }

  function pintarBarraX() {
    if (!verX) return;
    mensajeX.textContent = mensaje;
    transparenciaX.value = transparencia;
    transparenciaXValor.textContent = transparencia + ' %';
  }

  function mostrarX(si) {
    verX = si;
    botonX.setAttribute('aria-pressed', si);
    barraX.hidden = !si;
    document.body.classList.toggle('at-x-abierto', si);
    if (si) { calcularSugerencias(); pintarBarraX(); }
    if (menuAbierto) dibujarMenu();
  }

  function tocarX() {
    if (verX) { mostrarX(false); return; }
    if (paso === 'fin') { mostrarX(true); return; }
    if (AA.modo() === 'sin') AA.aviso('Sin proyector no hace falta: toda la imagen de la cámara es la pantalla', 4000);
    else if (!AA.camaraLista()) AA.aviso('Primero inicia la cámara', 4000);
    else AA.aviso('Primero ajusta con A', 4000);
  }

  transparenciaX.addEventListener('input', () => {
    transparencia = +transparenciaX.value;
    transparenciaXValor.textContent = transparencia + ' %';
  });

  const sugerenciasVisibles = () => paso === 'fin' && (menuAbierto || verX);

  function textoMenu() {
    const etiqueta = n => `<div class="at-paso">Paso ${n} de ${TOTAL_PASOS}</div>`;
    const barra = `<label for="atTransp"><span>Transparencia <b id="atTranspValor">${transparencia} %</b></span>
      <input id="atTransp" type="range" min="${TRANSPARENCIA_MIN}" max="100" value="${transparencia}"></label>`;
    if (paso === 'sin') return `<h3>Sin proyector</h3><p>No hace falta ajustar: uso la imagen completa de la cámara.</p>
      <button type="button" class="at-fuerte" data-accion="con">Usar con proyector</button>`;
    if (paso === 'espera') return `<h3>Falta la cámara</h3><p>Primero inicia la cámara o el celular. Si hay una foto subida, quítala.</p>`;
    if (paso === 'luz') return `${etiqueta(1)}<h3>Midiendo la luz…</h3><p>No muevas la cámara.</p><div class="at-barra"><i id="atLuzBarra"></i></div>`;
    if (paso === 'luzlista') return `${etiqueta(2)}<h3>Listo, luz medida</h3><p>${resumenLuz} Ahora señálame los Post-its.</p>
      <button type="button" class="at-fuerte" data-accion="abrir">A · Abrir transparencia</button>`;
    if (paso === 'senalar') return `${etiqueta(3)}<h3>Señálame los Post-its</h3>
      <p>Toca cada Post-it en la mini cámara: lo mido y la imagen crece sola hasta donde están.</p>
      <div id="atMiniSitio"><span>Mini cámara</span></div>
      <p>Para que calce exacto, toca los Post-its en la pared o arrastra los números 1 a 4 hasta los mismos números de la pared.</p>
      ${mensaje ? `<p class="at-msg" id="atMensaje">${mensaje}</p>` : ''}${barra}
      <div class="at-fila"><button type="button" data-accion="deshacer"${pares.length ? '' : ' disabled'}>Deshacer último toque</button>
      <button type="button" class="at-fuerte" data-accion="revisar"${pares.length || ajusteMano ? '' : ' disabled'}>Listo</button></div>`;
    if (paso === 'revisar') return `${etiqueta(4)}<h3>Mira: ¿está correcto?</h3>
      <p>Si un marco no cae sobre su Post-it, arrástralo. Para corregir todo, arrastra la imagen, sus esquinas o los números de la mini cámara.</p>
      <div id="atMiniSitio"><span>Mini cámara</span></div>
      ${mensaje ? `<p class="at-msg" id="atMensaje">${mensaje}</p>` : ''}
      ${barra}<div class="at-fila"><button type="button" data-accion="mas">Señalar más</button>
      <button type="button" class="at-fuerte" data-accion="fin">Listo</button></div>`;
    return `${etiqueta(5)}<h3>Ajuste terminado</h3>
      ${mensaje ? `<p class="at-msg" id="atMensaje">${mensaje}</p>` : ''}
      <p>Si se mueve la cámara, me reajusto sola con los Post-its señalados.</p>
      <p>Al cerrar este menú se ocultan las sugerencias. Con X las ves junto con la cámara.</p>
      <div class="at-fila"><button type="button" data-accion="ajustar">Volver a ajustar</button>
      <button type="button" data-accion="nuevo">Empezar de nuevo</button></div>`;
  }

  function dibujarMenu() {
    menu.innerHTML = `<header><b>☰ A transparencia</b><button type="button" data-accion="cerrar">Cerrar [A]</button></header>${textoMenu()}`;
    const r = document.getElementById('atTransp');
    if (r) r.oninput = () => {
      transparencia = +r.value;
      document.getElementById('atTranspValor').textContent = transparencia + ' %';
      imagen.style.opacity = 1 - transparencia / 100;
    };
    menu.querySelectorAll('[data-accion]').forEach(b => { b.onclick = () => accion(b.dataset.accion); });
    const sitio = document.getElementById('atMiniSitio');
    if (sitio) sitio.appendChild(mini);
  }

  function accion(a) {
    if (a === 'cerrar') abrirMenu(false);
    if (a === 'abrir') abrirTransparencia();
    if (a === 'revisar') irARevisar();
    if (a === 'deshacer') deshacerToque();
    if (a === 'mas') irASenalar('Toca los Post-its que falten.');
    if (a === 'fin') terminar();
    if (a === 'ajustar') irARevisar();
    if (a === 'nuevo') iniciarLuz();
    if (a === 'con') AA.cambiarModo('con');
  }

  // Imagen de la cámara puesta donde la fórmula dice que cae
  let ultimaImagen = 0;
  function dibujarImagen(t) {
    const senalando = paso === 'senalar' || paso === 'revisar';
    const visible = senalando || verX;
    imagen.style.display = visible ? 'block' : 'none';
    captura.style.display = senalando ? 'block' : 'none';
    if (!visible) return;
    const d = detector();
    const W = window.innerWidth, H = window.innerHeight, m = d.mapper.matrix;
    if (t - ultimaImagen > 30) {
      ultimaImagen = t;
      if (imagen.width !== d.procWidth || imagen.height !== d.procHeight) { imagen.width = d.procWidth; imagen.height = d.procHeight; }
      ictx.drawImage(d.procCanvas, 0, 0, imagen.width, imagen.height);
    }
    imagen.style.opacity = 1 - transparencia / 100;
    imagen.style.transform = `matrix3d(${m[0]},${m[3] * H / W},0,${m[6] / W},${m[1] * W / H},${m[4]},0,${m[7] / H},0,0,1,0,${m[2] * W},${m[5] * H},0,${m[8]})`;
  }

  function rotulo(texto, x, y, color) {
    mctx.font = '700 14px system-ui, sans-serif';
    mctx.textAlign = 'center';
    mctx.lineJoin = 'round'; mctx.lineWidth = 4; mctx.strokeStyle = '#000';
    mctx.strokeText(texto, x, y);
    mctx.fillStyle = color || '#fff';
    mctx.fillText(texto, x, y);
  }

  const obstaculos = () => { const d = detector(); return d && d.obstacles ? d.obstacles : []; };
  const enPixeles = o => Math.round(o.width * window.innerWidth) + ' × ' + Math.round(o.height * window.innerHeight) + ' px';

  function dibujarMarcas(t) {
    const W = window.innerWidth, H = window.innerHeight;
    if (marcas.width !== W || marcas.height !== H) { marcas.width = W; marcas.height = H; }
    mctx.clearRect(0, 0, W, H);
    if (paso === 'senalar' || paso === 'revisar' || verX) {
      mctx.lineWidth = 2.5; mctx.setLineDash([]); mctx.strokeStyle = '#22c55e';
      obstaculos().forEach(o => mctx.strokeRect(o.x * W, o.y * H, o.width * W, o.height * H));
      obstaculos().forEach(o => rotulo(enPixeles(o), (o.x + o.width / 2) * W, o.y * H - 7, '#bbf7d0'));
      if (!verX && menuAbierto) {
        const marco = marcoPared();
        mctx.strokeStyle = '#fff'; mctx.lineWidth = 2;
        mctx.strokeRect(marco[0].x * W, marco[0].y * H, (marco[1].x - marco[0].x) * W, (marco[2].y - marco[1].y) * H);
        marco.forEach((p, i) => {
          mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(p.x * W, p.y * H, 13, 0, 6.3); mctx.fill();
          mctx.fillStyle = '#000'; mctx.font = '800 15px system-ui, sans-serif'; mctx.textAlign = 'center';
          mctx.fillText(String(i + 1), p.x * W, p.y * H + 5);
        });
        mctx.strokeStyle = '#22c55e'; mctx.lineWidth = 2.5;
      }
      if (!verX) pares.forEach(p => {
        mctx.fillStyle = '#38bdf8';
        mctx.beginPath(); mctx.arc(p.pro.x * W, p.pro.y * H, 5, 0, 6.3); mctx.fill();
      });
    }
    if (paso === 'revisar') {
      esquinas.forEach((e, i) => {
        mctx.fillStyle = '#0284c7'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 2;
        mctx.beginPath(); mctx.arc(e.pan.x * W, e.pan.y * H, 15, 0, 6.3); mctx.fill(); mctx.stroke();
        rotulo(String(i + 1), e.pan.x * W, e.pan.y * H + 5);
      });
    }
    if (zonaOscura && (paso === 'luzlista' || sugerenciasVisibles())) {
      const c = zonaOscura();
      if (c) rotulo('Poca luz: capta peor', c.x * W, c.y * H, '#fda4af');
    }
    if (sugerenciasVisibles()) {
      sugerencias.forEach(s => {
        mctx.setLineDash([7, 5]); mctx.lineWidth = 2.5; mctx.strokeStyle = '#38bdf8';
        mctx.strokeRect(s.x * W, s.y * H, s.w * W, s.h * H); mctx.setLineDash([]);
        rotulo(String(s.n), (s.x + s.w / 2) * W, (s.y + s.h / 2) * H + 5, '#bae6fd');
        rotulo('Pega aquí', (s.x + s.w / 2) * W, (s.y + s.h) * H + 16, '#bae6fd');
      });
    }
    toques = toques.filter(k => t - k.t0 < 500);
    toques.forEach(k => {
      const a = (t - k.t0) / 500;
      mctx.lineWidth = 3;
      mctx.strokeStyle = (k.bien ? 'rgba(56,189,248,' : 'rgba(251,113,133,') + (1 - a) + ')';
      mctx.beginPath(); mctx.arc(k.x * W, k.y * H, 8 + a * 28, 0, 6.3); mctx.stroke();
    });
  }

  function bucle(t) {
    if (detector()) {
      AA.ponerRapido(paso === 'senalar' || paso === 'revisar' || verX);
      dibujarImagen(t);
      dibujarMarcas(t);
      dibujarMini(t);
      if (sugerenciasVisibles() && sugerencias.length) quitarSugerenciasUsadas();
    }
    requestAnimationFrame(bucle);
  }
  requestAnimationFrame(bucle);

  /* ---------- 4. Pasos ---------- */
  const MUESTRAS_LUZ = 10;
  let relojLuz = null;

  function iniciarLuz() {
    clearInterval(relojLuz);
    if (verX) mostrarX(false);
    ajusteMano = false;
    paso = 'luz'; pares = []; ajustes = []; sugerencias = []; mensaje = ''; perdida = false;
    AA.ponerAjustesMarco([]);
    AA.marcarAjustado(false);
    const d = detector();
    d.mapper.resetCorners();
    base = matriz();
    AA.reiniciarSeguimiento();
    abrirMenu(true);
    let suma = null, n = 0;
    relojLuz = setInterval(() => {
      if (!AA.camaraLista()) return;
      const g = AA.imagenChica();
      if (!suma) suma = new Float32Array(g.length);
      for (let i = 0; i < g.length; i++) suma[i] += g[i];
      n++;
      const barra = document.getElementById('atLuzBarra');
      if (barra) barra.style.width = (n / MUESTRAS_LUZ * 100) + '%';
      if (n >= MUESTRAS_LUZ) {
        clearInterval(relojLuz);
        terminarLuz(suma.map(v => v / n));
      }
    }, 170);
  }

  const NOMBRES_ZONA = [['arriba a la izquierda', 'arriba a la derecha'], ['abajo a la izquierda', 'abajo a la derecha']];
  function terminarLuz(mapa) {
    mapaLuz = mapa;
    const { w, h } = AA.tamChica;
    const orden = Array.from(mapa).sort((a, b) => a - b);
    const mediana = orden[orden.length >> 1];
    const promedio = orden.reduce((s, v) => s + v, 0) / orden.length;
    AA.ponerLuz(promedio);
    let oscuras = 0, sx = 0, sy = 0;
    mapa.forEach((v, i) => {
      if (v < mediana * 0.55) { oscuras++; sx += (i % w) + 0.5; sy += ((i / w) | 0) + 0.5; }
    });
    const parte = oscuras / mapa.length;
    if (parte < 0.03) { resumenLuz = 'Buena luz en toda la imagen.'; zonaOscura = null; }
    else {
      const cx = sx / oscuras / w, cy = sy / oscuras / h;
      resumenLuz = (parte < 0.3 ? 'Buena luz en casi toda la imagen. Poca luz ' : 'Bastante zona con poca luz, sobre todo ') +
        NOMBRES_ZONA[cy < 0.5 ? 0 : 1][cx < 0.5 ? 0 : 1] + '.';
      zonaOscura = () => {
        const d = detector();
        if (!d) return null;
        const p = aplicar(d.mapper.matrix, cx, cy);
        return p.x > 0.02 && p.x < 0.98 && p.y > 0.02 && p.y < 0.98 ? p : null;
      };
    }
    paso = 'luzlista';
    if (menuAbierto) dibujarMenu(); else boton.classList.add('pide');
  }

  function abrirTransparencia() {
    base = matriz();
    irASenalar('');
  }

  function irASenalar(texto) {
    if (verX) mostrarX(false);
    paso = 'senalar'; mensaje = texto;
    AA.marcarAjustado(false);
    abrirMenu(true);
  }

  function irARevisar() {
    if (verX) mostrarX(false);
    paso = 'revisar'; mensaje = '';
    AA.marcarAjustado(false);
    const inv = invertir(matriz());
    esquinas = [[0.14, 0.14], [0.86, 0.14], [0.86, 0.86], [0.14, 0.86]].map(([x, y]) => ({ cam: aplicar(inv, x, y), pan: { x, y } }));
    abrirMenu(true);
  }

  function terminar() {
    fijarEstimados();
    // Con pocas parejas no podría reajustarse si se mueve la cámara: usa los Post-its que ve
    if (pares.length < 3) {
      const H = matriz();
      postitsCamara().forEach(c => { if (!yaUsado(c)) agregarVisto(c, H); });
    }
    paso = 'fin'; perdida = false;
    AA.reiniciarSeguimiento();
    AA.marcarAjustado(true);
    guardar();
    calcularSugerencias();
    abrirMenu(true);
  }

  /* ---------- 5. Señalar ---------- */
  // Cuanto más ajustada está la imagen, más cerca del toque debe estar el Post-it
  const RADIOS = [0.45, 0.25, 0.15, 0.12];
  const yaUsado = c => pares.some(p => Math.abs(p.cam.x - c.x) < Math.max(p.w, c.w) * 0.6 && Math.abs(p.cam.y - c.y) < Math.max(p.h, c.h) * 0.6);

  function buscarCandidato(s, H) {
    const usado = yaUsado;
    const radio = RADIOS[Math.min(pares.length, RADIOS.length - 1)];
    let mejor = null, dist = radio;
    for (const c of postitsCamara()) {
      if (usado(c)) continue;
      const q = aplicar(H, c.x, c.y);
      const d = Math.hypot(q.x - s.x, (q.y - s.y) * razon());
      if (d < dist) { dist = d; mejor = c; }
    }
    return mejor;
  }

  function agregarPareja(c, s) {
    pares.push({ cam: { x: c.x, y: c.y }, pro: { x: s.x, y: s.y }, w: c.w, h: c.h, color: c.color });
    if (pares.length >= 4) corregirParejas();
    const H = formulaConPares();
    if (!escalaCreible(H) || !aplicarFormula(H)) {
      pares.pop();
      mensaje = 'Ese punto no calza con los demás. Toca otro Post-it.';
      return false;
    }
    mensaje = `Ubicado y medido solo: ${medida(c, H)}. ` + (pares.length < 3 ? 'Señala otro.' : 'Señala otro o toca Listo.');
    return true;
  }

  function medida(c, H) {
    // El marco que sigue al Post-it mide mejor que la mancha de color recién vista
    const q = aplicar(H, c.x, c.y);
    const marco = obstaculos().find(o => q.x >= o.x && q.x <= o.x + o.width && q.y >= o.y && q.y <= o.y + o.height);
    if (marco) return enPixeles(marco);
    const ancho = Math.round(c.w * window.innerWidth * Math.hypot(H[0], H[3] * window.innerHeight / window.innerWidth));
    const alto = Math.round(c.h * window.innerHeight * Math.hypot(H[4], H[1] * window.innerWidth / window.innerHeight));
    return `${ancho} × ${alto} px`;
  }

  // Un Post-it visto con la fórmula de ahora: se guarda para reajustar, sin mover la imagen
  function agregarVisto(c, H) {
    pares.push({ cam: { x: c.x, y: c.y }, pro: aplicar(H, c.x, c.y), w: c.w, h: c.h, color: c.color });
  }

  // Un toque perdido no debe encoger, agrandar ni voltear toda la imagen
  function escalaCreible(H) {
    const puntas = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => aplicar(H, x, y));
    let area = 0;
    puntas.forEach((a, i) => { const b = puntas[(i + 1) % 4]; area += a.x * b.y - b.x * a.y; });
    area /= 2;
    return area > 0.15 && area < 12;
  }

  function deshacerToque() {
    if (!pares.length) return;
    const quitado = pares.pop();
    if (quitado.estimado) aplicarEstimado(); else aplicarFormula(formulaConPares());
    mensaje = 'Quité el último toque.';
    dibujarMenu();
  }

  // Con 4 o más puntos se revisa que cada toque se haya unido al Post-it correcto
  function corregirParejas() {
    const manchas = postitsCamara().map(c => {
      const q = aplicar(base, c.x, c.y);
      return { x: q.x, y: q.y, ancho: c.w, color: c.color, original: c };
    });
    if (manchas.length < pares.length) return;
    const r = buscarUbicacion(pares.map(p => ({ x: p.pro.x, y: p.pro.y })), manchas);
    if (r.n !== pares.length) return;
    const nuevas = pares.map((p, i) => {
      const c = manchas[r.asignados[i]].original;
      return Object.assign({}, p, { cam: { x: c.x, y: c.y }, w: c.w, h: c.h, color: c.color });
    });
    const H = homografia(nuevas.map(p => p.cam), nuevas.map(p => p.pro));
    if (H && formulaSana(H, nuevas)) pares = nuevas;
  }

  function senalar(s, reintento) {
    // Un toque en la pared da el punto real: reemplaza a lo calculado con la mini cámara
    if (pares.some(p => p.estimado)) {
      pares = pares.filter(p => !p.estimado);
      aplicarFormula(pares.length ? formulaConPares() : base.slice()); // vuelve a la imagen de antes del cálculo
    }
    const H = matriz();
    const repetido = pares.some(p => Math.hypot(p.pro.x - s.x, (p.pro.y - s.y) * razon()) < 0.035);
    if (repetido) {
      mensaje = 'Ese ya lo tengo. Señala otro o toca Listo.';
      toques.push({ x: s.x, y: s.y, bien: true, t0: performance.now() });
      dibujarMenu();
      return;
    }
    const c = buscarCandidato(s, H);
    if (c) {
      const bien = agregarPareja(c, s);
      toques.push({ x: s.x, y: s.y, bien, t0: performance.now() });
      dibujarMenu();
      return;
    }
    // No se ve ningún Post-it cerca: quizá es de un color que no conoce todavía. Se aprende.
    const inv = invertir(H);
    const q = aplicar(inv, s.x, s.y);
    if (!reintento && q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1 && window.EnsenarPostit) {
      const r = window.EnsenarPostit.aprender(q.x, q.y);
      if (r.ok) {
        mensaje = 'Aprendiendo su color…';
        dibujarMenu();
        setTimeout(() => { if (paso === 'senalar') senalar(s, true); }, 500);
        return;
      }
    }
    toques.push({ x: s.x, y: s.y, bien: false, t0: performance.now() });
    mensaje = 'Ahí no encontré un Post-it. Toca sobre el papel de color.';
    dibujarMenu();
  }

  /* ---------- 6. Corregir arrastrando ---------- */
  let arrastre = null, ultimoSeguimiento = 0;
  const puntoDe = ev => ({ x: ev.clientX / window.innerWidth, y: ev.clientY / window.innerHeight });

  function empezarArrastre(s, ev) {
    fijarEstimados();
    const W = window.innerWidth, H = window.innerHeight;
    const esq = esquinas.findIndex(e => Math.hypot((e.pan.x - s.x) * W, (e.pan.y - s.y) * H) < 22);
    if (esq >= 0) { arrastre = { tipo: 'esquina', i: esq, ultimo: s }; }
    else {
      const o = obstaculos().find(q => s.x >= q.x && s.x <= q.x + q.width && s.y >= q.y && s.y <= q.y + q.height);
      if (o) {
        const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
        const cerca = pares.find(p => Math.abs(p.pro.x - cx) < o.width && Math.abs(p.pro.y - cy) < o.height);
        if (pares.length < 3) {
          // Con pocas parejas, corregir un marco mejora toda la fórmula
          let pareja = cerca;
          if (!pareja) {
            const c = aplicar(invertir(matriz()), cx, cy);
            pareja = { cam: c, pro: { x: cx, y: cy }, w: o.width, h: o.height, color: o.color };
            pares.push(pareja);
          }
          arrastre = { tipo: 'pareja', pareja, ultimo: s };
        } else {
          // Con 3 o más, solo se corre ese marco y los demás no se mueven
          let k = ajustes.find(a => Math.abs(a.x + a.dx - cx) < o.width && Math.abs(a.y + a.dy - cy) < o.height);
          if (!k) { k = { x: cx, y: cy, dx: 0, dy: 0 }; ajustes.push(k); AA.ponerAjustesMarco(ajustes); }
          arrastre = { tipo: 'marco', marco: k, ultimo: s };
        }
      } else {
        arrastre = { tipo: 'imagen', ultimo: s };
      }
    }
    captura.setPointerCapture(ev.pointerId);
  }

  function moverArrastre(s) {
    const dx = s.x - arrastre.ultimo.x, dy = s.y - arrastre.ultimo.y;
    arrastre.ultimo = s;
    if (arrastre.tipo === 'marco') { arrastre.marco.dx += dx; arrastre.marco.dy += dy; return; }
    let H = null;
    if (arrastre.tipo === 'imagen') {
      H = multiplicar(correr(dx, dy), matriz());
      base = multiplicar(correr(dx, dy), base);
      pares.forEach(p => { p.pro.x += dx; p.pro.y += dy; });
      esquinas.forEach(e => { e.pan.x += dx; e.pan.y += dy; });
    } else if (arrastre.tipo === 'pareja') {
      arrastre.pareja.pro.x += dx; arrastre.pareja.pro.y += dy;
      H = formulaConPares();
    } else {
      const e = esquinas[arrastre.i];
      e.pan.x += dx; e.pan.y += dy;
      const nueva = homografia(esquinas.map(q => q.cam), esquinas.map(q => q.pan));
      if (!nueva || !formulaSana(nueva)) { e.pan.x -= dx; e.pan.y -= dy; return; }
      H = nueva;
      base = nueva.slice();
      pares.forEach(p => { p.pro = aplicar(nueva, p.cam.x, p.cam.y); });
    }
    if (!AA.ponerMatriz(H)) return;
    const t = performance.now();
    if (t - ultimoSeguimiento > 150) { ultimoSeguimiento = t; AA.reiniciarSeguimiento(); }
  }

  /* Mini cámara. Muestra un poco más que la imagen para poder agarrar un número que quedó afuera. */
  const MARGEN_MINI = 0.12;
  const miniAVista = v => (v + MARGEN_MINI) / (1 + 2 * MARGEN_MINI);
  const vistaAMini = v => v * (1 + 2 * MARGEN_MINI) - MARGEN_MINI;
  const acotarMini = v => Math.max(-MARGEN_MINI, Math.min(1 + MARGEN_MINI, v));
  let arrastreMini = null, ultimaMini = 0;

  // Rectángulo de la pared que el menú no tapa: sus esquinas son los números 1 a 4
  function marcoPared() {
    const W = window.innerWidth, H = window.innerHeight;
    const izq = menuAbierto && W >= 700 ? (menu.getBoundingClientRect().width + 28) / W : 0.04;
    const arriba = 26 / H, abajo = 1 - 90 / H, der = 1 - 26 / W;
    return [{ x: izq, y: arriba }, { x: der, y: arriba }, { x: der, y: abajo }, { x: izq, y: abajo }];
  }
  const numerosMini = () => {
    const inv = invertir(matriz());
    return marcoPared().map(p => aplicar(inv, p.x, p.y));
  };
  const puntoMini = ev => {
    const r = mini.getBoundingClientRect();
    return { x: vistaAMini((ev.clientX - r.left) / r.width), y: vistaAMini((ev.clientY - r.top) / r.height) };
  };

  function dibujarMini(t) {
    if (!menuAbierto || !mini.isConnected || (paso !== 'senalar' && paso !== 'revisar')) return;
    if (t - ultimaMini < 100) return;
    ultimaMini = t;
    const d = detector();
    if (!d.procWidth) return;
    mini.style.aspectRatio = d.procWidth + ' / ' + d.procHeight;
    const r = mini.getBoundingClientRect();
    const escala = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(r.width * escala), H = Math.round(r.height * escala);
    if (!W || !H) return;
    if (mini.width !== W || mini.height !== H) { mini.width = W; mini.height = H; }
    const c = mctxMini, X = v => miniAVista(v) * W, Y = v => miniAVista(v) * H;
    c.fillStyle = '#111'; c.fillRect(0, 0, W, H);
    c.drawImage(d.procCanvas, X(0), Y(0), X(1) - X(0), Y(1) - Y(0));
    c.lineWidth = 1.5 * escala; c.strokeStyle = '#fff';
    postitsCamara().forEach(p => c.strokeRect(X(p.x - p.w / 2), Y(p.y - p.h / 2), X(p.x + p.w / 2) - X(p.x - p.w / 2), Y(p.y + p.h / 2) - Y(p.y - p.h / 2)));
    const numeros = numerosMini();
    c.beginPath();
    numeros.forEach((n, i) => { const x = X(acotarMini(n.x)), y = Y(acotarMini(n.y)); if (i) c.lineTo(x, y); else c.moveTo(x, y); });
    c.closePath(); c.stroke();
    numeros.forEach((n, i) => {
      const x = X(acotarMini(n.x)), y = Y(acotarMini(n.y));
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 9 * escala, 0, 6.3); c.fill();
      c.fillStyle = '#000'; c.font = `800 ${11 * escala}px system-ui, sans-serif`; c.textAlign = 'center';
      c.fillText(String(i + 1), x, y + 4 * escala);
    });
  }

  // Fórmula aproximada para los toques en la mini cámara: sin girar ni deformar, supone que los
  // Post-its a la vista están repartidos por la pantalla. Se usan todos, no solo los tocados,
  // porque unos pocos dan una idea peor. Con un toque solo se mueve, y el tope evita que unos
  // Post-its juntos agranden la imagen de más.
  const RELLENO_ESTIMADO = 0.75, CRECER_MAX = 1.6;
  function formulaEstimada(tocados) {
    const d = detector(), W = window.innerWidth, Alto = window.innerHeight;
    const vistos = postitsCamara().map(c => ({ cam: { x: c.x, y: c.y }, w: c.w, h: c.h })).concat(tocados);
    const x0 = Math.min(...vistos.map(p => p.cam.x - p.w / 2)), x1 = Math.max(...vistos.map(p => p.cam.x + p.w / 2));
    const y0 = Math.min(...vistos.map(p => p.cam.y - p.h / 2)), y1 = Math.max(...vistos.map(p => p.cam.y + p.h / 2));
    const kBase = Math.hypot(base[0] * W / d.procWidth, base[3] * Alto / d.procWidth); // píxeles de pantalla por píxel de cámara
    let k = kBase;
    if (tocados.length >= 2) {
      k = RELLENO_ESTIMADO * Math.min(W / ((x1 - x0) * d.procWidth), Alto / ((y1 - y0) * d.procHeight));
      k = Math.max(kBase, Math.min(kBase * CRECER_MAX, k));
    }
    const sx = k * d.procWidth / W, sy = k * d.procHeight / Alto;
    return [sx, 0, 0.5 - sx * (x0 + x1) / 2, 0, sy, 0.5 - sy * (y0 + y1) / 2, 0, 0, 1];
  }

  function aplicarEstimado() {
    const tocados = pares.filter(p => p.estimado);
    const H = tocados.length ? formulaEstimada(tocados) : base.slice();
    if (!aplicarFormula(H)) return false;
    tocados.forEach(p => { p.pro = aplicar(H, p.cam.x, p.cam.y); });
    return true;
  }

  // Lo calculado pasa a ser el punto de partida: lo que se corrija a mano manda desde aquí
  function fijarEstimados() {
    if (!pares.some(p => p.estimado)) return;
    pares.forEach(p => { delete p.estimado; });
    base = matriz();
  }

  function moverNumero(i, p) {
    fijarEstimados();
    const puntos = numerosMini();
    puntos[i] = { x: acotarMini(p.x), y: acotarMini(p.y) };
    const H = homografia(puntos, marcoPared());
    if (!H || !formulaSana(H) || !AA.ponerMatriz(H)) return;
    ajusteMano = true;
    base = H.slice();
    pares.forEach(q => { q.pro = aplicar(H, q.cam.x, q.cam.y); });
    if (paso === 'revisar') {
      const inv = invertir(H);
      esquinas.forEach(e => { e.cam = aplicar(inv, e.pan.x, e.pan.y); });
    }
    const ahora = performance.now();
    if (ahora - ultimoSeguimiento > 150) { ultimoSeguimiento = ahora; AA.reiniciarSeguimiento(); }
  }

  function tocarEnMini(p, reintento) {
    const margen = 0.015;
    const c = postitsCamara().find(q => Math.abs(q.x - p.x) < q.w / 2 + margen && Math.abs(q.y - p.y) < q.h / 2 + margen);
    if (c) {
      if (yaUsado(c)) mensaje = 'Ese ya lo tengo. Toca otro.';
      else if (paso === 'senalar' && !ajusteMano && pares.every(q => q.estimado)) {
        // Todavía no hay ningún punto real de la pared: la imagen crece hasta donde están
        pares.push({ cam: { x: c.x, y: c.y }, pro: { x: 0, y: 0 }, w: c.w, h: c.h, color: c.color, estimado: true });
        if (!aplicarEstimado()) { pares.pop(); mensaje = 'No pude usar ese Post-it. Toca otro.'; }
        else {
          const cuantos = pares.length;
          mensaje = 'Midiendo…';
          setTimeout(() => {
            if (paso !== 'senalar' || pares.length !== cuantos) return;
            const final = cuantos < 3 ? 'La imagen creció. Toca otro.' : 'Si no calza, tócalos en la pared o usa los números.';
            mensaje = `Medido solo: ${medida(c, matriz())}. ${final}`;
            if (arrastreMini === null) dibujarMenu();
          }, 700);
        }
      }
      else { const H = matriz(); agregarVisto(c, H); mensaje = `Medido solo: ${medida(c, H)}. Toca otro o toca Listo.`; }
    } else if (!reintento && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && window.EnsenarPostit && window.EnsenarPostit.aprender(p.x, p.y).ok) {
      mensaje = 'Aprendiendo su color…';
      setTimeout(() => { if (paso === 'senalar' || paso === 'revisar') tocarEnMini(p, true); }, 500);
    } else mensaje = 'Ahí no encontré un Post-it. Toca sobre el papel.';
    dibujarMenu();
  }

  mini.addEventListener('pointerdown', ev => {
    const p = puntoMini(ev), r = mini.getBoundingClientRect(), n = 1 + 2 * MARGEN_MINI;
    const i = numerosMini().findIndex(q => Math.hypot((acotarMini(q.x) - p.x) / n * r.width, (acotarMini(q.y) - p.y) / n * r.height) < 14);
    ev.preventDefault();
    if (i >= 0) { arrastreMini = i; mini.setPointerCapture(ev.pointerId); return; }
    tocarEnMini(p);
  });
  mini.addEventListener('pointermove', ev => { if (arrastreMini !== null) moverNumero(arrastreMini, puntoMini(ev)); });
  const soltarMini = () => {
    if (arrastreMini === null) return;
    arrastreMini = null;
    AA.reiniciarSeguimiento();
    mensaje = 'Mira si los marcos caen sobre los Post-its.';
    dibujarMenu();
  };
  mini.addEventListener('pointerup', soltarMini);
  mini.addEventListener('pointercancel', soltarMini);

  captura.addEventListener('pointerdown', ev => {
    const s = puntoDe(ev);
    if (paso === 'senalar') senalar(s);
    else if (paso === 'revisar') empezarArrastre(s, ev);
    ev.preventDefault();
  });
  captura.addEventListener('pointermove', ev => { if (arrastre) moverArrastre(puntoDe(ev)); });
  const soltar = () => { if (arrastre) { arrastre = null; AA.reiniciarSeguimiento(); } };
  captura.addEventListener('pointerup', soltar);
  captura.addEventListener('pointercancel', soltar);

  /* ---------- 7. Sugerir dónde pegar ----------
     Se busca espacio libre dentro de lo que ve la cámara, con luz parecida al resto de la
     imagen (ni en sombra ni quemada) y fondo parejo, y repartido por la pared.          */
  function calcularSugerencias() {
    sugerencias = [];
    const inv = invertir(matriz());
    const mapa = mapaLuz || AA.imagenChica();
    const { w: mw, h: mh } = AA.tamChica;
    const luzEn = (u, v) => {
      const c = aplicar(inv, u, v);
      if (c.x < 0.01 || c.x > 0.99 || c.y < 0.01 || c.y > 0.99) return null;
      return mapa[Math.floor(c.y * mh) * mw + Math.floor(c.x * mw)];
    };
    const orden = Array.from(mapa).sort((a, b) => a - b);
    const mediana = orden[orden.length >> 1];
    const obs = obstaculos();
    const anchos = obs.map(o => o.width).sort((a, b) => a - b), altos = obs.map(o => o.height).sort((a, b) => a - b);
    const w = anchos.length ? anchos[anchos.length >> 1] : 0.07;
    const h = altos.length ? altos[altos.length >> 1] : 0.07 / razon();
    const choca = (a, b, mx, my) => a.x < b.x + b.w + mx && b.x < a.x + a.w + mx && a.y < b.y + b.h + my && b.y < a.y + a.h + my;
    const ocupados = obs.map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height }));
    const candidatos = [];
    const paso_x = w * 0.5, paso_y = h * 0.5;
    const anchoV = window.innerWidth, altoV = window.innerHeight;
    const barraHastaX = anchoV < 700 ? 1 : (24 + Math.min(430, anchoV - 300) + 16) / anchoV;
    const barraDesdeY = 1 - ((anchoV < 700 ? 186 : 140) / altoV);
    for (let y = 0.04; y + h <= 0.92; y += paso_y) for (let x = 0.04; x + w <= 0.96; x += paso_x) {
      const caja = { x, y, w, h };
      if (x + w > 0.75 && y + h + 0.05 > 0.86) continue; // ahí están los botones X, ☰ A y H
      if (x < barraHastaX && y + h + 0.05 > barraDesdeY) continue; // ahí está la barra de X
      if (ocupados.some(o => choca(caja, o, w * 0.45, h * 0.45))) continue;
      const luces = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]].map(([a, b]) => luzEn(x + w * a, y + h * b));
      if (luces.some(l => l === null || l < mediana * 0.6 || l > 245)) continue;
      const media = luces.reduce((s, l) => s + l, 0) / luces.length;
      const parejo = Math.max(...luces) - Math.min(...luces);
      const lejos = ocupados.length ? Math.min(...ocupados.map(o => Math.hypot(o.x - x, (o.y - y) * razon()))) : 0.2;
      candidatos.push({ caja, puntos: 1 - Math.abs(media - mediana) / 120 - parejo / 70 + Math.min(0.6, lejos * 2.5) });
    }
    candidatos.sort((a, b) => b.puntos - a.puntos);
    for (const c of candidatos) {
      if (sugerencias.length >= MAX_SUGERENCIAS) break;
      if (sugerencias.some(s => choca(c.caja, s, w * 0.5, h * 0.5))) continue;
      sugerencias.push(c.caja);
    }
    sugerencias.forEach((s, i) => { s.n = i + 1; });
    mensaje = textoSugerencias();
  }

  function textoSugerencias() {
    const n = sugerencias.length;
    if (!n) return 'No encontré lugares libres con buena luz.';
    if (n < MIN_SUGERENCIAS) return `Solo hay ${n} ${n === 1 ? 'lugar' : 'lugares'} con buena luz. Pega los nuevos en los recuadros azules.`;
    return `Te sugiero ${n} lugares con buena luz. Pega los nuevos en los recuadros azules.`;
  }

  // Si aparece un Post-it encima de una sugerencia, esa ya se usó
  function quitarSugerenciasUsadas() {
    const antes = sugerencias.length;
    sugerencias = sugerencias.filter(s => !obstaculos().some(o => {
      const cx = o.x + o.width / 2, cy = o.y + o.height / 2;
      return cx > s.x && cx < s.x + s.w && cy > s.y && cy < s.y + s.h;
    }));
    if (sugerencias.length !== antes) {
      mensaje = sugerencias.length
        ? `Lo capté. Quedan ${sugerencias.length} lugares sugeridos.`
        : 'Lo capté. No quedan más lugares sugeridos.';
      if (menuAbierto) dibujarMenu();
      pintarBarraX();
    }
  }

  /* ---------- 8. Reajustar si se mueve la cámara ---------- */
  const ESPERA_REAJUSTE = 900, REPETIR_REAJUSTE = 1500, VECES_REAJUSTE = 4;
  let relojReajuste = null;

  function reajustar(vez) {
    clearTimeout(relojReajuste);
    if (paso !== 'fin') return;
    if (pares.length < 3) return noPudo('Se movió la cámara y no tengo 3 Post-its señalados. Aprieta A y toca Volver a ajustar.');
    const H0 = matriz();
    const manchas = postitsCamara().map(c => {
      const q = aplicar(H0, c.x, c.y);
      return { x: q.x, y: q.y, ancho: c.w, color: c.color, original: c };
    });
    const r = manchas.length >= 3
      ? buscarUbicacion(pares.map(p => ({ x: p.pro.x, y: p.pro.y, color: p.color })), manchas)
      : { n: 0, asignados: [] };
    if (r.n < 3) {
      if (vez < VECES_REAJUSTE) { relojReajuste = setTimeout(() => reajustar(vez + 1), REPETIR_REAJUSTE); return; }
      return noPudo('Se movió la cámara y no encuentro los Post-its señalados. Aprieta A y toca Volver a ajustar.');
    }
    const vistos = [];
    pares.forEach((p, i) => {
      if (r.asignados[i] < 0) return;
      const c = manchas[r.asignados[i]].original;
      vistos.push({ cam: { x: c.x, y: c.y }, pro: p.pro });
    });
    let H = vistos.length >= 4 ? homografia(vistos.map(p => p.cam), vistos.map(p => p.pro)) : null;
    if (!H || !formulaSana(H, vistos)) {
      const { indices } = mejorTrio(vistos.map(p => p.cam));
      H = afin(indices.map(i => vistos[i].cam), indices.map(i => vistos[i].pro));
    }
    if (!H || !aplicarFormula(H)) return noPudo('Se movió la cámara y no pude reajustar. Aprieta A y toca Volver a ajustar.');
    const inv = invertir(H);
    pares.forEach((p, i) => {
      p.cam = r.asignados[i] >= 0 ? (({ x, y }) => ({ x, y }))(manchas[r.asignados[i]].original) : aplicar(inv, p.pro.x, p.pro.y);
    });
    base = H.slice();
    perdida = false;
    mapaLuz = null; // la luz medida era de la vista de antes
    AA.marcarAjustado(true);
    guardar();
    if (verX) { calcularSugerencias(); pintarBarraX(); }
    AA.aviso('Se movió la cámara: ya me reajusté');
    AA.ponerEstado('Reajustada con ' + vistos.length + ' Post-its señalados.');
  }

  function noPudo(texto) {
    perdida = true;
    mensaje = texto;
    AA.aviso(texto, 7000);
    boton.classList.add('pide');
    if (menuAbierto) dibujarMenu();
    pintarBarraX();
  }

  /* ---------- 9. Eventos y teclas A y X ---------- */
  function recuperarOEmpezar() {
    const g = leerGuardado();
    const d = detector();
    if (g && g.esquinas && g.tam === d.procWidth + 'x' + d.procHeight) {
      d.mapper.srcCorners = g.esquinas;
      d.mapper.computeHomography();
      pares = g.pares || [];
      ajustes = g.ajustes || [];
      AA.ponerAjustesMarco(ajustes);
      base = matriz();
      sugerencias = []; mensaje = 'Recuperé el ajuste anterior.';
      paso = 'fin';
      AA.reiniciarSeguimiento();
      AA.marcarAjustado(true);
      AA.ponerEstado('Ajuste recuperado. Para rehacerlo, aprieta A.');
      AA.aviso('Recuperé el ajuste anterior. Si no calza, aprieta A');
      return;
    }
    iniciarLuz();
  }

  window.addEventListener('posits-camara-lista', ev => {
    if (ev.detail.primera || paso === 'espera' || paso === 'sin') { recuperarOEmpezar(); return; }
    if (paso === 'fin' && pares.length >= 3) {
      relojReajuste = setTimeout(() => reajustar(0), ESPERA_REAJUSTE);
      return;
    }
    iniciarLuz();
  });

  window.addEventListener('posits-camara-movida', () => {
    if (paso !== 'fin') return;
    relojReajuste = setTimeout(() => reajustar(0), ESPERA_REAJUSTE);
  });

  window.addEventListener('posits-ventana-cambio', () => {
    const g = leerGuardado();
    const ahoraVentana = window.innerWidth + 'x' + window.innerHeight;
    if (g && g.ventana && g.ventana !== ahoraVentana) {
      AA.aviso('La ventana cambió de tamaño: si los marcos no calzan, aprieta A y toca Volver a ajustar', 7000);
    }
  });

  window.addEventListener('posits-modo', ev => {
    clearInterval(relojLuz); clearTimeout(relojReajuste);
    if (verX) mostrarX(false);
    if (ev.detail === 'sin') {
      paso = 'sin'; sugerencias = [];
      if (menuAbierto) dibujarMenu();
      return;
    }
    paso = 'espera';
    if (AA.camaraLista()) recuperarOEmpezar();
    else if (menuAbierto) dibujarMenu();
  });

  function tocarA(desdeTeclado) {
    if (AA.modo() === 'sin') paso = 'sin';
    if (paso === 'luzlista' && desdeTeclado) { abrirTransparencia(); return; }
    if (paso === 'espera' && AA.camaraLista()) { recuperarOEmpezar(); return; }
    abrirMenu(!menuAbierto);
  }
  boton.addEventListener('click', () => tocarA(false));
  botonX.addEventListener('click', tocarX);
  window.addEventListener('keydown', e => {
    const tecla = e.key.toLowerCase();
    if (tecla !== 'a' && tecla !== 'x') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const el = e.target;
    if (el && (el.tagName === 'TEXTAREA' || el.isContentEditable || (el.tagName === 'INPUT' && el.type !== 'range' && el.type !== 'checkbox'))) return;
    const inicio = document.getElementById('welcomeOverlay');
    if (inicio && !inicio.classList.contains('hidden')) return;
    e.preventDefault();
    if (tecla === 'a') tocarA(true); else tocarX();
  });

  // Para revisar desde la consola del navegador y en las pruebas
  window.ATransparencia = {
    estado: () => ({ paso, pares: pares.map(p => ({ cam: p.cam, pro: p.pro })), sugerencias: sugerencias.slice(), mensaje, resumenLuz, menuAbierto, perdida, ajustes: ajustes.slice(), verX, sugerenciasVisibles: sugerenciasVisibles(), ajusteMano, estimados: pares.filter(p => p.estimado).length }),
    // Dónde está un punto de la cámara dentro de la mini cámara, en píxeles de la ventana
    miniEnVentana: (x, y) => {
      const r = mini.getBoundingClientRect();
      return { x: r.left + miniAVista(x) * r.width, y: r.top + miniAVista(y) * r.height };
    },
    numerosMini,
    marcoPared
  };
})();
