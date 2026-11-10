// content.js — Content Script para LinkedIn Jobs
// Detecta de forma continua ofertas con recruiter visible mediante atributos semánticos y DOM

(function () {
  'use strict';

  console.log('[RecruiterFinder] Extensión activa en LinkedIn');

  const processedJobs = new Set();
  let lastSavedJobId = null;

  // ── Extrae el Job ID desde varias fuentes ───────────────────────────────────
  function extractJobId() {
    // 1. Del enlace de mensaje directo al equipo de contratación (el más preciso)
    const msgLink = document.querySelector('a[href*="JOB_DETAILS_HIRING_TEAM"], a[href*="jobPostingUrn"]');
    if (msgLink) {
      const match = msgLink.href.match(/jobPosting(?:Urn)?(?:%3A|:)(?:urn(?:%3A|:)li(?:%3A|:)fsd_jobPosting(?:%3A|:))?(\d+)/i);
      if (match && match[1]) return match[1];
    }

    // 2. De la URL actual
    const urlMatch = window.location.href.match(/\/jobs\/view\/(\d+)/);
    if (urlMatch) return urlMatch[1];

    const params = new URLSearchParams(window.location.search);
    const currentJobId = params.get('currentJobId');
    if (currentJobId) return currentJobId;

    // 3. De atributos en tarjetas o contenedores principales
    const jobContainer = document.querySelector('[data-job-id], [data-job-posting-id]');
    if (jobContainer) {
      return jobContainer.getAttribute('data-job-id') || jobContainer.getAttribute('data-job-posting-id');
    }

    return null;
  }

  // ── Localiza el bloque o tarjeta del recruiter en el DOM ───────────────────
  function findRecruiterContainer() {
    // ── PRIORIDAD 1: Por enlace de mensaje directo al hiring team ─────────────
    // Este href sólo aparece cuando LinkedIn muestra un recruiter individual real.
    const hiringMsgLink = document.querySelector(
      'a[href*="JOB_DETAILS_HIRING_TEAM"], a[href*="screenContext=JOB_DETAILS_HIRING_TEAM"]'
    );
    if (hiringMsgLink) {
      let el = hiringMsgLink;
      for (let i = 0; i < 7; i++) {
        if (!el.parentElement) break;
        el = el.parentElement;
        if (el.querySelector('a[href*="/in/"]')) {
          return el;
        }
      }
    }

    // ── PRIORIDAD 2: Texto exacto "Conoce al equipo de contratación" / "Meet the hiring team" ──
    // Son las únicas frases que marcan inequívocamente la presencia de un recruiter
    // individual de la oferta. Se excluye deliberadamente "Personas con las que puedes
    // hablar" / "People you can reach out to" como punto de entrada porque esa sección
    // engloba también conexiones de red y alumni que NO son recruiters de la oferta.
    const strictKeywords = [
      'conoce al equipo de contratación',
      'meet the hiring team',
    ];

    const allElements = document.querySelectorAll('h2, h3, h4, p, span, div');
    for (const el of allElements) {
      if (el.children.length > 3) continue; // Evitar contenedores gigantescos
      const text = el.textContent.trim().toLowerCase();
      if (!text) continue;

      const matchesStrict = strictKeywords.some(kw => text === kw || text.startsWith(kw));
      if (matchesStrict) {
        // Subir hasta encontrar el contenedor que contiene el perfil individual (/in/)
        let container = el;
        for (let i = 0; i < 8; i++) {
          if (!container.parentElement) break;
          container = container.parentElement;
          if (container.querySelector('a[href*="/in/"]')) {
            return container;
          }
        }
      }
    }

    // ── PRIORIDAD 3: Texto "Anunciante del empleo" / "Job poster" ─────────────
    // Este texto siempre aparece junto al perfil del recruiter real de la oferta.
    const jobPosterKeywords = ['anunciante del empleo', 'job poster'];

    for (const el of allElements) {
      if (el.children.length > 2) continue;
      const text = el.textContent.trim().toLowerCase();
      if (!text) continue;

      const matchesPoster = jobPosterKeywords.some(kw => text === kw || text.includes(kw));
      if (matchesPoster) {
        let container = el;
        for (let i = 0; i < 8; i++) {
          if (!container.parentElement) break;
          container = container.parentElement;
          if (container.querySelector('a[href*="/in/"]')) {
            // Verificación extra: que este contenedor sea de un hiring team real,
            // no de una sección genérica de sugerencias de red.
            if (!isNetworkSuggestionSection(container)) {
              return container;
            }
          }
        }
      }
    }

    // ── PRIORIDAD 4: Selectores de clase clásicos de LinkedIn ─────────────────
    const classicSection = document.querySelector(
      '[data-test-id="job-insight-hiring-team-card"], ' +
      '.hirer-card__hirer-information'
    );
    if (classicSection && classicSection.querySelector('a[href*="/in/"]')) {
      return classicSection;
    }

    return null;
  }

  // ── Detecta si un contenedor es una sección de sugerencias de red (falso positivo) ──
  // Estas secciones muestran alumni o conexiones, NO recruiters de la oferta.
  function isNetworkSuggestionSection(container) {
    const text = container.textContent.toLowerCase();

    // Señales de que es una sección de red/alumni, no de recruiter real:
    const networkSignals = [
      'miembros de tu red',         // "Alar y otros miembros de tu red"
      'members of your network',
      'antiguos alumnos',           // "Antiguos alumnos de..."
      'alumni',
      'mostrar todo',               // Botón "Mostrar todo" sin recruiter individual
      'show all',
      'y otros',                    // "Alar y otros miembros..."
      'and others',
    ];

    // Si el texto contiene señales de red, es falso positivo
    if (networkSignals.some(signal => text.includes(signal))) {
      // Excepción: si también contiene señales de recruiter, puede ser legítimo
      const recruiterSignals = [
        'anunciante del empleo', 'job poster',
        'conoce al equipo', 'meet the hiring team',
        'job_details_hiring_team'
      ];
      const hasRecruiterSignal = recruiterSignals.some(sig => text.includes(sig));
      if (!hasRecruiterSignal) return true; // Es una sección de red, descartar
    }

    // Si hay múltiples avatares/fotos superpuestas, es una sección grupal (falso positivo)
    const avatarImgs = container.querySelectorAll('img[src*="licdn.com"]');
    if (avatarImgs.length > 2) {
      // Más de 2 imágenes sin botón de mensaje directo → sección de red
      const hasDirectMsgLink = container.querySelector(
        'a[href*="JOB_DETAILS_HIRING_TEAM"], a[href*="/messaging/compose"]'
      );
      if (!hasDirectMsgLink) return true;
    }

    return false;
  }

  // ── Extrae datos del recruiter desde el contenedor encontrado ──────────────
  function extractRecruiterData(container) {
    if (!container) return null;

    // 1. Enlace al perfil (/in/nombre)
    const profileLink = container.querySelector('a[href*="/in/"]');
    if (!profileLink) return null;

    let recruiterProfileUrl = profileLink.href.split('?')[0];
    if (recruiterProfileUrl.endsWith('/')) {
      recruiterProfileUrl = recruiterProfileUrl.slice(0, -1);
    }

    // 2. Nombre del recruiter (limpiando iconos, insignias de verificado, etc.)
    let recruiterName = '';
    // Buscar párrafos o spans dentro del link que tengan el nombre
    const nameCandidate = profileLink.querySelector('p, span') || profileLink;
    if (nameCandidate) {
      const clone = nameCandidate.cloneNode(true);
      // Eliminar svg, iconos o badges como "Verificado"
      clone.querySelectorAll('svg, [role="img"], [aria-hidden="true"], [aria-label]').forEach(e => e.remove());
      recruiterName = clone.textContent.replace(/\s+/g, ' ').trim();
    }
    if (!recruiterName) {
      recruiterName = profileLink.textContent.replace(/\s+/g, ' ').trim();
    }

    // Si el nombre aún contiene caracteres raros o sufijos de grado de conexión
    recruiterName = recruiterName.replace(/•.*$/, '').trim();

    // 3. Titular profesional / cargo del recruiter
    let recruiterTitle = '';
    const paragraphs = Array.from(container.querySelectorAll('p, span, div')).map(p => p.textContent.trim()).filter(Boolean);
    const ignoreList = [
      'conoce al equipo de contratación',
      'personas con las que puedes hablar',
      'anunciante del empleo',
      'enviar mensaje',
      'meet the hiring team',
      'people you can reach out to',
      'job poster',
      'send message',
      'verificado',
      recruiterName.toLowerCase()
    ];

    for (const text of paragraphs) {
      const lower = text.toLowerCase();
      const shouldIgnore = ignoreList.some(ign => lower === ign || (ign.length > 5 && lower.includes(ign)));
      if (!shouldIgnore && !text.startsWith('•') && text.length > 3 && text.length < 150) {
        recruiterTitle = text;
        break;
      }
    }

    // 4. Foto / Avatar del recruiter (si existe)
    let recruiterAvatar = null;
    const avatarImg = container.querySelector('img[src*="media.licdn.com"], img[src*="licdn.com/dms/image"]');
    if (avatarImg && avatarImg.src) {
      recruiterAvatar = avatarImg.src;
    }

    // 5. Enlace directo a enviar mensaje (opcional)
    let messageUrl = null;
    const msgBtn = container.querySelector('a[href*="/messaging/compose"], a[href*="JOB_DETAILS_HIRING_TEAM"]');
    if (msgBtn && msgBtn.href) {
      messageUrl = msgBtn.href;
    }

    return {
      recruiterName: recruiterName || 'Recruiter de la oferta',
      recruiterTitle: recruiterTitle || 'Equipo de contratación',
      recruiterProfileUrl,
      recruiterAvatar,
      messageUrl
    };
  }

  // ── Extrae título, empresa y ubicación de la oferta ─────────────────────────
  function extractJobDetails(jobId) {
    // 1. Título de la oferta
    let jobTitle = '';
    const titleCandidates = [
      document.querySelector('h1.job-details-jobs-unified-top-card__job-title'),
      document.querySelector('h1[class*="title"]'),
      document.querySelector('.job-details-jobs-unified-top-card__job-title'),
      document.querySelector('h1')
    ];
    for (const el of titleCandidates) {
      if (el && el.textContent.trim()) {
        jobTitle = el.textContent.trim();
        break;
      }
    }
    if (!jobTitle) {
      // Devolver título de la pestaña si falla el DOM
      jobTitle = document.title.split('|')[0].trim() || 'Oferta de empleo';
    }

    // 2. Nombre de la empresa
    let company = '';
    let companyUrl = null;
    const companyLink = document.querySelector(
      '.job-details-jobs-unified-top-card__company-name a, ' +
      'a[href*="/company/"]'
    );
    if (companyLink) {
      company = companyLink.textContent.trim();
      companyUrl = companyLink.href.split('?')[0];
    }
    if (!company) {
      const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name');
      if (companyEl) company = companyEl.textContent.trim();
    }
    if (!company) {
      company = 'Empresa en LinkedIn';
    }

    // 3. Ubicación
    let location = '';
    const locCandidates = document.querySelectorAll(
      '.job-details-jobs-unified-top-card__primary-description-container span, ' +
      '[class*="location"], ' +
      '.job-details-jobs-unified-top-card__bullet'
    );
    for (const el of locCandidates) {
      const txt = el.textContent.trim();
      if (txt && !txt.includes('hace') && !txt.includes('solicitudes') && !txt.includes('applicant') && txt.length < 80) {
        location = txt;
        break;
      }
    }

    // 4. Descripción ("Acerca del empleo" / "About the job")
    let jobDescription = extractJobDescriptionFromDOM();

    return {
      jobId: jobId || String(Date.now()),
      jobTitle,
      company,
      companyUrl,
      location,
      jobDescription,
      jobUrl: jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : window.location.href.split('?')[0]
    };
  }

  // ── Extrae el texto de la descripción con múltiples estrategias ────────────
  function extractJobDescriptionFromDOM() {
    // Lista amplia de selectores conocidos de LinkedIn
    const descCandidates = [
      document.querySelector('#job-details'),
      document.querySelector('.jobs-description-content__text'),
      document.querySelector('.jobs-box__html-content'),
      document.querySelector('.jobs-description__content'),
      document.querySelector('.jobs-description'),
      document.querySelector('article.jobs-description__container'),
      document.querySelector('[data-job-details]'),
      document.querySelector('[class*="jobs-description"]'),
      document.querySelector('[class*="job-details-about-the-job"]')
    ];

    for (const el of descCandidates) {
      if (!el) continue;
      const text = cleanDescriptionText(el);
      if (text && text.length > 40) {
        return text;
      }
    }

    // Búsqueda por encabezado ("Acerca del empleo" / "About the job")
    const headings = document.querySelectorAll('h2, h3, h4');
    for (const h of headings) {
      const lower = h.textContent.trim().toLowerCase();
      if (lower.includes('acerca del empleo') || lower.includes('about the job') || lower.includes('sobre el empleo')) {
        let parent = h.parentElement;
        for (let i = 0; i < 4; i++) {
          if (!parent) break;
          const text = cleanDescriptionText(parent);
          if (text && text.length > 80) {
            return text;
          }
          parent = parent.parentElement;
        }
      }
    }

    return '';
  }

  function cleanDescriptionText(element) {
    if (!element) return '';
    try {
      const clone = element.cloneNode(true);
      // Eliminar elementos no textuales o botones de interacción
      clone.querySelectorAll('button, svg, [role="button"], [aria-hidden="true"], script, style').forEach(e => e.remove());

      // Reemplazar saltos y listas para preservar párrafos
      clone.querySelectorAll('p, br, li, div, h1, h2, h3, h4').forEach(block => {
        block.after('\n');
      });

      const raw = clone.textContent
        .replace(/\r/g, '')
        .replace(/\t/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      return raw.slice(0, 9000);
    } catch (e) {
      return '';
    }
  }

  // ── Toast flotante en pantalla ─────────────────────────────────────────────
  function showToast(message, recruiterAvatar = null) {
    const existing = document.getElementById('lrf-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'lrf-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 28px;
      right: 28px;
      z-index: 2147483647;
      background: #0d1117;
      border: 1px solid #0a66c2;
      color: #ffffff;
      padding: 12px 18px;
      border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 12px rgba(10, 102, 194, 0.4);
      display: flex;
      align-items: center;
      gap: 12px;
      animation: lrf-slidein 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      max-width: 360px;
      pointer-events: auto;
    `;

    if (!document.getElementById('lrf-styles')) {
      const style = document.createElement('style');
      style.id = 'lrf-styles';
      style.textContent = `
        @keyframes lrf-slidein {
          from { transform: translateY(25px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes lrf-slideout {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(25px); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    const avatarHtml = recruiterAvatar
      ? `<img src="${recruiterAvatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #0a66c2;flex-shrink:0;">`
      : `<div style="width:36px;height:36px;border-radius:50%;background:#0a66c2;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🎯</div>`;

    toast.innerHTML = `
      ${avatarHtml}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;color:#58a6ff;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">✓ Recruiter Guardado</div>
        <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;color:#f0f6fc;">${message}</div>
      </div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'lrf-slideout 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // ── Escaneo principal ──────────────────────────────────────────────────────
  function scanAndProcess() {
    const container = findRecruiterContainer();
    if (!container) return; // No hay sección de contratación visible aún

    const recruiterData = extractRecruiterData(container);
    if (!recruiterData || !recruiterData.recruiterProfileUrl) return;

    const jobId = extractJobId();
    const uniqueKey = jobId || recruiterData.recruiterProfileUrl;

    // Evitar procesar repetidamente la misma oferta
    if (processedJobs.has(uniqueKey) || lastSavedJobId === uniqueKey) {
      return;
    }

    console.log('[RecruiterFinder] ¡Recruiter detectado!', recruiterData);

    const jobDetails = extractJobDetails(jobId);
    const fullPayload = {
      ...jobDetails,
      ...recruiterData,
      jobId: uniqueKey
    };

    processedJobs.add(uniqueKey);
    lastSavedJobId = uniqueKey;

    chrome.runtime.sendMessage({ type: 'SAVE_JOB', data: fullPayload }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[RecruiterFinder] Error guardando:', chrome.runtime.lastError.message);
        return;
      }
      if (response && response.isNew) {
        console.log('[RecruiterFinder] Guardado con éxito en storage:', fullPayload);
        showToast(`${recruiterData.recruiterName} (${jobDetails.company})`, recruiterData.recruiterAvatar);
      } else {
        console.log('[RecruiterFinder] La oferta ya estaba guardada previamente');
      }

      // Si por la carga asíncrona no se capturó la descripción todavía,
      // la intentamos reintentar en segundo plano a los 1.5s y 3.5s
      if (!fullPayload.jobDescription) {
        retryCaptureDescription(uniqueKey);
      }
    });
  }

  // ── Reintento asíncrono para capturar descripción diferida ──────────────────
  function retryCaptureDescription(jobId) {
    const delays = [1500, 3500];
    delays.forEach(delay => {
      setTimeout(() => {
        const desc = extractJobDescriptionFromDOM();
        if (desc && desc.length > 40) {
          console.log('[RecruiterFinder] Descripción capturada en reintento asíncrono');
          chrome.runtime.sendMessage({
            type: 'UPDATE_JOB_DESCRIPTION',
            jobId: jobId,
            jobDescription: desc
          });
        }
      }, delay);
    });
  }

  // ── Observación continua ───────────────────────────────────────────────────
  // 1. Escaneo periódico suave (cada 1s) para atrapar renders asíncronos y scrolls
  setInterval(scanAndProcess, 1000);

  // 2. Observer de mutaciones en el DOM para reaccionar al instante
  const observer = new MutationObserver(() => {
    scanAndProcess();
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  // Ejecución inicial
  scanAndProcess();

  // ── Módulo Actor de Autopilot ──────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTOPILOT_GET_CARDS') {
      const cards = getJobCardElements();
      sendResponse({
        success: true,
        count: cards.length,
        hasPagination: !!findNextPageButton()
      });
      return false;
    }

    if (message.type === 'AUTOPILOT_CLICK_CARD') {
      const cards = getJobCardElements();
      const targetCard = cards[message.index];

      if (!targetCard) {
        sendResponse({ success: false, error: 'Tarjeta no encontrada en el índice' });
        return false;
      }

      // Scroll suave y visible hacia la tarjeta
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // Click en el enlace principal de la tarjeta
      const clickable = targetCard.querySelector('a[href*="/jobs/view/"], .job-card-list__title, button') || targetCard;
      clickable.click();

      // Devolver confirmación de click
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'AUTOPILOT_NEXT_PAGE') {
      const nextBtn = findNextPageButton();
      if (!nextBtn) {
        sendResponse({ success: false, error: 'No hay más páginas disponibles' });
        return false;
      }

      nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nextBtn.click();
      sendResponse({ success: true });
      return false;
    }
  });

  function getJobCardElements() {
    // Lista exhaustiva y moderna de selectores para las tarjetas de la lista izquierda de LinkedIn
    const candidateSelectors = [
      'li[data-occludable-job-id]',
      '[data-job-id]',
      '.jobs-search-results__list-item',
      '.jobs-search-results-list__list-item',
      '.job-card-container',
      '.job-card-list',
      '.scaffold-layout__list-container li',
      'ul.jobs-search__results-list li',
      'div[data-view-name="job-card"]'
    ];

    for (const sel of candidateSelectors) {
      const items = Array.from(document.querySelectorAll(sel));
      if (items.length > 0) {
        // Filtrar elementos duplicados o que no sean tarjetas reales
        const cardsWithLinks = items.filter(el => {
          return el.querySelector('a[href*="/jobs/view/"], a[href*="currentJobId"], a.job-card-list__title') ||
                 el.getAttribute('data-job-id') ||
                 el.getAttribute('data-occludable-job-id');
        });
        if (cardsWithLinks.length > 0) {
          return cardsWithLinks;
        }
      }
    }

    // Estrategia de rescate: buscar directamente los enlaces a ofertas en la columna izquierda/lista
    const links = Array.from(document.querySelectorAll('a[href*="/jobs/view/"], a[href*="currentJobId="]'));
    if (links.length > 0) {
      // Subir al contenedor padre tipo li o tarjeta
      const cardMap = new Map();
      for (const a of links) {
        let parent = a.closest('li') || a.closest('.job-card-container') || a.parentElement;
        if (parent && !cardMap.has(parent)) {
          cardMap.set(parent, parent);
        }
      }
      if (cardMap.size > 0) {
        return Array.from(cardMap.values());
      }
    }

    return [];
  }

  function findNextPageButton() {
    // Botón de página siguiente (flecha o texto Siguiente/Next)
    const candidates = [
      document.querySelector('button[aria-label="Siguiente"]'),
      document.querySelector('button[aria-label="Next"]'),
      document.querySelector('.jobs-search-pagination__button--next'),
      document.querySelector('button.artdeco-pagination__button--next')
    ];

    for (const b of candidates) {
      if (b && !b.disabled && !b.classList.contains('artdeco-button--disabled')) {
        return b;
      }
    }

    return null;
  }
})();
