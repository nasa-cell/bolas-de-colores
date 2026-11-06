# Carpeta `cambios`: el celular como cámara

Aquí está **todo el código nuevo**. Con esto, el celular hace de cámara de la app:
se escanea un QR y la app usa lo que filma el celular, como si fuera la webcam.
Funciona aunque el celular esté en otra WiFi o con datos móviles.

## Dos formas de usarla

- **En internet (Render, plan gratis):** se abre el link de Render y listo. No hace falta `iniciar.cmd`
  ni túnel: Render da un link `https` fijo y el QR apunta ahí.
  Si nadie la usa por 15 minutos se «duerme»: la primera visita tarda ~1 minuto en despertarla.
  Cada vez que se sube código a GitHub, Render se actualiza solo.
- **En tu PC:** con `iniciar.cmd`, como se explica abajo.

## Cómo se usa (en tu PC)

1. Doble clic en **`iniciar.cmd`**. Se abre una ventana negra (el servidor) y la app en el navegador.
   **No cierres la ventana negra** mientras uses la app.
2. En la pantalla de inicio, pulsa **«Iniciar celular»**.
3. Espera unos segundos a que aparezca el QR (se está creando el enlace por internet).
4. Escanea el QR con la cámara del celular y abre el link.
5. Acepta el permiso de cámara en el celular.
6. En la ventana del QR aparece una **vista previa** de lo que filma el celular y el botón
   **«Iniciar cámara del celular»**. Al tocarlo, la ventana se cierra y la app ya usa la cámara del celular.

En el celular hay botones para **cambiar cámara** (trasera/frontal), elegir **calidad** (720p o 480p)
y **detener**. La pantalla del celular queda encendida mientras transmite.

Si el celular se corta, en la PC sale el aviso «Celular desconectado». Basta con volver a abrir
el link en el celular o pulsar «Ver QR» y escanear de nuevo (el mismo QR sirve mientras la app siga abierta).

## Carpetas

```
cambios/
├── iniciar.cmd              ← doble clic aquí para arrancar
├── LEEME.md                 ← este archivo
├── servidor/
│   └── servidor.js          ← corre en la PC
├── celular/
│   └── celular.html         ← la página que abre el celular
├── pc/                      ← lo que se agrega a la app de la PC
│   ├── puente-celular.js
│   ├── deteccion-colores.js
│   ├── subir-foto.js
│   ├── pintar-colores.js
│   └── auto-ajuste.js
└── herramientas/
    └── cloudflared.exe      ← programa del túnel
```

## Qué hace cada archivo

| Archivo | Qué hace |
|---|---|
| `iniciar.cmd` | Arranca todo con doble clic. |
| `servidor/servidor.js` | Muestra la app en `http://localhost:8080`, abre el túnel por internet y pasa las fotos del celular a la PC. También pasa los marcos verdes de la PC al celular. No necesita `npm install`. |
| `celular/celular.html` | La página que abre el celular: prende la cámara, endereza la imagen si el celular está de costado, manda fotos seguidas a la PC y dibuja los marcos verdes. |
| `pc/puente-celular.js` | Lado PC: el botón QR, la ventana del QR, el truco para que la app use las fotos del celular como cámara, el envío de los marcos verdes y el aviso «El celular giró». |
| `pc/deteccion-colores.js` | Detecta **varios colores de Post-it a la vez**, sin configurar nada, y **solo cosas con forma de Post-it**. Ver abajo. |
| `pc/subir-foto.js` | Botón **«Subir foto»**: usa una foto en vez de la cámara para buscar Post-its. Ver abajo. |
| `pc/pintar-colores.js` | Interruptor **«Pintar colores»**: cada bolita toma el color del Post-it con que choca. |
| `pc/auto-ajuste.js` | **Ajuste automático**: la cámara encuentra sola dónde cae la proyección, mide la luz y sigue a cada Post-it. Sin calibrar a mano. Ver abajo. |
| `herramientas/cloudflared.exe` | Programa gratis de Cloudflare que crea el link público `https://….trycloudflare.com`. Sin cuenta ni tarjeta. |

Cada archivo de código está dividido en **bloques numerados** con comentarios de lo que hace cada uno.

El único cambio en el código original son **cuatro líneas** al final de `index.html`:

```html
<script src="cambios/pc/deteccion-colores.js"></script>
<script src="cambios/pc/puente-celular.js"></script>
<script src="cambios/pc/subir-foto.js"></script>
<script src="cambios/pc/pintar-colores.js"></script>
<script src="cambios/pc/auto-ajuste.js"></script>
```

## Ajuste automático (`pc/auto-ajuste.js`)

Ya no hay que calibrar a mano. Se pega un Post-it y la app lo marca **del mismo tamaño y en el mismo lugar**.

- **Al tocar «Iniciar»** la app se pone en pantalla completa y, después de 1 segundo, el proyector muestra
  unos destellos: 12 cuadritos blancos, todo negro y otra vez los cuadritos (de 1 a 3 segundos en total).
  La cámara los ve y pone sola las 4 esquinas. Mientras tanto dice «Ajustando la cámara… no tapes la pantalla».
- **Con el celular** también funciona: la imagen del celular llega con retraso, así que en cada destello
  la app espera a que llegue y a que la cámara termine de ajustar su brillo. Por eso puede tardar un poco más.
- **Vuelve a medir sola** si:
  - la cámara o el proyector se mueve (compara la imagen con la de antes);
  - cambia el tamaño de la ventana (por ejemplo, tecla F);
  - el celular gira o se cambia de cámara.
- **Varios Post-its pegados en fila** (hasta 5) se separan: cada uno sale con su tamaño.
- **La persona que pasa delante** no cuenta como Post-it, y los Post-its que tapa se quedan
  en su lugar (hasta 30 segundos) hasta que se vuelvan a ver.
- **Pegar y quitar:** un Post-it nuevo aparece cuando lleva medio segundo quieto. Si se quita, desaparece en 1 o 2 segundos.
- **Luz:** con los destellos mide cuánta luz hay en el salón. Con mucha luz, las bolas salen más grandes y
  el borde de los Post-its más grueso, para que se vean. Con poca luz sube el brillo de la cámara antes de buscar colores.
- **Mide la forma real:** si la cámara está de lado, el cuadro ya no sale más grande que el papel.
- Busca los **9 colores** a la vez (los de «Colores que detecta», en H → Cromática).

En la consola (tecla **H → Calibración**), arriba:

- **«Ajuste automático»** prendido (por defecto) o apagado. Apagado = **modo manual**: las 4 esquinas y los
  ajustes finos funcionan como antes. Lo elegido se recuerda.
- **«Ajustar ahora»**: vuelve a medir en el momento.
- Debajo dice cómo salió la última medida, por ejemplo: «Listo · 12 de 12 puntos · error 0,0 % · luz del salón: media».

Si no logra ver la proyección, lo intenta de nuevo 3 veces y avisa. Entonces conviene revisar que la cámara
vea toda la pantalla, o usar el modo manual. Con una **foto subida** no se puede medir (la foto no ve los destellos):
se usan las esquinas que ya había.

Los valores se cambian al inicio de cada bloque de `pc/auto-ajuste.js`: `ESPERA_APARECER`, `ESPERA_QUITAR`,
`TAPADO_MAX` y `AREA_MAX`.

### Con proyector o sin proyector

En la consola (tecla **H** → **Calibración**) hay dos botones, y en el celular el botón azul **«Modo: …»**.
Los dos cambian lo mismo, y la app recuerda el último elegido. La primera vez empieza en «Con proyector».

- **Con proyector** (para el aula): se ajusta sola a la proyección con los cuadritos. Si la cámara no ve
  la pantalla, avisa «No veo la pantalla» y lo vuelve a intentar cada 10 segundos, **3 veces como máximo**.
  Después para (sin más destellos) hasta que toques «Ajustar ahora», toques «Con proyector» o cambies de
  cámara; cada vez tiene 3 intentos nuevos. Nunca cambia sola de modo.
- **Sin proyector** (por ejemplo, la cámara de la laptop mirándote): no muestra destellos. Toda la imagen de
  la cámara es la pantalla. El recuadro sigue al Post-it aunque lo tengas en la mano, lo quita apenas sale
  y no cuenta los dedos que lo sostienen. «Ajustar ahora» no se usa en este modo.

El ajuste solo se acepta si ve al menos 8 de los 12 cuadritos: así no se engaña con el reflejo de la
pantalla en la cara o la pared.

## Subir foto (`pc/subir-foto.js`)

- Botón **«Subir foto»** en la pantalla de inicio y en la consola (tecla **H** → **Cromática** → «Foto de prueba»).
- La foto reemplaza a la cámara: la app busca los Post-its en ella y las bolitas rebotan en ellos.
- **Miniatura abajo a la izquierda:** muestra la foto con un marco del color de cada Post-it encontrado,
  cuántos encontró («3 Post-its») y una **✕** para quitar la foto sin abrir la consola.
- Mientras la foto está puesta:
  - la cámara del celular queda **en pausa** (el celular dice «En pausa: la PC está usando una foto»);
  - «Iniciar celular» no abre el QR (avisa que primero hay que quitar la foto).
- **«Quitar foto»**: si el celular seguía conectado, vuelve solo. Si no, se elige «Conectar celular (QR)» o «Cámara de la PC».
- La foto no se guarda: al recargar la página se olvida.

## Pintar colores (`pc/pintar-colores.js`)

- Interruptor en la consola: tecla **H** → **Física** → **«Pintar colores»** (prendido por defecto; se recuerda).
- Cada bolita toma el color del Post-it con que choca. Si después choca con otro, cambia a ese color.
- El color es el **real** de cada Post-it, medido en la imagen (no un color fijo por grupo):
  - primero se quita el tinte de la cámara (**balance de blancos**: lo blanco de la imagen, como un enchufe,
    se usa de referencia; si no hay nada blanco, no se corrige);
  - después se aviva un poco, porque la cámara entrega colores apagados que en el proyector se verían casi blancos.
  - Los valores están en `pc/deteccion-colores.js`: `COLOR_MINIMO`, `LUZ_MIN`, `LUZ_MAX` y `GANANCIA_MAX`.
- Funciona con la cámara, el celular, una foto subida y el modo simulación.

Si se borran esas líneas, la app vuelve a ser exactamente como antes.

## Celular en horizontal

- Al girar el celular, la imagen ocupa casi toda la pantalla y los botones pasan a una **columna a la derecha**.
- Si el celular tiene la **rotación automática apagada**, la cámara manda la imagen acostada (3 Post-its en fila
  llegaban «uno sobre otro»). Ahora el celular usa su **sensor de giro** y endereza la imagen antes de mandarla.
- **«Rotar: Auto»**: si algún celular la endereza al revés, tocar para girar a mano (0°, 90°, 180°, 270°) y volver a «Auto».
- **«Girar a horizontal»**: en Android pone pantalla completa y deja la página fija en horizontal.
  En iPhone no se puede trabar: hay que girarlo a mano (y aceptar el permiso del sensor la primera vez que se toca la pantalla).
- En la PC sale el aviso **«El celular giró: revisa la calibración»** porque la forma de la imagen cambia.
  Conviene revisar las 4 esquinas en la tecla **H → Calibración**.
- Probado en 7 tamaños de celular, en vertical y en horizontal: 320×568, 360×640, 360×800, 375×667,
  390×844, 412×915 y 430×932. Sin scroll ni botones cortados.

## Detección de varios colores (`pc/deteccion-colores.js`)

- **Por defecto, sin configurar**, busca 9 colores a la vez: amarillo, verde limón, verde, rosado fuerte,
  rosado pálido, naranja (también el naranja claro), celeste, lila y morado.
- **Solo Post-its:** además del color, revisa la forma. Se descarta lo que no parece un Post-it:
  - manchas chicas (brillos, puntitos);
  - rayas largas (vetas de madera, cables, bordes);
  - formas huecas o raras (ropa, dibujos).
- El **rosado pálido** es casi blanco. Solo cuenta si es muy claro y de tono rosado o lila, para no confundirlo con paredes o enchufes blancos.
- En la consola (tecla **H** → pestaña **Cromática**) está **«Colores que detecta»**:
  - tocar un color lo prende o lo apaga;
  - «Un solo color (como antes)» vuelve al modo original;
  - «Clonar Color de Tarjeta Enfocada» **agrega** el color clonado a la lista (se quita tocando su ✕).
- Lo elegido se recuerda al recargar la página.
- Probado con fotos reales sobre madera: 3 Post-its (detecta los 3) y 5 Post-its con naranja claro y verde (detecta los 5), sin confundir la madera ni el enchufe. Lila y morado probados con una foto retocada.

Los valores de cada color están al inicio del archivo (`COLORES_BASE`), y los del filtro de forma
en `AREA_MINIMA`, `PROPORCION_MIN/MAX` y `RELLENO_MIN`, con comentarios.

## Enseñar un Post-it tocándolo

Si la app no ve un Post-it (color raro, o la luz del salón lo cambia), se le enseña tocándolo:

- **En la PC:** tecla **H** → **Cromática** → toca el Post-it en el video de la cámara.
- **En el celular:** toca **«Enseñar Post-it»** (el botón cambia a «Listo») y toca el Post-it en la pantalla.
  Se pueden tocar varios seguidos. «Listo» termina.
- La app mide el Post-it entero con la luz de ese momento y lo agrega a **«Post-its enseñados»**.
  Aparece un anillo verde (aprendido) o rojo (no se pudo) donde se tocó, y un aviso corto.
- No aprende si se toca la pared o la pantalla, ni un color que también tiene el fondo: avisa por qué.
- Tocar otra vez un Post-it ya enseñado (por ejemplo, cuando cambia la luz) **ajusta** su color, no lo repite.
- Se recuerda al recargar. Se borra con **«Olvidar los enseñados»** (PC) u **«Olvidar enseñados»** (celular),
  o uno por uno tocando su ✕. Como máximo 9 enseñados.
- Solo funciona en «Varios colores a la vez». Desde la consola del navegador: `EnsenarPostit.tocar(x, y)`.

## Marco verde en el celular

Cuando la PC detecta un Post-it, el celular dibuja un **marco verde** encima en su pantalla, en vivo.
Arriba dice cuántos ve, por ejemplo «3 Post-its».

## Cómo funciona por dentro (resumen)

1. La PC abre una «sala» en el servidor con un código al azar de 8 letras. Ese código va dentro del QR.
2. El celular entra a esa sala y manda fotos JPEG, unas 15 a 20 por segundo.
   Manda la siguiente solo cuando la PC avisa que recibió la anterior. Así se adapta solo a la velocidad del internet.
3. La PC dibuja cada foto en un lienzo (`canvas`) y lo convierte en un video (`captureStream`).
4. La app pide cámara como siempre, pero `pc/puente-celular.js` le entrega ese video.
   Por eso la detección de color, la física y la calibración **no se tocaron**.

## Seguridad

- El servidor solo escucha en esta PC. Desde internet se entra únicamente por el túnel.
- Por el túnel solo se puede abrir la página del celular (`celular/celular.html`). La app y los demás archivos dan error 403.
- Sin el código de la sala, el celular no puede mandar imagen.
- El link del túnel cambia cada vez que se abre `iniciar.cmd`.

## Problemas comunes

| Aviso | Qué hacer |
|---|---|
| «No hay servidor. Abre la app con cambios\iniciar.cmd» | Abriste `index.html` con doble clic o con otro servidor. Usa `iniciar.cmd`. |
| «El puerto 8080 ya está ocupado» | Ya hay otra ventana del servidor abierta. Ciérrala y vuelve a intentar. |
| «El túnel se cerró» o el QR no aparece | Revisa que la PC tenga internet. Cierra la ventana negra y abre `iniciar.cmd` de nuevo. |
| «Falta el programa cloudflared.exe» | Descárgalo gratis de https://github.com/cloudflare/cloudflared/releases (archivo `cloudflared-windows-amd64.exe`), cámbiale el nombre a `cloudflared.exe` y ponlo en `cambios\herramientas\`. |
| El QR no se dibuja | La librería del QR se baja de internet. Sin internet, escribe en el celular el link que sale debajo. |
| El celular dice «Este código ya no sirve» | La app de la PC se recargó y el código cambió. Escanea el QR nuevo. |
| Va lento | En el celular elige «Calidad: 480p». |
| «Sin imagen del celular» | El celular dejó de mandar imagen (se tocó «Detener», se bloqueó o se cortó internet). Los Post-its se borran para que no queden recuadros fantasma. Al volver la imagen, el aviso se va solo. |
| «Sin imagen de la cámara» | La cámara de la PC se apagó o se desconectó. Prenderla y elegirla de nuevo en la consola (tecla H). |

Requisitos: Node.js instalado (gratis, https://nodejs.org) e internet en la PC.
