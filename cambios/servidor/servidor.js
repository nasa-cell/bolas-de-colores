/*
  SERVIDOR: celular como cámara
  ------------------------------
  Qué hace, en orden:
   1. Muestra la app (index.html) en http://localhost:8080
   2. Abre un "túnel" gratis de Cloudflare: un link https público para que el
      celular entre desde cualquier WiFi o con datos móviles.
   3. Pasa las fotos que manda el celular a la app de la PC (por WebSocket).

  Se arranca con cambios\iniciar.cmd (o: node servidor\servidor.js). No necesita npm install.
*/

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, exec } = require('child_process');

const PUERTO = Number(process.env.PUERTO) || 8080; // se puede cambiar con la variable PUERTO
// Este archivo está en posits2/cambios/servidor/
const CARPETA_APP = path.resolve(__dirname, '..', '..');                    // la carpeta posits2
const CLOUDFLARED = path.resolve(__dirname, '..', 'herramientas', 'cloudflared.exe');
const PAGINA_CELULAR = '/cambios/celular/celular.html';

// Estado del túnel: el link público cuando ya está listo.
let enlacePublico = null;
let problemaTunel = null;      // texto si el túnel no pudo arrancar

// Cada "sala" une una PC con un celular. La clave es el código que va en el QR.
// salas: codigo -> { pc: conexion, celular: conexion }
const salas = new Map();

/* ---------- 1. Página web ---------- */

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

// Lo que llega por el túnel trae la cabecera "cf-ray" de Cloudflare.
// Desde internet solo se deja ver la página del celular, nada más.
function vieneDeInternet(req) {
  return Boolean(req.headers['cf-ray']);
}

const servidor = http.createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);

  if (vieneDeInternet(req) && ruta !== PAGINA_CELULAR) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Solo se permite la página del celular.');
  }

  // Evita salir de la carpeta de la app (por ejemplo con "../")
  const archivo = path.resolve(CARPETA_APP, '.' + (ruta === '/' ? '/index.html' : ruta));
  if (!archivo.startsWith(CARPETA_APP + path.sep)) {
    res.writeHead(403); return res.end();
  }

  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(datos);
  });
});

/* ---------- 2. WebSocket (hecho a mano, sin librerías) ----------
   Un WebSocket es una conexión que queda abierta para mandar mensajes
   en los dos sentidos. Aquí está lo justo que necesita esta app.          */

const LIMITE_MENSAJE = 8 * 1024 * 1024; // 8 MB: más que suficiente para una foto

function crearConexion(socket) {
  const con = { socket, abierta: true, alRecibir: () => {}, alCerrar: () => {} };
  let pendiente = Buffer.alloc(0);
  let partes = [], tipoParte = 0;

  con.enviar = (dato) => {
    if (!con.abierta) return;
    const esTexto = typeof dato === 'string';
    const cuerpo = esTexto ? Buffer.from(dato) : dato;
    socket.write(Buffer.concat([cabeceraMarco(esTexto ? 1 : 2, cuerpo.length), cuerpo]));
  };
  con.enviarJSON = (obj) => con.enviar(JSON.stringify(obj));
  con.cerrar = () => {
    if (!con.abierta) return;
    con.abierta = false;
    try { socket.write(cabeceraMarco(8, 0)); } catch (e) {}
    socket.end();
    con.alCerrar();
  };
  // Cuántos datos quedan sin salir (para no amontonar fotos)
  con.atascado = () => socket.writableLength > 2 * 1024 * 1024;

  socket.on('data', (trozo) => {
    pendiente = Buffer.concat([pendiente, trozo]);
    // Puede llegar más de un marco junto, o medio marco: se procesa lo completo
    while (true) {
      const marco = leerMarco(pendiente);
      if (marco === null) break;                       // falta que llegue más
      if (marco === 'error') return con.cerrar();
      pendiente = pendiente.subarray(marco.largoTotal);

      if (marco.tipo === 8) return con.cerrar();                                   // cerrar
      if (marco.tipo === 9) { socket.write(Buffer.concat([cabeceraMarco(10, marco.datos.length), marco.datos])); continue; } // ping
      if (marco.tipo === 10) continue;                                             // pong

      if (marco.tipo !== 0) { tipoParte = marco.tipo; partes = []; }
      partes.push(marco.datos);
      if (!marco.fin) continue;                       // mensaje partido en varios marcos

      const completo = Buffer.concat(partes);
      partes = [];
      con.alRecibir(tipoParte === 1 ? completo.toString('utf8') : completo);
    }
  });
  socket.on('close', () => { if (con.abierta) { con.abierta = false; con.alCerrar(); } });
  socket.on('error', () => {});
  return con;
}

function cabeceraMarco(tipo, largo) {
  if (largo < 126) return Buffer.from([0x80 | tipo, largo]);
  if (largo < 65536) {
    const b = Buffer.alloc(4); b[0] = 0x80 | tipo; b[1] = 126; b.writeUInt16BE(largo, 2); return b;
  }
  const b = Buffer.alloc(10); b[0] = 0x80 | tipo; b[1] = 127; b.writeBigUInt64BE(BigInt(largo), 2); return b;
}

function leerMarco(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const tipo = buf[0] & 0x0f;
  const conMascara = (buf[1] & 0x80) !== 0;
  let largo = buf[1] & 0x7f;
  let pos = 2;
  if (largo === 126) { if (buf.length < 4) return null; largo = buf.readUInt16BE(2); pos = 4; }
  else if (largo === 127) { if (buf.length < 10) return null; largo = Number(buf.readBigUInt64BE(2)); pos = 10; }
  if (largo > LIMITE_MENSAJE || !conMascara) return 'error'; // el navegador siempre manda con máscara
  if (buf.length < pos + 4 + largo) return null;
  const mascara = buf.subarray(pos, pos + 4); pos += 4;
  const datos = Buffer.alloc(largo);
  for (let i = 0; i < largo; i++) datos[i] = buf[pos + i] ^ mascara[i % 4];
  return { fin, tipo, datos, largoTotal: pos + largo };
}

servidor.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x');
  const clave = req.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || !clave) return socket.destroy();

  const rol = url.searchParams.get('rol');
  // Desde internet solo puede entrar el celular
  if (vieneDeInternet(req) && rol !== 'celular') return socket.destroy();

  const aceptar = crypto.createHash('sha1').update(clave + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
               'Sec-WebSocket-Accept: ' + aceptar + '\r\n\r\n');
  socket.setNoDelay(true);
  const con = crearConexion(socket);

  if (rol === 'pc') entraPC(con);
  else if (rol === 'celular') entraCelular(con, (url.searchParams.get('sala') || '').toUpperCase());
  else con.cerrar();
});

/* ---------- 3. Salas: unir PC con celular ---------- */

function nuevoCodigo() {
  // Letras y números fáciles de leer (sin 0/O ni 1/I)
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo;
  do {
    codigo = Array.from(crypto.randomBytes(8), b => letras[b % letras.length]).join('');
  } while (salas.has(codigo));
  return codigo;
}

function enlaceCelular(codigo) {
  return enlacePublico ? enlacePublico + PAGINA_CELULAR + '?sala=' + codigo : null;
}

function estadoParaPC(codigo) {
  return { tipo: 'sala', codigo, enlace: enlaceCelular(codigo), problemaTunel };
}

function entraPC(con) {
  const codigo = nuevoCodigo();
  const sala = { pc: con, celular: null };
  salas.set(codigo, sala);
  con.enviarJSON(estadoParaPC(codigo));
  console.log('PC conectada. Sala ' + codigo);

  // Lo que manda la PC va al celular:
  //  - "ok" cuando ya dibujó una foto (el celular manda la siguiente)
  //  - las cajas de los Post-its detectados (para el marco verde)
  con.alRecibir = (msg) => {
    if (typeof msg === 'string' && sala.celular && !sala.celular.atascado()) sala.celular.enviar(msg);
  };
  con.alCerrar = () => {
    salas.delete(codigo);
    if (sala.celular) { sala.celular.enviarJSON({ tipo: 'pc-fuera' }); sala.celular.cerrar(); }
    console.log('PC desconectada. Sala ' + codigo + ' cerrada');
  };
}

function entraCelular(con, codigo) {
  const sala = salas.get(codigo);
  if (!sala) {
    con.enviarJSON({ tipo: 'error', texto: 'Este código ya no sirve. Escanea el QR nuevo de la PC.' });
    return setTimeout(() => con.cerrar(), 200);
  }
  // Si ya había un celular en la sala, el nuevo lo reemplaza
  if (sala.celular) { const viejo = sala.celular; sala.celular = null; viejo.cerrar(); }
  sala.celular = con;
  sala.pc.enviarJSON({ tipo: 'celular-dentro' });
  con.enviarJSON({ tipo: 'bienvenido' });
  console.log('Celular conectado a la sala ' + codigo);

  con.alRecibir = (msg) => {
    if (typeof msg === 'string') return sala.pc.enviar(msg); // avisos de texto del celular
    if (!sala.pc.atascado()) sala.pc.enviar(msg);            // foto: se pasa tal cual
  };
  con.alCerrar = () => {
    if (sala.celular !== con) return;           // ya lo había reemplazado otro celular
    sala.celular = null;
    if (sala.pc.abierta) sala.pc.enviarJSON({ tipo: 'celular-fuera' });
    console.log('Celular desconectado de la sala ' + codigo);
  };
}

/* ---------- 4. Túnel de Cloudflare ---------- */

function abrirTunel() {
  if (!fs.existsSync(CLOUDFLARED)) {
    problemaTunel = 'Falta el programa cloudflared.exe en cambios\\herramientas. Mira cambios\\LEEME.md.';
    console.log('AVISO: ' + problemaTunel);
    return avisarPCs();
  }
  console.log('Abriendo túnel por internet (tarda unos segundos)...');
  const tunel = spawn(CLOUDFLARED, ['tunnel', '--url', 'http://127.0.0.1:' + PUERTO, '--no-autoupdate'],
                      { windowsHide: true });
  const buscarEnlace = (texto) => {
    const hallado = String(texto).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (hallado && !enlacePublico) {
      enlacePublico = hallado[0];
      problemaTunel = null;
      console.log('Túnel listo: ' + enlacePublico);
      avisarPCs();
    }
  };
  tunel.stdout.on('data', buscarEnlace);
  tunel.stderr.on('data', buscarEnlace);
  tunel.on('exit', (codigo) => {
    enlacePublico = null;
    problemaTunel = 'El túnel se cerró (código ' + codigo + '). ¿Hay internet? Cierra y vuelve a abrir iniciar.cmd.';
    console.log('AVISO: ' + problemaTunel);
    avisarPCs();
  });
  // Al cerrar el servidor, también se cierra el túnel
  const cerrar = () => { try { tunel.kill(); } catch (e) {} process.exit(0); };
  process.on('SIGINT', cerrar);
  process.on('SIGTERM', cerrar);
  process.on('exit', () => { try { tunel.kill(); } catch (e) {} });
}

function avisarPCs() {
  for (const [codigo, sala] of salas) sala.pc.enviarJSON(estadoParaPC(codigo));
}

/* ---------- Arranque ---------- */

servidor.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('El puerto ' + PUERTO + ' ya está ocupado. Cierra la otra ventana del servidor y vuelve a intentar.');
  } else {
    console.log('Error del servidor:', err.message);
  }
  process.exit(1);
});

// Solo escucha en esta PC (127.0.0.1). Desde fuera se entra únicamente por el túnel.
servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log('App lista en http://localhost:' + PUERTO);
  if (!process.argv.includes('--sin-tunel')) abrirTunel();
  if (process.argv.includes('--abrir')) exec('start "" "http://localhost:' + PUERTO + '/"');
});
