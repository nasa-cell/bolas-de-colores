/*
  PINTAR COLORES
  --------------
  Cada bolita toma el color del Post-it con que choca:
  rebota en el rosado → se vuelve rosada; luego en el verde → verde.

  Se prende o apaga en la consola (tecla H → pestaña Física → «Pintar colores»).
  Lo carga index.html con una línea. Si se borra la línea, las bolitas son como antes.

  Bloques:
   1. Estado (prendido/apagado, se recuerda al recargar)
   2. Saber el color de cada Post-it en cada cuadro
   3. Al chocar: pintar la bolita
   4. Colores de la bolita (base, sombra y brillo)
   5. Interruptor en la consola
*/
(function () {
  'use strict';
  if (typeof PhysicsEngine === 'undefined') return;

  /* ---------- 1. Estado ---------- */
  const CLAVE = 'posits-pintar-colores-v1';
  let pintar = true; // prendido por defecto
  try { const g = localStorage.getItem(CLAVE); if (g !== null) pintar = g === '1'; } catch (e) {}

  /* ---------- 2. Color de cada Post-it ----------
     La app pasa los Post-its al motor de física en cada cuadro. Dentro del motor
     se convierten a pixeles y se pierde el color, así que aquí se arma una tabla
     «posición en pixeles → color» con la MISMA cuenta que hace el motor.        */
  let colorPorPosicion = new Map();
  const updateOriginal = PhysicsEngine.prototype.update;
  PhysicsEngine.prototype.update = function (obstaculos, tiempo) {
    colorPorPosicion = new Map();
    if (pintar && Array.isArray(obstaculos)) {
      for (const ob of obstaculos) {
        if (ob.color) colorPorPosicion.set((ob.x * this.width) + '|' + (ob.y * this.height), ob.color);
      }
    }
    return updateOriginal.call(this, obstaculos, tiempo);
  };

  /* ---------- 3. Al chocar: pintar la bolita ---------- */
  const choqueOriginal = PhysicsEngine.prototype.checkBallObstacleCollision;
  PhysicsEngine.prototype.checkBallObstacleCollision = function (bolita, ob) {
    if (pintar) {
      // Misma cuenta que usa la app para saber si la bolita toca el Post-it
      const cx = Math.max(ob.x, Math.min(bolita.x, ob.x + ob.w));
      const cy = Math.max(ob.y, Math.min(bolita.y, ob.y + ob.h));
      const toca = (bolita.x - cx) ** 2 + (bolita.y - cy) ** 2 < bolita.radius * bolita.radius;
      const color = toca && colorPorPosicion.get(ob.x + '|' + ob.y);
      if (color && bolita.colorPintado !== color) {
        bolita.color = coloresDeBolita(color);
        bolita.colorPintado = color;
      }
    }
    return choqueOriginal.call(this, bolita, ob);
  };

  /* ---------- 4. Colores de la bolita ----------
     La app dibuja cada bolita con 3 tonos (brillo, base y sombra) para que se vea
     como una esfera. Se calculan a partir del color del Post-it.                  */
  const lienzoColor = document.createElement('canvas').getContext('2d');
  const guardados = {};
  function coloresDeBolita(color) {
    if (guardados[color]) return guardados[color];
    lienzoColor.fillStyle = '#ffffff';
    lienzoColor.fillStyle = color;           // el navegador lo pasa a #rrggbb (sirve para hsl, nombres, etc.)
    const hex = lienzoColor.fillStyle;
    const rgb = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16));
    const mezclar = (otro, cuanto) => '#' + rgb.map((c, i) => Math.round(c + (otro[i] - c) * cuanto)
      .toString(16).padStart(2, '0')).join('');
    return (guardados[color] = {
      base: hex,
      shade: mezclar([0, 0, 0], 0.55),        // más oscuro, para el borde de la esfera
      highlight: mezclar([255, 255, 255], 0.45) // más claro, para el brillo
    });
  }

  /* ---------- 5. Interruptor en la consola (pestaña Física) ---------- */
  const pestana = document.getElementById('tab-physics');
  if (pestana) {
    const grupo = document.createElement('div');
    grupo.className = 'control-group';
    grupo.innerHTML = `
      <div class="toggle-row">
        <label for="pintarColoresToggle">Pintar colores</label>
        <input type="checkbox" id="pintarColoresToggle" class="switch-input" ${pintar ? 'checked' : ''}>
      </div>
      <span class="field-hint">Cada bolita toma el color del Post-it con que choca.</span>`;
    // Va justo debajo del título de la pestaña, para que se vea primero
    const titulo = pestana.querySelector('.section-title');
    if (titulo) titulo.after(grupo); else pestana.prepend(grupo);

    grupo.querySelector('input').addEventListener('change', (e) => {
      pintar = e.target.checked;
      try { localStorage.setItem(CLAVE, pintar ? '1' : '0'); } catch (x) {}
    });
  }
})();
