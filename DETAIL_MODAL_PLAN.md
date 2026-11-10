# 📋 Plan: Modal de Detalle de Oferta + Extracción de Descripción

> **Estado:** ⏸️ Planificado (no ejecutado).

---

## 🎯 Objetivo

Añadir a cada tarjeta del panel un botón `📋 Info` que abra un **modal de detalle** con toda la información de la oferta —incluyendo el texto completo de *"Acerca del empleo"*— y un botón **"Copiar todo"** que coloca en el portapapeles un bloque de texto listo para pegar en un mensaje de LinkedIn.

---

## 🖼️ Mockup del modal

```
┌──────────────────────────────────────────────────┐
│  📋  Detalles de la oferta              [✕ Cerrar]│
├──────────────────────────────────────────────────┤
│                                                  │
│  Puesto:     Data Scientist                      │
│  Empresa:    Google                              │
│  Ubicación:  Remote — USA                        │
│                                                  │
│  Recruiter:  Michael Johnson                     │
│  Cargo:      Talent Acquisition Lead             │
│  Perfil:     linkedin.com/in/michaeljohnson      │
│  Oferta:     linkedin.com/jobs/view/1234567890   │
│  Guardada:   10/11/2026 22:52                    │
│                                                  │
│  ─────────────── Acerca del empleo ───────────── │
│                                                  │
│  We are looking for a Data Scientist to join...  │
│  [texto completo extraído de la oferta]          │
│  ...                                             │
│                                                  │
│      [📋 Copiar todo]        [✕ Cerrar]          │
└──────────────────────────────────────────────────┘
```

**Texto copiado al portapapeles** (listo para pegar en un mensaje):

```
Puesto: Data Scientist
Empresa: Google
Ubicación: Remote — USA
Recruiter: Michael Johnson (Talent Acquisition Lead)
Perfil: https://linkedin.com/in/michaeljohnson
Oferta: https://linkedin.com/jobs/view/1234567890
Guardada: 10/11/2026 22:52

──────── Acerca del empleo ────────

We are looking for a Data Scientist to join our team...
[resto del texto de la descripción]
```

---

## 📁 Archivos a Modificar

| Archivo | Cambio |
|---|---|
| `content.js` | Añadir extracción de `jobDescription` en `extractJobDetails()` |
| `sidepanel/sidepanel.html` | Añadir el `<dialog>` del modal de detalle |
| `sidepanel/sidepanel.css` | Estilos del modal, sección de descripción scrollable |
| `sidepanel/sidepanel.js` | Botón `📋 Info` en cada tarjeta + lógica de apertura y copia |

---

## ⚙️ Desglose Técnico

### 1. `content.js` — Extraer descripción de la oferta

Dentro de la función `extractJobDetails()` existente, añadir un **bloque 4** para capturar el texto de la sección *"Acerca del empleo"* antes de hacer el `return`:

**Selectores a probar en orden de fiabilidad:**
```
1. .jobs-description-content__text            → Texto principal de la descripción
2. .jobs-box__html-content                    → Contenedor alternativo
3. [class*="description"] article             → Genérico por clase parcial
4. #job-details                               → Contenedor raíz por ID
```

**Proceso de limpieza del texto:**
- Clonar el nodo del DOM (`.cloneNode(true)`) para no mutar la página.
- Eliminar elementos decorativos: `svg`, `button`, `[aria-hidden]`.
- Convertir `<br>` y `<p>` en saltos de línea `\n` antes de usar `.textContent`.
- Colapsar espacios múltiples y líneas en blanco excesivas.
- Truncar a un máximo de 8.000 caracteres para no saturar `chrome.storage.local`.

**Campo nuevo en el payload de guardado:**
```js
{
  ...camposActuales,
  jobDescription: 'texto limpio de la descripción o "" si no se encontró'
}
```

> ⚠️ **Nota:** `chrome.storage.local` tiene un límite de 5 MB total y 8 KB por ítem con `set()`.  
> Con 8.000 caracteres por descripción + el resto del objeto, el guardado es seguro.

---

### 2. `sidepanel.html` — Nuevo modal de detalle

Añadir un segundo `<dialog>` (distinto al modal de confirmación de borrado ya existente) justo antes del cierre de `</div>` del `#app`:

```html
<dialog class="detail-modal" id="detail-dialog">
  <div class="detail-content">

    <!-- Cabecera del modal -->
    <div class="detail-header">
      <h3 class="detail-title">📋 Detalles de la oferta</h3>
      <button type="button" id="detail-btn-close" class="detail-close-btn">✕</button>
    </div>

    <!-- Cuerpo con los datos estructurados -->
    <div class="detail-body">

      <div class="detail-section">
        <div class="detail-row"><span class="detail-label">Puesto</span>     <span id="detail-job-title" class="detail-value"></span></div>
        <div class="detail-row"><span class="detail-label">Empresa</span>    <span id="detail-company" class="detail-value"></span></div>
        <div class="detail-row"><span class="detail-label">Ubicación</span>  <span id="detail-location" class="detail-value"></span></div>
      </div>

      <div class="detail-divider"></div>

      <div class="detail-section">
        <div class="detail-row"><span class="detail-label">Recruiter</span>  <span id="detail-recruiter-name" class="detail-value"></span></div>
        <div class="detail-row"><span class="detail-label">Cargo</span>      <span id="detail-recruiter-title" class="detail-value"></span></div>
        <div class="detail-row"><span class="detail-label">Perfil</span>     <a  id="detail-recruiter-url" class="detail-link" target="_blank"></a></div>
        <div class="detail-row"><span class="detail-label">Oferta</span>     <a  id="detail-job-url" class="detail-link" target="_blank"></a></div>
        <div class="detail-row"><span class="detail-label">Guardada</span>   <span id="detail-saved-at" class="detail-value"></span></div>
      </div>

      <div class="detail-divider"></div>

      <!-- Sección de descripción con scroll propio -->
      <div class="detail-description-wrapper">
        <div class="detail-description-label">Acerca del empleo</div>
        <div class="detail-description-box" id="detail-description">
          <!-- Se rellena dinámicamente -->
        </div>
      </div>

    </div>

    <!-- Footer con botones de acción -->
    <div class="detail-footer">
      <button type="button" id="detail-btn-copy" class="btn-copy-all">📋 Copiar todo</button>
      <button type="button" id="detail-btn-close2" class="btn-cancel">Cerrar</button>
    </div>

  </div>
</dialog>
```

---

### 3. `sidepanel.css` — Estilos del modal de detalle

**Clases nuevas a añadir:**

| Clase | Descripción |
|---|---|
| `dialog.detail-modal` | Posicionamiento centrado, fondo oscuro, radio 14px, igual que `confirm-modal` existente |
| `.detail-content` | Flex column, altura máxima `85vh`, sin overflow propio |
| `.detail-header` | Flex row space-between, borde inferior sutil |
| `.detail-close-btn` | Botón ✕ pequeño, esquina superior derecha |
| `.detail-body` | `overflow-y: auto`, `flex: 1`, con scrollbar fino estilizado |
| `.detail-section` | Grupo de filas `.detail-row` con gap pequeño |
| `.detail-row` | Display grid 2 columnas (label fijo 80px + valor flexible), alineación top |
| `.detail-label` | Texto muted, `font-size: 10px`, `text-transform: uppercase`, letra `0.6px` |
| `.detail-value` | Texto primario, `font-size: 12px`, `word-break: break-word` |
| `.detail-link` | Color `accent-light`, sin subrayado, `word-break: break-all` |
| `.detail-divider` | Línea horizontal `border: 1px solid var(--border)`, margin vertical |
| `.detail-description-wrapper` | Flex column, gap 8px, altura flexible |
| `.detail-description-label` | Estilo de sección (como `.detail-label` pero más grande, font-weight 600) |
| `.detail-description-box` | `max-height: 280px`, `overflow-y: auto`, `white-space: pre-wrap`, `font-size: 11px`, color muted, con scrollbar propio |
| `.detail-footer` | Flex row, `gap: 10px`, `justify-content: flex-end`, borde superior |
| `.btn-copy-all` | Verde `var(--success)`, texto blanco, mismo estilo que `.btn-confirm-delete` pero verde |

**Comportamiento del `::backdrop`:**  
Idéntico al del modal de confirmación existente: `rgba(0,0,0,0.65)` + `backdrop-filter: blur(3px)`.

---

### 4. `sidepanel.js` — Botón Info + lógica del modal

#### 4a. Botón `📋 Info` en `buildJobCard()`

Añadir un botón `data-info="<jobId>"` en la fila `.card-links` de cada tarjeta, **antes** del botón de Eliminar:

```html
<button class="card-btn card-btn-info" data-info="${jobId}" title="Ver detalles y copiar">
  📋 Info
</button>
```

#### 4b. Event listener en `renderJobs()`

Junto al listener existente de `[data-delete]`, añadir uno para `[data-info]`:

```js
jobsList.querySelectorAll('[data-info]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openDetailModal(btn.dataset.info);
  });
});
```

#### 4c. Función `openDetailModal(jobId)`

```
openDetailModal(jobId)
│
├─ Busca el job en allJobs por jobId
├─ Si no existe → return (no debería ocurrir)
│
├─ Rellena cada campo del modal:
│   ├─ detail-job-title      ← job.jobTitle
│   ├─ detail-company        ← job.company
│   ├─ detail-location       ← job.location || '—'
│   ├─ detail-recruiter-name ← job.recruiterName
│   ├─ detail-recruiter-title← job.recruiterTitle
│   ├─ detail-recruiter-url  ← job.recruiterProfileUrl (href + textContent truncado)
│   ├─ detail-job-url        ← job.jobUrl (href + textContent truncado)
│   ├─ detail-saved-at       ← formatDate(job.savedAt) + fecha larga completa
│   └─ detail-description    ← job.jobDescription || '(Descripción no disponible)'
│
└─ detailDialog.showModal()
```

#### 4d. Función `buildCopyText(job)`

Genera el texto plano formateado para el portapapeles:

```
Puesto: {job.jobTitle}
Empresa: {job.company}
Ubicación: {job.location}
Recruiter: {job.recruiterName} ({job.recruiterTitle})
Perfil: {job.recruiterProfileUrl}
Oferta: {job.jobUrl}
Guardada: {fecha larga local}

──────── Acerca del empleo ────────

{job.jobDescription}
```

#### 4e. Función `handleCopyAll()`

```js
async function handleCopyAll() {
  const text = buildCopyText(currentDetailJob); // referencia al job abierto
  await navigator.clipboard.writeText(text);
  
  // Feedback visual en el botón: "✓ ¡Copiado!" durante 1.5s, luego vuelve a "📋 Copiar todo"
  detailBtnCopy.textContent = '✓ ¡Copiado!';
  detailBtnCopy.classList.add('btn-copy-success');
  setTimeout(() => {
    detailBtnCopy.textContent = '📋 Copiar todo';
    detailBtnCopy.classList.remove('btn-copy-success');
  }, 1500);
}
```

#### 4f. Referencias y event listeners del modal

Añadir al bloque de `const` al inicio del script:
```js
const detailDialog  = document.getElementById('detail-dialog');
const detailBtnCopy = document.getElementById('detail-btn-copy');
// ... (resto de IDs)
```

Listeners:
- `detail-btn-close` y `detail-btn-close2` → `detailDialog.close()`
- `detail-btn-copy` → `handleCopyAll()`
- Click en `::backdrop` → `detailDialog.close()`

---

## ✅ Checklist de implementación (en orden)

```
[ ] 1. Añadir extracción de jobDescription en content.js → extractJobDetails()
[ ] 2. Añadir campo jobDescription al payload del SAVE_JOB
[ ] 3. Añadir <dialog id="detail-dialog"> al sidepanel.html
[ ] 4. Añadir todos los estilos del modal a sidepanel.css
[ ] 5. Añadir botón 📋 Info a buildJobCard() en sidepanel.js
[ ] 6. Añadir listener [data-info] en renderJobs()
[ ] 7. Implementar openDetailModal(), buildCopyText() y handleCopyAll()
[ ] 8. Añadir referencias DOM y event listeners del modal
[ ] 9. Probar con una oferta real que tenga descripción
[ ] 10. Probar el botón "Copiar todo" y pegar en un mensaje de LinkedIn
[ ] 11. Commit y push
```

---

## ⚠️ Notas y Consideraciones

> [!NOTE]
> Las ofertas ya guardadas **no tendrán** `jobDescription` porque fue capturada antes de este cambio.  
> En el modal se mostrará el mensaje `(Descripción no disponible para ofertas guardadas antes de esta actualización)`.  
> Las nuevas ofertas detectadas a partir de esta actualización sí incluirán la descripción.

> [!WARNING]
> LinkedIn renderiza la descripción de forma asíncrona. Si el usuario abre una oferta muy rápido, el `content.js` puede ejecutar `extractJobDetails()` antes de que el texto de la descripción esté en el DOM.  
> **Mitigación:** Si `jobDescription` está vacío y el job ya existe en storage (`isNew = false`), no sobreescribir. Si es nuevo, guardar con lo que haya.

> [!TIP]
> El campo `jobDescription` puede ser muy útil más adelante como contexto para generar un mensaje personalizado con IA (p.ej., pasarlo a la API de Gemini para generar un borrador de mensaje de contacto).

