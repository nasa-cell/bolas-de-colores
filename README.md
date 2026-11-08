# Sistema de Proyección Interactiva & Seguimiento Cromático

Plataforma de software autónoma para activaciones interactivas de proyección sobre superficies físicas con detección cromática de materiales adhesivos (Post-its o tarjetas de referencia) y motor de partículas 2D en tiempo real.

Desarrollado en un **único archivo independiente** ([`index.html`](index.html)), sin dependencias de librerías externas ni servidores locales obligatorios.

---

**Abrir en línea:** https://bolas-de-colores.onrender.com (plan gratis: si estuvo sin uso, la primera visita tarda ~1 minuto en cargar).

## Novedades (carpeta [`cambios`](cambios/LEEME.md))

| Función | Qué hace |
| :--- | :--- |
| **Celular como cámara** | Botón **«Iniciar celular»**: se escanea un QR y el celular hace de cámara, aunque esté en otra WiFi o con datos. Funciona en vertical y horizontal. |
| **Varios colores a la vez** | Detecta amarillo, verde limón, verde, rosado fuerte, rosado pálido, naranja, celeste, lila y morado sin configurar nada, y solo cosas con forma de Post-it. |
| **Marco verde en el celular** | El celular marca en vivo cada Post-it que detecta la PC. |
| **Subir foto** | Usa una foto en vez de la cámara para buscar Post-its, con miniatura en la esquina. |
| **Pintar colores** | Cada bolita toma el color real del Post-it con que choca. |
| **A transparencia** | Tecla **A** o botón ☰ A: mide la luz, muestra la imagen en vivo a color, se señalan los Post-its en la mini cámara o en la pared, se revisa y sugiere al menos 6 lugares nuevos. Separa Post-its pegados, ignora a la persona que pasa y se reajusta si se mueve la cámara. |
| **Botón X** | Con A cerrado, muestra otra vez las sugerencias y la cámara transparente mientras se pegan Post-its. Con la imagen a la vista, el celular manda fotos más livianas para que vaya fluido. |
| **Con proyector / Sin proyector** | Botón «Modo» en el celular. «Sin proyector» usa la imagen completa de la cámara (por ejemplo la de la laptop): sigue al Post-it en la mano y no cuenta los dedos. «Con proyector» se ajusta con A. |
| **Aprende colores** | Si no detecta un Post-it, al tocarlo con A aprende su color con la luz del momento. |

Para usar el celular: doble clic en [`cambios/iniciar.cmd`](cambios/iniciar.cmd) (requiere [Node.js](https://nodejs.org)). Todo está explicado en [`cambios/LEEME.md`](cambios/LEEME.md).

---

## Modos de Operación

### 1. Ejecución Directa
Haz doble clic sobre [`index.html`](index.html) en tu explorador de archivos:
* **Microsoft Edge o Mozilla Firefox:** Permiten acceso directo al hardware de video en entornos locales (`file:///`).
* **Google Chrome:** Si utilizas Chrome y requieres acceso al sensor de video, abre con Microsoft Edge o inicia un servidor local simple (`npx serve .`).
* **Modo Simulación:** Si no dispones de cámara en el momento, selecciona *"Modo Simulación"* en el inicio para desplegar notas interactivas en pantalla.

---

## Protocolo de Calibración en Sitio

### 1. Proyección a Pantalla Completa
Presiona la tecla **`F`** para activar el modo de proyección sin marcos del sistema operativo.

### 2. Acceso a la Consola de Control
Presiona la tecla **`H`** (o el botón inferior `SISTEMA [H]`) para desplegar la consola de configuración.

### 3. Clonación del Color de la Tarjeta en Mano
En la pestaña **Cromática**:
1. Sostén el Post-it o tarjeta física frente al lente de la cámara, alineándolo dentro del recuadro central **`ENFOQUE DE TARJETA`**.
2. Observa la telemetría en vivo: el indicador **"En foco"** mostrará en tiempo real el color exacto que el sensor detecta.
3. Presiona el botón **`Clonar Color de Tarjeta Enfocada`**. El sistema configurará automáticamente el tono (*Hue*), saturación y umbrales de brillo óptimos.
4. Si requieres ajustar la sensibilidad, calibra el deslizador **Tolerancia de Tono (±ΔH)** o utiliza las calibraciones cromáticas estándar (Amarillo Canario, Verde Lima, Magenta, Naranja, Cian).
5. Con **A** abierto, si no detecta un Post-it, al tocarlo aprende su color con la luz del momento (quedan en H → Cromática → «Post-its enseñados»).

### 4. Ajuste con A transparencia (reemplaza la calibración de 4 puntos)
Presiona la tecla **`A`** o el botón **`☰ A`** (junto al de H). Sale un menú a la izquierda:
1. **Mide la luz sola** al prender la cámara (unos 2 segundos) y avisa si una zona tiene poca luz.
2. Muestra la imagen en vivo de la cámara, **transparente y a color**. Toca con el puntero cada Post-it de verdad en la pared: la imagen se mueve sola hasta calzar (con 4 o más toques corrige también la perspectiva). **«Deshacer último toque»** quita un toque equivocado.
3. Pregunta **«Mira: ¿está correcto?»**. Se corrige arrastrando un marco, la imagen o sus esquinas 1 a 4.
4. Con **Listo** se oculta la imagen y **sugiere de 6 a 8 lugares** numerados para pegar Post-its nuevos. Al pegar en uno, lo capta solo y lo quita de la lista.

* **Mini cámara** (dentro del menú A): arrastra los números 1 a 4 de la mini cámara hasta donde ves esos números de la pared, o toca ahí los Post-its que el menú tapa.
* **Si se mueve la cámara** (también la del celular), se reajusta sola con los Post-its ya señalados; si no ve al menos 3, pide apretar A y «Volver a ajustar».
* El ajuste se recuerda al recargar. «Empezar de nuevo» lo rehace desde la luz.

### 5. Botón X al pegar Post-its
Con el menú de A cerrado, la tecla **`X`** (o el botón **`X`**) vuelve a mostrar las sugerencias y la cámara en vivo transparente, para ver cómo pegas los Post-its. Cada uno que pegas se capta y su lugar sale de la lista. Otra vez X lo oculta todo; las bolas siguen funcionando. Antes de ajustar con A, X solo avisa «Primero ajusta con A».

### 6. Ajuste Fino de Margen Físico
Utiliza el deslizador **Ajuste Fino de Tamaño (Margen Físico)** (`-30%` a `+30%`) para sincronizar milimétricamente el área de colisión y el delimitador técnico proyectado con el borde del papel físico.

### 7. Dinámica de Esferas Naturales
Las partículas se representan como esferas sólidas físicas con iluminación tridimensional y punto especular, con borrado completo por cuadro para eliminar cualquier efecto de estela o cometa artificial.

---

## Comandos Operativos del Teclado

| Tecla | Función Operativa |
| :---: | :--- |
| <kbd>H</kbd> | Alternar visibilidad de la consola de control |
| <kbd>A</kbd> | Abrir / cerrar el menú de A transparencia (ajuste de la cámara con el proyector) |
| <kbd>X</kbd> | Mostrar / ocultar las sugerencias y la cámara transparente mientras se pegan Post-its |
| <kbd>F</kbd> | Alternar modo Pantalla Completa para proyector |
| <kbd>R</kbd> | Purgar y reiniciar partículas en pantalla |
| <kbd>Espacio</kbd> | Pausar / Reanudar dinámica física |
| Clic en pantalla | Emisión manual de partículas o adición de obstáculos en simulación |
