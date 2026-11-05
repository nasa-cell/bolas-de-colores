# Sistema de Proyección Interactiva & Seguimiento Cromático

Plataforma de software autónoma para activaciones interactivas de proyección sobre superficies físicas con detección cromática de materiales adhesivos (Post-its o tarjetas de referencia) y motor de partículas 2D en tiempo real.

Desarrollado en un **único archivo independiente** ([`index.html`](index.html)), sin dependencias de librerías externas ni servidores locales obligatorios.

---

**Abrir en línea:** https://bolas-de-colores.onrender.com (plan gratis: si estuvo sin uso, la primera visita tarda ~1 minuto en cargar).

## Novedades (carpeta [`cambios`](cambios/LEEME.md))

| Función | Qué hace |
| :--- | :--- |
| **Celular como cámara** | Botón **«Iniciar celular»**: se escanea un QR y el celular hace de cámara, aunque esté en otra WiFi o con datos. Funciona en vertical y horizontal. |
| **Varios colores a la vez** | Detecta amarillo, verde limón, rosado fuerte, rosado pálido, naranja y celeste sin configurar nada, y solo cosas con forma de Post-it. |
| **Marco verde en el celular** | El celular marca en vivo cada Post-it que detecta la PC. |
| **Subir foto** | Usa una foto en vez de la cámara para buscar Post-its, con miniatura en la esquina. |
| **Pintar colores** | Cada bolita toma el color real del Post-it con que choca. |

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

### 4. Calibración Óptica de Cuatro Puntos (Homografía)
En la pestaña **Calibración**:
1. Activa el botón **`Patrón de Alineación`** para desplegar una retícula de calibración de alto contraste sobre la pared.
2. En la consola, arrastra los 4 vértices numerados (**1, 2, 3 y 4**) hasta encuadrar el perímetro proyectado visible por el sensor.
3. Desactiva el patrón de alineación al finalizar.

### 5. Ajuste Fino de Margen Físico
Utiliza el deslizador **Ajuste Fino de Tamaño (Margen Físico)** (`-30%` a `+30%`) para sincronizar milimétricamente el área de colisión y el delimitador técnico proyectado con el borde del papel físico.

### 6. Dinámica de Esferas Naturales
Las partículas se representan como esferas sólidas físicas con iluminación tridimensional y punto especular, con borrado completo por cuadro para eliminar cualquier efecto de estela o cometa artificial.

---

## Comandos Operativos del Teclado

| Tecla | Función Operativa |
| :---: | :--- |
| <kbd>H</kbd> | Alternar visibilidad de la consola de control |
| <kbd>F</kbd> | Alternar modo Pantalla Completa para proyector |
| <kbd>R</kbd> | Purgar y reiniciar partículas en pantalla |
| <kbd>Espacio</kbd> | Pausar / Reanudar dinámica física |
| Clic en pantalla | Emisión manual de partículas o adición de obstáculos en simulación |
