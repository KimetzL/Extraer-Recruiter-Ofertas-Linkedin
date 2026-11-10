# 🤖 Plan de Implementación: Modo Autopilot (LinkedIn Recruiter Finder)

> **Estado:** ⏸️ Planificado (no ejecutado). Documento de especificación técnica y de arquitectura.

---

## 🎯 Objetivo

Implementar un modo **"Autopilot"** controlado desde el panel lateral (*Sidepanel*) que automatice la navegación por la lista de resultados de LinkedIn Jobs. 
El sistema hará clic automáticamente en cada tarjeta de oferta, esperará la carga del panel de detalles, dejará que el script de detección (`content.js`) analice si existe un recruiter legítimo y avanzará de forma continua (incluyendo cambio de página).

---

## 📐 Arquitectura del Sistema

```
[Sidepanel UI] <─────(Mensajes / Relay)─────> [background.js] <─────(Tabs API)─────> [content.js]
  - Botón Play / Stop                           - Relay de mensajes                       - Localiza tarjetas DOM
  - Selector de velocidad                         bidireccional                           - Clic nativo + scroll suave
  - Límite de ofertas                                                                     - Espera render (MutationObserver)
  - Barra de progreso y estado                                                            - Paginación automática
```

---

## 📁 Archivos Involucrados

| Archivo | Acción | Descripción |
|---|---|---|
| `d:\Linkedin\sidepanel\sidepanel.html` | Modificar | Agregar sección de controles de Autopilot (botón, selector de velocidad, límite, barra de progreso). |
| `d:\Linkedin\sidepanel\sidepanel.css` | Modificar | Estilos oscuros integrados, animaciones del botón de ejecución y barra de estado. |
| `d:\Linkedin\sidepanel\sidepanel.js` | Modificar | Orquestador: máquina de estados, control de tiempos con jitter y emisión de comandos. |
| `d:\Linkedin\background.js` | Modificar | Enrutador de eventos `AUTOPILOT_*` entre el Sidepanel y la pestaña activa de LinkedIn. |
| `d:\Linkedin\content.js` | Modificar | Actor DOM: interacción con tarjetas de empleo, scroll suave, espera de carga y clic en página siguiente. |

---

## 🛠️ Desglose Técnico por Fases

### Fase 1: Interfaz en el Sidepanel (`sidepanel.html` y `sidepanel.css`)
- **Controles de usuario:**
  - Botón principal de alternancia: `▶ Iniciar Autopilot` / `⏹ Detener`.
  - Selector de velocidad / retardo:
    - *Seguro / Humano:* 2.5s – 4.0s (Recomendado).
    - *Equilibrado:* 1.5s – 2.5s.
    - *Rápido:* 1.0s – 1.5s.
  - Límite numérico de ofertas a procesar (ej. 25, 50, 100).
- **Indicadores de estado:**
  - Barra de progreso dinámica porcentual.
  - Contador en vivo: `Escaneando oferta X de Y...` y `Recruiters encontrados: Z`.

### Fase 2: Orquestador (`sidepanel.js`)
- **Máquina de estados:**
  - `IDLE`: En reposo.
  - `RUNNING`: En ejecución de bucle.
  - `PAUSED / STOPPED`: Detenido manualmente o por finalización de cuota.
  - `ERROR`: Notificación si la pestaña activa no es una búsqueda de empleo de LinkedIn.
- **Temporización con Jitter:**
  - Aplicación de un factor aleatorio ($\pm 20\%$) sobre el retardo base seleccionado para evitar intervalos mecánicos repetitivos.

### Fase 3: Relay de Comunicación (`background.js`)
- Añadir listeners para el canal `AUTOPILOT_*`:
  - `AUTOPILOT_START`: Verifica la pestaña activa con URL `linkedin.com/jobs/*` y retransmite al `content.js`.
  - `AUTOPILOT_STEP`: Solicita al content script abrir la siguiente tarjeta por índice.
  - `AUTOPILOT_STEP_COMPLETED`: Recibe la confirmación del escaneo y actualiza el panel.
  - `AUTOPILOT_NEXT_PAGE`: Solicita avanzar a la siguiente página de resultados.
  - `AUTOPILOT_STOP`: Cancela cualquier acción en curso.

### Fase 4: Actor DOM en LinkedIn (`content.js`)
- **Selectores jerárquicos de tarjetas:**
  - Búsqueda de elementos clicables en el carrusel/lista lateral izquierda (`ul.scaffold-layout__list-container > li`, `[data-job-id]`).
- **Simulación de interacción natural:**
  - `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` antes de la selección.
  - Llamada al método `.click()` nativo sobre el enlace o contenedor.
- **Sincronización asíncrona:**
  - Uso de `MutationObserver` para detectar cuándo el contenedor principal de detalle ha terminado de cambiar de `jobId`.
  - Disparo de la lógica existente de extracción y guardado (`scanAndProcess()`).
  - Notificación de éxito o descarte al Sidepanel.
- **Gestión de paginación:**
  - Detección del botón `Siguiente` (`button[aria-label="Siguiente"]` o equivalente en paginación numerada).
  - Espera a la recarga de la lista y reinicio del índice de escaneo.

---

## 🛡️ Medidas Anti-Detección y Buenas Prácticas

1. **Retardo Humano Variable (Jitter):** Los tiempos entre clics nunca son exactos ni periódicos.
2. **Scroll Visible:** Simula el comportamiento del usuario desplazando la lista lateral antes de hacer clic.
3. **Pausa ante Checkpoints:** Si se detecta un iframe de captcha o modal de verificación de LinkedIn, el proceso se detiene inmediatamente emitiendo una alerta.
4. **Límite Mínimo Fijo:** No se permite configurar un retardo inferior a 800 ms para proteger la cuenta contra rate-limiting.

---

## 📋 Pasos para su Ejecución Futura

1. [ ] Crear los elementos visuales en `sidepanel/sidepanel.html` y aplicar estilos en `sidepanel/sidepanel.css`.
2. [ ] Programar el relay en `background.js` para conectar panel y pestañas activas.
3. [ ] Añadir las funciones de clic en tarjeta, scroll y paginación en `content.js`.
4. [ ] Integrar el bucle orquestador y la gestión de eventos en `sidepanel/sidepanel.js`.
5. [ ] Probar en entorno real con una búsqueda de ofertas en LinkedIn.

