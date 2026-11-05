/*
  SUBIR FOTO
  ----------
  Permite subir una foto (JPG, PNG, WebP…) y usarla en vez de la cámara:
  la app busca los Post-its en la foto y las bolitas rebotan en ellos.

  - Mientras la foto está puesta, la cámara del celular queda en pausa.
  - Al quitar la foto: si el celular seguía conectado vuelve solo; si no,
    se elige «Conectar celular (QR)» o «Cámara de la PC».
  - La foto no se guarda: al recargar la página se olvida.

  Usa window.PuenteCamara (de puente-celular.js), por eso se carga después.

  Bloques:
   1. Selector de archivo (oculto)
   2. Botón «Subir foto» en la pantalla de inicio
   3. Fila «Foto de prueba» en la consola (tecla H → Cromática)
   4. Cargar la foto y ponerla
   5. Quitar la foto y elegir cámara
   6. Avisos cortos
   7. Miniatura en la esquina (abajo a la izquierda) con los Post-its encontrados
*/
(function () {
  'use strict';
  const puente = window.PuenteCamara;
  if (!puente) { console.warn('subir-foto: falta puente-celular.js'); return; }

  let nombreFoto = '';

  /* ---------- Estilos ---------- */
  document.head.insertAdjacentHTML('beforeend', `<style>
    .sf-fila { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .sf-fila .btn { flex: 1 1 140px; }
    .sf-fila [hidden] { display: none !important; } /* los botones de la app ignoran «hidden» sin esto */
    .sf-nombre { flex: 1 1 100%; font: 12px var(--font-mono); color: var(--accent-cyan);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #sfElegir { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.8); display: none;
      align-items: center; justify-content: center; padding: 16px; }
    #sfElegir.ver { display: flex; }
    #sfElegir .sf-tarjeta { background: #0d1118; border: 1px solid #334155; border-radius: 12px; padding: 24px;
      width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: 10px; text-align: center;
      color: #f8fafc; font-family: var(--font-main); }
    #sfElegir h3 { font-size: 18px; margin-bottom: 4px; }
    #sfElegir button { padding: 12px; border-radius: 8px; font: 700 14px var(--font-main); cursor: pointer;
      border: 1px solid #38bdf8; background: #0284c7; color: #fff; }
    #sfElegir button.sf-sec { background: #1e293b; border-color: #334155; font-weight: 600; font-size: 12px; }
    #sfMini { position: fixed; left: 16px; bottom: 16px; z-index: 998; width: 218px; padding: 8px;
      background: rgba(13,17,24,.92); border: 1px solid #334155; border-radius: 8px;
      font-family: var(--font-main); color: #f8fafc; box-shadow: 0 8px 24px rgba(0,0,0,.6); }
    #sfMini[hidden] { display: none; }
    .sf-mini-arriba { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .sf-mini-nombre { flex: 1; min-width: 0; font: 600 11px var(--font-main); color: #cbd5e1;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sf-mini-x { flex: none; width: 22px; height: 22px; border-radius: 4px; border: 1px solid #475569;
      background: #1e293b; color: #f8fafc; font: 700 12px var(--font-main); cursor: pointer; line-height: 1; }
    .sf-mini-x:hover { background: #7f1d1d; border-color: #f43f5e; }
    #sfMiniLienzo { display: block; width: 200px; border-radius: 4px; background: #000; }
    .sf-mini-cuenta { margin-top: 6px; font: 700 12px var(--font-mono); color: #10b981; }
    /* Los avisos de la app salen en esta misma esquina: con miniatura, se suben encima de ella */
    body.sf-con-mini .toast-container { bottom: calc(24px + var(--sf-alto-mini, 230px)); }
  </style>`);

  /* ---------- 1. Selector de archivo (oculto) ---------- */
  const selector = document.createElement('input');
  selector.type = 'file';
  selector.accept = 'image/*';
  selector.hidden = true;
  document.body.appendChild(selector);
  selector.addEventListener('change', () => {
    const archivo = selector.files && selector.files[0];
    selector.value = ''; // permite volver a elegir la misma foto
    if (archivo) cargarFoto(archivo);
  });
  const abrirSelector = () => selector.click();

  /* ---------- 2. Botón en la pantalla de inicio (debajo de «Iniciar celular») ---------- */
  const zonaInicio = document.querySelector('#welcomeOverlay .modal-actions');
  if (zonaInicio) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cel-boton';       // mismo estilo que «Iniciar celular»
    b.textContent = 'Subir foto';
    b.onclick = abrirSelector;
    zonaInicio.appendChild(b);
  }

  /* ---------- 7. Miniatura en la esquina ----------
     Se arma antes que la fila de la consola porque dibujarFila() la muestra u oculta.
     Muestra lo mismo que analiza la app y un marco del color de cada Post-it encontrado. */
  document.body.insertAdjacentHTML('beforeend', `
    <div id="sfMini" hidden>
      <div class="sf-mini-arriba">
        <span class="sf-mini-nombre" id="sfMiniNombre"></span>
        <button type="button" class="sf-mini-x" id="sfMiniX" title="Quitar foto">✕</button>
      </div>
      <canvas id="sfMiniLienzo" width="200" height="150"></canvas>
      <div class="sf-mini-cuenta" id="sfMiniCuenta">Buscando…</div>
    </div>`);
  const mini = document.getElementById('sfMini');
  const miniNombre = document.getElementById('sfMiniNombre');
  const miniLienzo = document.getElementById('sfMiniLienzo');
  const miniCtx = miniLienzo.getContext('2d');
  const miniCuenta = document.getElementById('sfMiniCuenta');
  document.getElementById('sfMiniX').onclick = () => quitarFoto();

  // La app llama a renderPreview en cada cuadro con las cajas encontradas.
  // Con una foto puesta, se copia esa imagen y esas cajas a la miniatura (5 veces por segundo).
  let ultimoDibujo = 0;
  const renderPreviewAnterior = ColorTracker.prototype.renderPreview;
  ColorTracker.prototype.renderPreview = function (mascara, cajas) {
    renderPreviewAnterior.call(this, mascara, cajas);
    const ahora = performance.now();
    if (!puente.hayFoto() || ahora - ultimoDibujo < 200) return;
    ultimoDibujo = ahora;

    const ancho = 200, alto = Math.round(200 * this.procHeight / this.procWidth);
    if (miniLienzo.width !== ancho || miniLienzo.height !== alto) { miniLienzo.width = ancho; miniLienzo.height = alto; }
    miniCtx.drawImage(this.procCanvas, 0, 0, ancho, alto); // la misma imagen que analiza la app
    miniCtx.lineWidth = 2;
    for (const c of cajas || []) {
      miniCtx.strokeStyle = c.colorReal || c.muestra || '#00e5ff'; // modo «un color»: celeste, como la consola
      miniCtx.strokeRect(c.x * ancho, c.y * alto, c.width * ancho, c.height * alto);
    }
    const n = (cajas || []).length;
    miniCuenta.textContent = n === 1 ? '1 Post-it' : n + ' Post-its';
    document.body.style.setProperty('--sf-alto-mini', (mini.offsetHeight + 12) + 'px');
  };

  /* ---------- 3. Fila en la consola (pestaña Cromática, arriba de la vista de cámara) ---------- */
  const fila = document.createElement('div');
  fila.className = 'control-group';
  fila.innerHTML = `
    <label>Foto de prueba:</label>
    <div class="sf-fila">
      <span class="sf-nombre" id="sfNombre" hidden></span>
      <button type="button" class="btn btn-sm btn-secondary" id="sfSubir">Subir foto</button>
      <button type="button" class="btn btn-sm btn-secondary" id="sfQuitar" hidden>Quitar foto</button>
    </div>`;
  const vistaCamara = document.querySelector('#tab-color .video-preview-container');
  if (vistaCamara) vistaCamara.before(fila);
  else document.getElementById('tab-color')?.appendChild(fila);

  const textoNombre = fila.querySelector('#sfNombre');
  const botonSubir = fila.querySelector('#sfSubir');
  const botonQuitar = fila.querySelector('#sfQuitar');
  botonSubir.onclick = abrirSelector;
  botonQuitar.onclick = quitarFoto;

  function dibujarFila() {
    const hay = puente.hayFoto();
    mini.hidden = !hay;                       // la miniatura de la esquina va junto con la foto
    miniNombre.textContent = 'Foto: ' + nombreFoto;
    miniCuenta.textContent = 'Buscando…';
    document.body.classList.toggle('sf-con-mini', hay);
    textoNombre.hidden = !hay;
    textoNombre.textContent = hay ? 'Usando: ' + nombreFoto : '';
    botonQuitar.hidden = !hay;
    botonSubir.textContent = hay ? 'Cambiar foto' : 'Subir foto';
  }

  /* ---------- 4. Cargar la foto y ponerla ---------- */
  function cargarFoto(archivo) {
    if (!archivo.type.startsWith('image/')) return avisar('Ese archivo no es una imagen.', 'warning');
    const url = URL.createObjectURL(archivo);
    const imagen = new Image();
    imagen.onload = () => {
      nombreFoto = archivo.name;
      puente.ponerFoto(imagen);
      URL.revokeObjectURL(url);
      dibujarFila();
      avisar('Foto puesta: buscando Post-its.', 'success');
    };
    imagen.onerror = () => { URL.revokeObjectURL(url); avisar('No se pudo abrir la foto.', 'warning'); };
    imagen.src = url;
  }

  /* ---------- 5. Quitar la foto y elegir cámara ---------- */
  document.body.insertAdjacentHTML('beforeend', `
    <div id="sfElegir" role="dialog" aria-label="Elegir cámara">
      <div class="sf-tarjeta">
        <h3>¿Qué cámara usar ahora?</h3>
        <button type="button" id="sfQr">Conectar celular (QR)</button>
        <button type="button" id="sfPc">Cámara de la PC</button>
        <button type="button" class="sf-sec" id="sfCerrar">Cerrar</button>
      </div>
    </div>`);
  const ventanaElegir = document.getElementById('sfElegir');
  const cerrarElegir = () => ventanaElegir.classList.remove('ver');
  document.getElementById('sfCerrar').onclick = cerrarElegir;
  document.getElementById('sfQr').onclick = () => { cerrarElegir(); puente.abrirQr(); };
  document.getElementById('sfPc').onclick = () => { cerrarElegir(); puente.usarCamaraPC(); };

  function quitarFoto() {
    const volvioCelular = puente.quitarFoto();
    dibujarFila();
    if (volvioCelular) avisar('Foto quitada. Se volvió a la cámara del celular.', 'success');
    else ventanaElegir.classList.add('ver');
  }

  // Si se elige una webcam en la consola, la foto se quita sola: se actualiza la fila
  puente.alQuitarFoto(dibujarFila);

  /* ---------- 6. Avisos cortos (mismo estilo que los de la app) ---------- */
  function avisar(texto, tipo) {
    const zona = document.getElementById('toastContainer');
    if (!zona) return;
    const aviso = document.createElement('div');
    aviso.className = 'toast ' + (tipo || 'info');
    aviso.textContent = texto;
    zona.appendChild(aviso);
    setTimeout(() => { aviso.style.transition = 'opacity .3s'; aviso.style.opacity = '0'; }, 3200);
    setTimeout(() => aviso.remove(), 3500);
  }
})();
