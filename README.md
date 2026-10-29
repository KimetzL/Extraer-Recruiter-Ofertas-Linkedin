# 🎯 LinkedIn Recruiter Finder

> **Extensión de Google Chrome (Manifest V3)** diseñada para detectar, extraer y guardar automáticamente los recruiters y equipos de contratación de las ofertas de empleo de LinkedIn conforme navegas. Ideal para optimizar tu búsqueda de empleo, prospección activa y candidaturas a *internships* o *trainee programs*.

![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-0a66c2?logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/Language-Vanilla_JavaScript-f7df1e?logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-22c55e)

---

## ✨ Características Principales

- 🤖 **Detección Automática en Tiempo Real:** Analiza el DOM de las ofertas de LinkedIn y detecta bloques del equipo de contratación (`Meet the hiring team`, perfiles de anunciantes, etc.).
- 📌 **Panel Lateral Integrado (Side Panel API):** Permite ver y gestionar los recruiters sin necesidad de cambiar de pestaña ni perder el foco de tu búsqueda.
- 🗂️ **Tarjetas Informativas Completas:**
  - Avatar, nombre y titular del recruiter.
  - Título del puesto de la oferta, nombre de la empresa y ubicación.
  - Enlaces directos a: **Oferta en LinkedIn**, **Perfil del Recruiter** y **Mensaje directo** (si está habilitado).
  - Fecha en la que guardaste la oferta.
- 🗑️ **Eliminación con Confirmación Modal:**
  - Borrado individual de ofertas con ventana de confirmación para evitar accidentes.
  - Borrado masivo con confirmación de seguridad.
  - Animación suave de salida al descartar contactos.
- 🔍 **Búsqueda y Filtrado Instantáneo:** Filtra en tiempo real por nombre de recruiter, empresa, puesto o ubicación.
- 📊 **Métricas y Estadísticas:** Conteo en vivo de ofertas guardadas, número de empresas distintas y ofertas agregadas hoy.
- 📥 **Exportación a CSV:** Descarga toda tu lista en un archivo CSV compatible con Excel, Google Sheets o Notion con un solo clic.
- 🔔 **Toasts Visuales:** Notificación flotante sutil cada vez que se guarda automáticamente un nuevo contacto.

---

## 🚀 Instalación en Modo Desarrollador

Dado que es una extensión no empaquetada, puedes instalarla en menos de 1 minuto:

1. **Clona o descarga este repositorio** en tu ordenador:
   ```bash
   git clone https://github.com/TU_USUARIO/linkedin-recruiter-finder.git
   ```
   *(O descarga el archivo ZIP y descomprímelo).*

2. Abre **Google Chrome** (o cualquier navegador basado en Chromium como Brave, Edge u Opera) y accede a:
   ```text
   chrome://extensions/
   ```

3. Activa el interruptor de **"Modo de desarrollador"** (ubicado en la esquina superior derecha).

4. Haz clic en el botón **"Cargar descomprimida"** (*Load unpacked*).

5. Selecciona la carpeta raíz del proyecto (`Linkedin`).

6. ¡Listo! Verás el icono 🎯 en tu barra de extensiones. Puedes fijarlo para acceder con un clic.

---

## 💡 Cómo Usarla

1. Haz clic en el icono de la extensión para abrir el **Panel Lateral** (*Side Panel*).
2. Navega por LinkedIn Jobs (por ejemplo, buscando *"internship"*, *"junior developer"*, *"trainee"* o el puesto de tu interés).
3. Conforme entres en ofertas de empleo que cuenten con recruiter visible, la extensión lo detectará automáticamente y mostrará una notificación visual en la esquina inferior.
4. Consulta todos tus contactos acumulados en el panel lateral, accede a sus perfiles para enviarles un mensaje personalizado o exporta la lista a CSV para tu seguimiento.

---

## 📁 Estructura del Proyecto

```text
Linkedin/
├── icons/               # Iconos en múltiples resoluciones (16, 48, 128 px)
│   ├── icon-16.png
│   ├── icon-48.png
│   ├── icon-128.png
│   ├── icon-16.svg
│   ├── icon-48.svg
│   └── icon-128.svg
├── sidepanel/           # Panel lateral de la extensión
│   ├── sidepanel.html   # Estructura del panel y modal de confirmación
│   ├── sidepanel.css    # Tema oscuro, barra de scroll y diseño responsivo
│   └── sidepanel.js     # Lógica reactiva, filtrado, confirmaciones y storage
├── background.js        # Service Worker (gestión de storage y apertura del panel)
├── content.js           # Content Script inyectado en LinkedIn (detección DOM)
├── manifest.json        # Manifiesto de configuración de Chrome (MV3)
├── .gitignore           # Archivos ignorados por Git
└── README.md            # Documentación del proyecto
```

---

## 🛠️ Tecnologías Utilizadas

- **Manifest V3** de Google Chrome.
- **Chrome APIs:** `chrome.sidePanel`, `chrome.storage.local`, `chrome.runtime`.
- **Vanilla JavaScript:** Sin dependencias externas ni compiladores requeridos.
- **HTML5 & CSS3:** Variables CSS, animaciones suaves, diseño fluido y tipografía moderna Inter.

---

## 📤 Subir a tu propio GitHub

Si quieres subir este proyecto a tu cuenta de GitHub, ejecuta los siguientes comandos en tu terminal dentro de la carpeta del proyecto:

```bash
# 1. Comprobar archivos preparados
git status

# 2. Añadir todos los archivos
git add .

# 3. Crear el commit inicial
git commit -m "feat: initial release of LinkedIn Recruiter Finder"

# 4. Asegurar la rama principal main
git branch -M main

# 5. Vincular con tu repositorio remoto de GitHub
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git

# 6. Subir el proyecto
git push -u origin main
```

---

## 📄 Licencia

Este proyecto está bajo la Licencia [MIT](https://opensource.org/licenses/MIT). Puedes utilizarlo, modificarlo y distribuirlo libremente.
