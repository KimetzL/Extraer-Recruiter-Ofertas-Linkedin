# 📋 CONTEXT HANDOFF — LinkedIn Recruiter Finder
> **Instrucción para el nuevo chat/agente:** Lee este documento completo antes de tocar una sola línea de código. Contiene todos los aprendizajes, trampas del DOM de LinkedIn ya resueltas y el estado exacto del proyecto para no dar palos de ciego ni repetir errores.

---

## 🎯 1. ¿Qué es este proyecto?
Una extensión de Google Chrome (Manifest V3) alojada en `d:\Linkedin` que automatiza la prospección de empleo:
1. Navega por LinkedIn Jobs (`https://www.linkedin.com/jobs/search-results/...`).
2. Detecta si la oferta actual tiene un **Recruiter visible** ("Conoce al equipo de contratación", "Anunciante del empleo", etc.).
3. Guarda automáticamente los datos (nombre, cargo, avatar, URL de perfil, enlace de mensaje directo, puesto, empresa, ubicación, fecha y descripción completa "Acerca del empleo").
4. Muestra todo en un **Side Panel** con estadísticas, buscador en vivo, exportación a CSV, modal de detalle con botón "Copiar todo", y modales de confirmación para eliminar.
5. Incluye un modo **Auto-Pilot** que recorre las ofertas de la lista de búsqueda de forma automática.

---

## 🏗️ 2. Arquitectura de Archivos
- `manifest.json`: Manifest V3 con permisos `storage`, `sidePanel`, `tabs`, host `https://www.linkedin.com/*`.
- `background.js`: Service Worker que maneja persistencia en `chrome.storage.local` y hace de **relay de mensajes** entre el Side Panel y el Content Script (`AUTOPILOT_*`).
- `content.js`: Script inyectado en LinkedIn. Se encarga de:
  - Escaneo pasivo continuo de recruiters con `setInterval` (1s) y `MutationObserver`.
  - Actor de Autopilot: busca tarjetas de la lista, hace scroll en la lista virtualizada y ejecuta clicks seguros.
- `sidepanel/sidepanel.{html,css,js}`: Interfaz del panel lateral y **orquestador del Autopilot** (`startAutopilot`, `runAutopilotStep`, temporizadores con jitter).

---

## 🚦 3. Estado Actual de Funcionalidades

| Funcionalidad | Estado | Notas |
|---|---|---|
| **Detección de Recruiters** | ✅ 100% Funcionando | 4 niveles de prioridad, extrae enlace de mensaje directo, avatar y perfil. |
| **Filtro Anti Falsos Positivos** | ✅ 100% Funcionando | Descarta secciones de alumni o "miembros de tu red" que no son recruiters reales. |
| **Captura de Descripción** | ✅ 100% Funcionando | Extrae "Acerca del empleo" con reintentos asíncronos (1.5s y 3.5s) para cargas diferidas. |
| **Extracción de Sueldo** | ✅ 100% Funcionando | Motor dual: Top Card (`72,3K USD/yr - 75K USD/yr`) o Descripción con normalización Unicode (`Up to $115,000 base`, `Salary Range: $72,304 to $75,000`). Visible en modal Info, tarjeta, Copiar y CSV. |
| **Side Panel UI** | ✅ 100% Funcionando | Contadores en vivo, buscador instantáneo, exportar CSV limpio con BOM UTF-8. |
| **Modal Detalle + Copiar** | ✅ 100% Funcionando | Dialog nativo `<dialog>`, muestra todo formateado y botón "Copiar todo" verde. |
| **Modales de Confirmación** | ✅ 100% Funcionando | Tanto para borrado individual como para "Borrar todo", evita pérdidas de datos. |
| **Auto-Pilot (Navegación)** | ✅ 100% Funcionando | Recorre ofertas 1 a 1 sin saltos ni duplicados por título idéntico. Paginación automática activa con soporte de controles modernos de LinkedIn. |

---

## 🧠 4. Secretos y Trampas del DOM de LinkedIn (¡NO OLVIDAR!)

### A. La gran trampa: Las tarjetas NO son enlaces `<a>`
- En el diseño moderno de LinkedIn (2025/2026), **las ofertas en la lista izquierda están renderizadas como contenedores `<li>` o `<div role="button">`**, NO como `<a href="/jobs/view/...">`.
- Si incluyes `a[href*="/jobs/view/"]` en los candidatos de tarjeta o `findClickableInCard` devuelve una etiqueta `<a>`, al hacer click el navegador ejecuta la navegación nativa hacia `https://www.linkedin.com/jobs/view/{jobId}/`, sacando al usuario de los resultados de búsqueda a pantalla completa ("entra en la oferta") y rompiendo el autopilot.
- **Regla estricta:**
  1. `getLeftPanelJobCards()` solo debe buscar contenedores (`li`, `.job-card-container`, `div[data-job-id]`) y filtrar elementos anidados con `outerCandidates`.
  2. `findClickableInCard()` **NUNCA** debe devolver un `<a>`. Solo contenedores `div.job-card-container`, `div[role="button"]` o el propio `li`.
  3. `clickJobCard()` incluye un listener temporal capture que llama a `e.preventDefault()` y `e.stopImmediatePropagation()` ante cualquier intento de navegación a `/jobs/view/`.

### B. Clases CSS Ofuscadas y Dinámicas
- LinkedIn usa clases compiladas aleatorias que cambian periódicamente (ej: `i87ia7`, `i87mg3`, antes `igthn4`).
- **NUNCA usar selectores de clase rígidos** como `.job-card-list__title` o `.job-card-container__link` porque ya no existen o cambian.
- **Usar selectores geométricos y semánticos:**
  - `rect.left < window.innerWidth * 0.52` (lado izquierdo).
  - `rect.top > 60` (debajo del header).
  - Excluir explícitamente `.jobs-details__main-content` y `.job-view-layout` (lado derecho).

### C. La lista es Virtualizada (Ember / React Virtual List)
- LinkedIn solo monta en el DOM las 2-4 ofertas visibles en el viewport.
- No existen las 25 ofertas cargadas a la vez. No se puede iterar por índices estáticos `0, 1, 2... 24`.
- Se debe rastrear por **claves procesadas** (`autopilotProcessedKeys`) y cuando no queden tarjetas visibles sin procesar, ejecutar un **scroll físico** en el contenedor de la lista.

### D. La trampa del Scroll
- El scroll **NUNCA debe aplicarse a `window`** (`window.scrollBy` manda toda la página al pie de página).
- El scrollbar está dentro de un contenedor hijo con `overflowY: auto` en la columna izquierda.
- Para detectarlo de forma 100% infalible, se usa una prueba física: modificar temporalmente `scrollTop += 2` y verificar si el valor cambia realmente en el elemento.
- Para despertar el lazy-loading de LinkedIn, se debe despachar un evento sintético `Event('scroll')` y `WheelEvent('wheel', { deltaY: 250 })`.

---

## 🚫 5. Lo que se probó y NO FUNCIONÓ (No repetir)
1. ❌ **`pushState + PopStateEvent`**: Cambiar `?currentJobId=` en la URL no actualiza el panel derecho; el router de LinkedIn ignora eventos `popstate` artificiales.
2. ❌ **Hacer click en etiquetas `<a>` de oferta**: El navegador toma el control y abre la URL a pantalla completa, sacando al usuario de la búsqueda.
3. ❌ **`li[data-occludable-job-id]`**: En muchas vistas nuevas ya no existe ese atributo; devolvía 0 elementos.
4. ❌ **Filtrar enlaces con `.closest('.jobs-details__main-content')`**: Cuando LinkedIn cambia nombres de clases de la vista principal, este filtro eliminaba todos los enlaces dejando 0 resultados.
5. ❌ **Detectar contenedores de scroll con `offsetHeight > 0`**: Devolvía `divs` envoltorios visibles pero sin scrollbar (`overflow: visible`), por lo que `scrollTop += X` no movía nada.

---

## 🛠️ 6. Estado de Tareas y Aprendizajes Recientes

1. ✅ **Excluir botones de filtro ("Fecha de Publicación") y cabeceras:**
   - *Causa raíz:* `[role="button"]` a nivel de documento capturaba los botones de filtro de la barra superior ("Fecha de publicación"), abriendo el desplegable "Últimas 24h...".
   - *Solución:* Búsqueda acotada a `getJobListContainer()`, exclusión explícita con `isFilterOrHeaderElement` y filtro de altura física (`rect.height >= 50px`, ya que los botones de filtro miden 28-36px).

2. ✅ **Evitar saltos ("se salta una, dos, va más abajo de la 5") — RESUELTO DEFINITIVAMENTE:**
   - *Causa raíz descubierta en vídeo:* En búsquedas con keywords compuestas (`Data Analyst or Data Engineer...`), decenas de ofertas distintas tienen el **mismo título idéntico** (ej. tres ofertas consecutivas de "Data Analyst"). El código anterior hacía fallback de deduplicación a `title_dataanalyst`, por lo que el `Set` descartaba inmediatamente la 2ª, 3ª y 4ª oferta como si fuesen duplicadas, saltándoselas todas. Además, el scroll avanzaba 180px (más de 1 tarjeta), saltándose ofertas virtuales.
   - *Solución implementada (`948dc77`):*
     1. **NUNCA deduplicar por título:** Si dos ofertas tienen el mismo título, ambas se conservan.
     2. **Deduplicación por Job ID numérico robusto:** `extractJobIdFromElement` busca en `cardRoot` (URNs `jobPosting:(\d+)`, enlaces `/jobs/view/(\d+)`, atributos `data-occludable-job-id`, `data-chameleon-result-urn` y números de 10 dígitos `4\d{9}`).
     3. **Des-anidado DOM seguro:** Solo se descartan elementos que sean hijos/padres de otra tarjeta ya añadida (`isNested`), manteniendo todas las ofertas distintas.
     4. **Clave compuesta única:** Si una tarjeta no tuviese ID, combina empresa, ubicación, título y contador DOM de sesión único (`card_${comp}_${loc}_${title}_${counter}`).
     5. **Scroll paso a paso:** Reducido a 130px (exactamente 1 tarjeta de LinkedIn) para que avance de 1 en 1 sin saltarse nada.

3. ✅ **Arranque suave y centrado inicial:**
   - En `AUTOPILOT_RESET` se devuelve `scrollTop` a 0 del contenedor si estaba desplazado, y se usa `scrollIntoView({ block: 'nearest' })` para no provocar saltos bruscos si la primera tarjeta ya está visible.

4. ✅ **Paginación automática a la siguiente página (`fa3fc3b`):**
   - *Causa raíz:* LinkedIn modernizó los controles de paginación con `data-testid="pagination-controls-next-button-visible"` e icono SVG `#chevron-right-outline-small`, sin clases clásicas `artdeco-pagination` ni `aria-label`.
   - *Solución implementada:* Detección multicapa en `findNextPageButton()` (`data-testid`, SVG chevron-right, texto "Siguiente", fallback a botón de página siguiente `N+1`). Detección instantánea de fin de lista (`didScroll === false`) que salta de página sin esperas. Limpieza de claves y vuelta al top (`scrollTop = 0`) para arrancar de inmediato en la nueva página.

---

## 💾 7. Historial Git Reciente
- Rama activa: `main` en `d:\Linkedin`
- Últimos commits clave:
  - `46f6f52`: fix(autopilot): soporte para tarjetas `<div role=button>` y scroll contenido sin window.scroll
  - `cc64956`: fix(autopilot): deteccion fisica de contenedores scrollables activos
  - `0974993`: fix(autopilot): manejo de lista virtual - CLICK_NEXT con scroll
  - `4d5af33`: fix(autopilot): click en li contenedor en vez de `<a>`
  - `d043048`: feat(detail-modal): modal de detalle y boton copiar todo

