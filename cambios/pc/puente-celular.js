/*
  PUENTE: celular como cámara (lado PC)
  -------------------------------------
  Este archivo lo carga index.html con una sola línea. Hace 6 cosas:
   1. Pone el botón «Iniciar celular» en la pantalla de inicio (abre el QR).
   2. Muestra la ventana con el QR para escanear.
   3. Recibe las fotos del celular y las dibuja en un lienzo (canvas).
   4. Convierte ese lienzo en una «cámara» que la app usa igual que la webcam.
      Así la detección de color, la física y la calibración no se tocan.
   5. Manda los marcos verdes al celular.
   6. Presta el lienzo a subir-foto.js (window.PuenteCamara) para usar una foto como cámara.
   7. Si el celular deja de mandar imagen, borra la última foto (así no quedan
      Post-its «fantasma») y avisa «Sin imagen del celular». Si la cámara de la
      PC se apaga o se desconecta, también se borran los Post-its y se avisa.
*/
(function () {
  'use strict';

  // La app original define la clase ColorTracker. Sin ella no hay nada que hacer.
  if (typeof ColorTracker === 'undefined') {
    console.warn('puente-celular: no se encontró ColorTracker');
    return;
  }

  // Librería gratis para dibujar el QR (se carga solo al abrir la ventana)
  const LIBRERIA_QR = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';

  /* ---------- Estado ---------- */
  let conexion = null;        // WebSocket con servidor.js
  let enlace = null;          // link que va dentro del QR
  let usarCelular = false;    // true cuando la app ya usa la cámara del celular
  let ventanaAbierta = false;
  let primeraFoto = false;    // ya llegó la primera foto de esta conexión
  let dibujando = false;
  let fotoPuesta = false;     // true mientras se usa una foto subida (el celular queda en pausa)
  let celularConectado = false;
  let trackerApp = null;      // el detector de la app (se guarda en el primer cuadro)

  // Lienzo donde se dibuja cada foto del celular. Su imagen se vuelve «cámara».
  const lienzo = document.createElement('canvas');
  lienzo.width = 640; lienzo.height = 480;
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  let camaraCelular = null;   // se crea la primera vez que se usa

  /* ---------- 4. La app pide cámara: si toca celular, se le da la del celular ----------
     Se envuelve la función original startCamera. Si se elige una webcam en la
     consola (llega deviceId), se usa la función original como siempre.        */
  const startCameraOriginal = ColorTracker.prototype.startCamera;
  ColorTracker.prototype.startCamera = async function (deviceId) {
    if ((!usarCelular && !fotoPuesta) || deviceId) {
      usarCelular = false;
      if (fotoPuesta) quitarFotoPorWebcam(); // eligió una webcam en la consola: la foto se quita
      return startCameraOriginal.call(this, deviceId);
    }
    try {
      if (this.stream && this.stream !== camaraCelular) this.stream.getTracks().forEach(t => t.stop());
      if (!camaraCelular || camaraCelular.getVideoTracks()[0].readyState === 'ended') {
        camaraCelular = lienzo.captureStream(30);
      }
      this.stream = camaraCelular;
      this.video.srcObject = camaraCelular;
      await this.video.play();
      this.updateResolution();
      // Si el celular cambia de tamaño (girarlo, cambiar calidad), la app se ajusta
      const tracker = this;
      this.video.onresize = () => tracker.updateResolution();
      this.isStreaming = true;
      this.demoMode = false;
      return { success: true };
    } catch (err) {
      console.warn('No se pudo usar la cámara del celular:', err);
      return { success: false, error: err };
    }
  };

  /* ---------- 5. Marco verde en el celular ----------
     La app llama a renderPreview con las cajas detectadas en cada cuadro.
     Se copian esas cajas y se mandan al celular (máximo 10 veces por segundo).
     Las cajas van de 0 a 1 (proporción de la imagen), así sirven para cualquier tamaño. */
  const renderPreviewOriginal = ColorTracker.prototype.renderPreview;
  let ultimoEnvioCajas = 0;
  ColorTracker.prototype.renderPreview = function (mascara, cajas) {
    renderPreviewOriginal.call(this, mascara, cajas);
    const ahora = performance.now();
    if (!usarCelular || fotoPuesta || !conexion || conexion.readyState !== 1 || ahora - ultimoEnvioCajas < 100) return;
    ultimoEnvioCajas = ahora;
    const lista = (cajas || []).map(c => {
      // Si la app tiene el espejo activado, se deshace para que calce con la vista del celular
      const x = this.flipX ? 1 - c.x - c.width : c.x;
      const y = this.flipY ? 1 - c.y - c.height : c.y;
      return [x, y, c.width, c.height].map(n => Math.round(n * 1000) / 1000);
    });
    conexion.send(JSON.stringify({ tipo: 'cajas', c: lista }));
  };

  // Guarda el detector de la app (la app lo usa en cada cuadro), para poder cambiarle la cámara
  const processFrameAnterior = ColorTracker.prototype.processFrame;
  ColorTracker.prototype.processFrame = function () {
    trackerApp = this;
    // Cámara de la PC apagada o desconectada: sin imagen no hay Post-its.
    // Antes la app se quedaba con los recuadros del último cuadro que vio.
    const pista = this.stream && this.stream.getVideoTracks ? this.stream.getVideoTracks()[0] : null;
    const sinVideo = !this.demoMode && !fotoPuesta && (!this.isStreaming || !pista || pista.readyState === 'ended');
    if (sinVideo) {
      if (this.obstacles && this.obstacles.length) this.obstacles = [];
      if (this.isStreaming && !camaraPcApagada) {
        camaraPcApagada = true;
        mostrarAviso('Sin imagen de la cámara. Revisa que esté prendida y conectada.', false);
      }
      return this.obstacles || [];
    }
    if (camaraPcApagada) { camaraPcApagada = false; ocultarAviso(); }
    return processFrameAnterior.call(this);
  };
  let camaraPcApagada = false;

  /* ---------- 6. Foto subida como cámara (lo usa subir-foto.js) ----------
     La foto se dibuja en el mismo lienzo que el celular. Mientras está puesta,
     el celular queda en pausa y su imagen no se dibuja.                        */
  let relojFoto = null;
  const alQuitarFoto = [];      // avisos para subir-foto.js cuando la foto se quita sola

  function avisarCelular(obj) {
    if (conexion && conexion.readyState === 1) conexion.send(JSON.stringify(obj));
  }

  function arrancarCamaraLienzo() {
    const inicio = document.getElementById('welcomeOverlay');
    if (inicio && !inicio.classList.contains('hidden')) {
      // La app todavía no arrancó: se usa su botón de siempre
      document.getElementById('startCameraBtn')?.click();
    } else if (trackerApp) {
      trackerApp.startCamera();
    }
  }

  function quitarFotoPorWebcam() {
    fotoPuesta = false;
    clearInterval(relojFoto);
    avisarCelular({ tipo: 'seguir' });
    alQuitarFoto.forEach(f => f());
  }

  // Cuando cambia el modo (en la PC o en el celular), el celular muestra el nuevo
  window.addEventListener('posits-modo', (e) => avisarCelular({ tipo: 'modo', modo: e.detail }));

  // Con la imagen a la vista, el celular manda fotos más livianas para que lleguen antes
  let camaraRapida = false;
  window.addEventListener('posits-camara-rapida', (e) => {
    camaraRapida = e.detail;
    avisarCelular({ tipo: 'rapida', si: camaraRapida });
  });

  window.PuenteCamara = {
    // Pone una imagen (ya cargada) como cámara
    ponerFoto(imagen) {
      const escala = Math.min(1, 1280 / Math.max(imagen.width, imagen.height));
      lienzo.width = Math.round(imagen.width * escala);
      lienzo.height = Math.round(imagen.height * escala);
      const dibujar = () => ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
      dibujar();
      clearInterval(relojFoto);
      relojFoto = setInterval(dibujar, 100); // se redibuja para que la «cámara» siga mandando cuadros
      fotoPuesta = true;
      avisarCelular({ tipo: 'pausa', texto: 'En pausa: la PC está usando una foto.' });
      cerrarVentana();
      ocultarAviso();
      if (botonInicio) botonInicio.disabled = true;
      arrancarCamaraLienzo();
    },
    // Quita la foto. Devuelve true si el celular seguía conectado y volvió solo.
    quitarFoto() {
      fotoPuesta = false;
      clearInterval(relojFoto);
      if (botonInicio) botonInicio.disabled = false;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      if (celularConectado) {
        avisarCelular({ tipo: 'seguir' });
        usarCelular = true;
        arrancarCamaraLienzo();
        return true;
      }
      return false;
    },
    usarCamaraPC() {
      usarCelular = false;
      if (trackerApp) trackerApp.startCamera(); // sin celular ni foto: la app usa la webcam como siempre
      else document.getElementById('startCameraBtn')?.click();
    },
    abrirQr: () => abrirVentana(),
    hayFoto: () => fotoPuesta,
    alQuitarFoto: (f) => alQuitarFoto.push(f)
  };

  /* ---------- Estilos (mismos colores que la app) ---------- */
  document.head.insertAdjacentHTML('beforeend', `<style>
    .cel-boton { width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;
      padding: 12px; background: #0f172a; border: 1px solid #38bdf8; border-radius: 8px; color: #38bdf8;
      font: 700 14px var(--font-main); letter-spacing: .5px; cursor: pointer; }
    .cel-boton:hover { background: #1e293b; }
    .cel-boton:disabled { opacity: .4; cursor: not-allowed; }
    .cel-icono { width: 16px; height: 16px; display: inline-grid; grid-template-columns: repeat(3, 1fr); gap: 1px; }
    .cel-icono i { background: currentColor; } .cel-icono i:nth-child(2n) { opacity: .25; }
    #celVentana { position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,.8); display: none;
      align-items: center; justify-content: center; padding: 16px; }
    #celVentana.ver { display: flex; }
    .cel-tarjeta { background: #0d1118; border: 1px solid #334155; border-radius: 12px; padding: 24px;
      width: 100%; max-width: 420px; display: flex; flex-direction: column; align-items: center; gap: 12px;
      text-align: center; color: #f8fafc; font-family: var(--font-main); box-shadow: 0 16px 40px rgba(0,0,0,.75); }
    .cel-tarjeta h2 { font-size: 20px; }
    .cel-tarjeta p { color: #94a3b8; font-size: 13px; max-width: 330px; }
    .cel-qr { background: #fff; padding: 12px; border-radius: 8px; width: 224px; height: 224px;
      display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 12px; }
    .cel-qr img, .cel-qr canvas { display: block; width: 200px; height: 200px; }
    .cel-enlace { font: 12px var(--font-mono); color: #38bdf8; word-break: break-all; user-select: text; }
    .cel-estado { font: 600 13px var(--font-mono); padding: 6px 12px; border-radius: 999px;
      border: 1px solid #eab308; color: #eab308; }
    .cel-estado.ok { border-color: #10b981; color: #10b981; }
    .cel-estado.mal { border-color: #f43f5e; color: #f43f5e; }
    .cel-cerrar { font: 600 12px var(--font-main); padding: 8px 16px; border-radius: 6px; border: 1px solid #334155;
      background: #1e293b; color: #f8fafc; cursor: pointer; }
    /* Con el celular ya conectado: el QR se achica para dejar lugar a la vista previa */
    .cel-tarjeta { max-height: calc(100vh - 32px); overflow-y: auto; }
    .cel-tarjeta.conectado .cel-qr { width: 120px; height: 120px; padding: 8px; }
    .cel-tarjeta.conectado .cel-qr img, .cel-tarjeta.conectado .cel-qr canvas { width: 104px; height: 104px; }
    .cel-tarjeta.conectado .cel-enlace { display: none; }
    .cel-previa { display: block; max-width: 100%; max-height: 180px; border-radius: 8px; border: 1px solid #334155;
      background: #000; }
    .cel-iniciar { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #38bdf8; background: #0284c7;
      color: #fff; font: 700 15px var(--font-main); cursor: pointer; }
    .cel-iniciar:hover { background: #0369a1; }
    .cel-previa[hidden], .cel-iniciar[hidden] { display: none; }
    #celAviso { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 10001; display: none;
      align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center; max-width: calc(100vw - 32px);
      background: #7f1d1d; border: 1px solid #f43f5e; color: #fff; padding: 10px 16px; border-radius: 8px;
      font: 600 13px var(--font-main); }
    #celAviso.ver { display: flex; }
    #celAviso button { font: inherit; padding: 5px 12px; border-radius: 6px; border: 1px solid #fff;
      background: transparent; color: #fff; cursor: pointer; }
  </style>`);

  /* ---------- 1. Botón en la pantalla de inicio ---------- */
  const icono = '<span class="cel-icono">' + '<i></i>'.repeat(9) + '</span>';
  const zonaBotones = document.querySelector('#welcomeOverlay .modal-actions');
  let botonInicio = null;
  if (zonaBotones) {
    botonInicio = document.createElement('button');
    botonInicio.type = 'button';
    botonInicio.className = 'cel-boton';
    botonInicio.innerHTML = icono + ' Iniciar celular';
    botonInicio.onclick = abrirVentana;
    zonaBotones.appendChild(botonInicio);
  }

  /* ---------- 2. Ventana del QR ---------- */
  document.body.insertAdjacentHTML('beforeend', `
    <div id="celVentana" role="dialog" aria-label="Conectar celular">
      <div class="cel-tarjeta" id="celTarjeta">
        <h2>Escanea este código con tu celular</h2>
        <p>Abre la cámara del celular y apunta al código. Funciona aunque el celular esté en otra WiFi o con datos móviles.</p>
        <div class="cel-qr" id="celQr">Preparando…</div>
        <div class="cel-enlace" id="celEnlace"></div>
        <div class="cel-estado" id="celEstado">Preparando enlace…</div>
        <!-- Aparecen cuando ya llega la imagen del celular -->
        <canvas class="cel-previa" id="celPrevia" hidden></canvas>
        <button type="button" class="cel-iniciar" id="celIniciar" hidden>Iniciar cámara del celular</button>
        <button type="button" class="cel-cerrar" id="celCerrar">Cerrar</button>
      </div>
    </div>
    <div id="celAviso"><span id="celAvisoTexto"></span><button type="button" id="celAvisoQr">Ver QR</button></div>`);

  const ventana = document.getElementById('celVentana');
  const cajaQr = document.getElementById('celQr');
  const textoEnlace = document.getElementById('celEnlace');
  const textoEstado = document.getElementById('celEstado');
  const aviso = document.getElementById('celAviso');
  const tarjeta = document.getElementById('celTarjeta');
  const previa = document.getElementById('celPrevia');
  const ctxPrevia = previa.getContext('2d');
  const botonIniciar = document.getElementById('celIniciar');

  document.getElementById('celCerrar').onclick = cerrarVentana;
  botonIniciar.onclick = empezarConCelular;

  // Muestra u oculta la vista previa y el botón «Iniciar cámara del celular»
  function celularListo(listo) {
    previa.hidden = !listo;
    botonIniciar.hidden = !listo;
    tarjeta.classList.toggle('conectado', listo);
  }

  // Copia la foto recibida a la vista previa chica (solo mientras se ve la ventana)
  function actualizarPrevia() {
    if (previa.hidden || !ventanaAbierta) return;
    const ancho = 320, alto = Math.round(320 * lienzo.height / lienzo.width);
    if (previa.width !== ancho || previa.height !== alto) { previa.width = ancho; previa.height = alto; }
    ctxPrevia.drawImage(lienzo, 0, 0, ancho, alto);
  }
  document.getElementById('celAvisoQr').onclick = () => { ocultarAviso(); abrirVentana(); };
  ventana.addEventListener('click', (e) => { if (e.target === ventana) cerrarVentana(); });
  // Que las teclas de la app (H, F, R, Espacio) no actúen mientras está abierta la ventana
  window.addEventListener('keydown', (e) => { if (ventanaAbierta) { e.stopPropagation(); if (e.key === 'Escape') cerrarVentana(); } }, true);

  function estadoVentana(texto, tipo) {
    textoEstado.textContent = texto;
    textoEstado.className = 'cel-estado' + (tipo ? ' ' + tipo : '');
  }

  function abrirVentana() {
    if (fotoPuesta) {
      // Con una foto puesta el celular está en pausa: primero hay que quitarla
      mostrarAviso('Hay una foto puesta. Quítala primero (tecla H → Cromática → «Quitar foto»).', false);
      setTimeout(ocultarAviso, 5000);
      return;
    }
    ventanaAbierta = true;
    ventana.classList.add('ver');
    if (!conexion || conexion.readyState > 1) conectar();
    else mostrarQr();
  }

  function cerrarVentana() {
    ventanaAbierta = false;
    ventana.classList.remove('ver');
  }

  function mostrarAviso(texto, conBotonQr) {
    document.getElementById('celAvisoTexto').textContent = texto;
    document.getElementById('celAvisoQr').hidden = !conBotonQr;
    aviso.classList.add('ver');
  }
  function ocultarAviso() { aviso.classList.remove('ver'); }

  // Carga la librería del QR una sola vez
  let cargaQr = null;
  function cargarLibreriaQr() {
    if (window.QRCode) return Promise.resolve();
    if (!cargaQr) cargaQr = new Promise((ok, falla) => {
      const s = document.createElement('script');
      s.src = LIBRERIA_QR; s.onload = ok; s.onerror = falla;
      document.head.appendChild(s);
    });
    return cargaQr;
  }

  async function mostrarQr() {
    if (!enlace) return;
    textoEnlace.textContent = enlace;
    try {
      await cargarLibreriaQr();
      cajaQr.innerHTML = '';
      new QRCode(cajaQr, { text: enlace, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
    } catch (e) {
      cajaQr.textContent = 'No se pudo dibujar el QR (¿sin internet?). Escribe el link de abajo en el celular.';
    }
  }

  /* ---------- 3. Conexión con servidor.js y fotos del celular ---------- */
  function conectar() {
    if (location.protocol === 'file:') {
      estadoVentana('Abre la app con cambios\\iniciar.cmd (no con doble clic en index.html).', 'mal');
      cajaQr.textContent = 'Sin servidor';
      return;
    }
    estadoVentana('Preparando enlace…');
    // https (Render) necesita conexión segura wss://; en la PC (http) basta ws://
    const protocolo = location.protocol === 'https:' ? 'wss://' : 'ws://';
    conexion = new WebSocket(protocolo + location.host + '/ws?rol=pc');
    conexion.binaryType = 'blob';
    let llegoAlgo = false;

    conexion.onmessage = (e) => {
      llegoAlgo = true;
      if (typeof e.data !== 'string') return recibirFoto(e.data);
      const msg = JSON.parse(e.data);

      if (msg.tipo === 'sala') {
        enlace = msg.enlace;
        if (enlace) { estadoVentana('● Esperando celular…'); mostrarQr(); }
        else if (msg.problemaTunel) { estadoVentana(msg.problemaTunel, 'mal'); cajaQr.textContent = 'Sin enlace'; }
        else { estadoVentana('Creando enlace por internet… (unos segundos)'); cajaQr.textContent = 'Preparando…'; }
      }
      if (msg.tipo === 'celular-dentro') {
        celularConectado = true;
        if (window.AutoAjuste && window.AutoAjuste.modo) avisarCelular({ tipo: 'modo', modo: window.AutoAjuste.modo() });
        if (fotoPuesta) avisarCelular({ tipo: 'pausa', texto: 'En pausa: la PC está usando una foto.' });
        if (camaraRapida) avisarCelular({ tipo: 'rapida', si: true });
        primeraFoto = false;
        ocultarAviso();
        estadoVentana('● Celular conectado. Recibiendo imagen…', 'ok');
      }
      // Botón «Modo» del celular: cambia entre «Con proyector» y «Sin proyector»
      if (msg.tipo === 'cambiar-modo' && window.AutoAjuste && window.AutoAjuste.cambiarModo) {
        window.AutoAjuste.cambiarModo(msg.modo);
      }
      if (msg.tipo === 'celular-fuera') {
        celularConectado = false;
        estadoVentana('● Esperando celular…');
        celularListo(false); // sin celular, el botón de iniciar se esconde
        borrarImagen(false);  // el aviso de abajo ya explica qué pasó
        if (usarCelular) mostrarAviso('Celular desconectado. Vuelve a abrir el link en el celular o escanea el QR de nuevo.', true);
      }
    };

    conexion.onclose = () => {
      if (!llegoAlgo) {
        estadoVentana('No hay servidor. Abre la app con cambios\\iniciar.cmd.', 'mal');
        cajaQr.textContent = 'Sin servidor';
      } else if (usarCelular) {
        mostrarAviso('Se apagó el servidor (ventana de iniciar.cmd). Ábrelo de nuevo y recarga esta página.', false);
      } else {
        estadoVentana('Se apagó el servidor. Abre cambios\\iniciar.cmd y recarga.', 'mal');
      }
      enlace = null;
    };
  }

  async function recibirFoto(foto) {
    if (fotoPuesta) return;     // hay una foto subida: la imagen del celular no se usa
    if (dibujando) {            // si llegan dos juntas, se salta una, pero se confirma igual
      if (conexion && conexion.readyState === 1) conexion.send('ok');
      return;
    }
    dibujando = true;
    try {
      const imagen = await createImageBitmap(foto);
      if (lienzo.width !== imagen.width || lienzo.height !== imagen.height) {
        // Si la imagen pasó de vertical a horizontal (o al revés), el celular giró:
        // la calibración de 4 esquinas puede quedar corrida, se avisa.
        const antesHorizontal = lienzo.width > lienzo.height;
        const ahoraHorizontal = imagen.width > imagen.height;
        if (yaHuboFoto && antesHorizontal !== ahoraHorizontal) avisoGiro();
        lienzo.width = imagen.width; lienzo.height = imagen.height;
      }
      yaHuboFoto = true;
      ctx.drawImage(imagen, 0, 0);
      imagen.close();
    } catch (e) { /* foto dañada: se ignora */ }
    dibujando = false;
    if (conexion && conexion.readyState === 1) conexion.send('ok'); // pide la siguiente

    if (!primeraFoto) {
      primeraFoto = true;
      if (!usarCelular) {
        // Primera imagen: se muestra la vista previa y el botón para iniciar (ya no arranca sola)
        estadoVentana('● Celular conectado', 'ok');
        celularListo(true);
      } else if (ventanaAbierta) {
        // Ya se usaba el celular y se volvió a conectar: la ventana se cierra sola
        cerrarVentana();
      }
    }
    actualizarPrevia();
    horaUltimaFoto = performance.now();
    if (sinImagen) { sinImagen = false; ocultarAviso(); }
  }

  /* ---------- 7. Sin imagen del celular ----------
     Si se toca «Detener», se bloquea el celular o se corta internet, dejan de
     llegar fotos y el lienzo se quedaba con la última: la app seguía viendo
     esos Post-its. Ahora, a los 1,5 s sin fotos, el lienzo se pone negro.     */
  const ESPERA_SIN_FOTO = 1500; // milisegundos
  let horaUltimaFoto = 0;
  let sinImagen = false;
  function borrarImagen(conAviso) {
    if (fotoPuesta) return; // una foto subida se queda fija a propósito
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    sinImagen = true;
    if (conAviso && usarCelular) mostrarAviso('Sin imagen del celular', false);
  }
  setInterval(() => {
    if (!usarCelular || fotoPuesta || sinImagen || !horaUltimaFoto) return;
    if (performance.now() - horaUltimaFoto > ESPERA_SIN_FOTO) borrarImagen(true);
  }, 500);

  // Aviso «El celular giró»: se va solo a los 8 segundos
  let yaHuboFoto = false;
  let relojAvisoGiro = null;
  function avisoGiro() {
    if (!usarCelular) return;
    if (window.autoAjusteActivo) return; // auto-ajuste.js vuelve a medir solo
    mostrarAviso('El celular giró: revisa la calibración (tecla H → Calibración).', false);
    clearTimeout(relojAvisoGiro);
    relojAvisoGiro = setTimeout(ocultarAviso, 8000);
  }

  // Botón «Iniciar cámara del celular»: se cierra la ventana y la app arranca con el celular
  function empezarConCelular() {
    celularListo(false);
    cerrarVentana();
    usarCelular = true;
    // Se usa el mismo botón de la app («Iniciar Dispositivo de Video»):
    // hace todo lo de siempre, pero startCamera ahora entrega la cámara del celular.
    const iniciar = document.getElementById('startCameraBtn');
    if (iniciar) iniciar.click();
  }
})();
