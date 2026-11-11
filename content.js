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

    // 5. Sueldo / Salario (Cabecera superior o Descripción)
    let salary = extractSalary(jobDescription);

    return {
      jobId: jobId || String(Date.now()),
      jobTitle,
      company,
      companyUrl,
      location,
      salary,
      jobDescription,
      jobUrl: jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : window.location.href.split('?')[0]
    };
  }

  // ── Extrae el sueldo de la oferta (Cabecera superior o Descripción) ────────
  function extractSalary(jobDescription) {
    // PRIORIDAD 1: Cabecera superior (Top Card de LinkedIn)
    const topCardSalaryCandidates = [
      ...document.querySelectorAll('.job-details-jobs-unified-top-card__job-insight'),
      ...document.querySelectorAll('.job-details-jobs-unified-top-card__primary-description-container span'),
      ...document.querySelectorAll('[class*="job-insight"]'),
      ...document.querySelectorAll('[class*="salary"]'),
      ...document.querySelectorAll('[class*="compensation"]')
    ];

    for (const el of topCardSalaryCandidates) {
      const text = el.textContent.trim();
      // Excluir elementos que sean claramente de fecha o solicitudes
      if (text.includes('hace ') || text.includes('solicitud') || text.includes('applicant')) continue;
      const sal = extractSalaryFromText(text);
      if (sal) {
        return sal;
      }
    }

    // PRIORIDAD 2: Cuerpo de la descripción ("Acerca del empleo" / "About the job")
    if (jobDescription) {
      const sal = extractSalaryFromText(jobDescription);
      if (sal) {
        return sal;
      }
    }

    return null;
  }

  // ── Analiza cualquier bloque de texto para extraer un salario válido ───────
  function extractSalaryFromText(text) {
    if (!text) return null;
    // Normalizar Unicode (convierte negritas matemu00e1ticas como u{1D5EA}u{1D5F5}u{1D5EE}u{1D601}u2019u{1D600} a What's)
    const normalized = text.normalize('NFKD');

    // 1. Patrón con prefijo explícito (Salary Range:, Base salary:, Compensation:, Hourly range:, etc.)
    const prefixRegex = /(?:salary\s*range|base\s*salary|annual\s*salary|target\s*salary|salary|compensation\s*range|compensation|pay\s*range|base\s*pay|pay|hourly\s*rate|hourly\s*range|rango\s*salarial|sueldo|salario|retribuci[oó]n|remuneraci[oó]n)\s*[:\-–—]?\s*([$€£]?\s*[\d,.]+\s*(?:k|usd|eur|cad|aud|gbp|€|[$])?(?:\s*\/\s*(?:yr|year|hr|hour|mo|año|hora))?(?:\s*(?:to|-|–|—|a)\s*[$€£]?\s*[\d,.]+\s*(?:k|usd|eur|cad|aud|gbp|€|[$])?(?:\s*\/\s*(?:yr|year|hr|hour|mo|año|hora))?)?(?:\s*(?:brutos|gross|neto|net))?)/i;
    const m1 = normalized.match(prefixRegex);
    if (m1 && m1[1]) {
      return normalizeSalaryUnit(cleanSalaryString(m1[1]), normalized);
    }

    // 2. Patrón 'Up to $X' o 'Starting at $X'
    const upToRegex = /(?:up\s*to|starting\s*at|starting\s*from|hasta|desde)\s+([$€£]?\s*[\d,.]+\s*(?:k|usd|eur|cad|aud|gbp|€)?(?:\s*(?:annually|per\s*year|\/yr|\/year|\/hr|\/hour))?)/i;
    const m2 = normalized.match(upToRegex);
    if (m2 && m2[1]) {
      const isUpTo = /up\s*to|hasta/i.test(m2[0]);
      const isStarting = /starting|desde/i.test(m2[0]);
      const prefix = isUpTo ? 'Up to ' : (isStarting ? 'Starting at ' : '');
      return normalizeSalaryUnit(cleanSalaryString(prefix + m2[1]), normalized);
    }

    // 3. Patrón de rango con símbolo (captura "$X USD/yr - Y USD/yr", "$60,000–$70,000", "$63-$71 an hour")
    // Permite código de moneda opcional después del número
    const rangeRegex = /([$€£]\s*[\d,.]+\s*(?:k)?\s*(?:usd|eur|cad|gbp|aud)?(?:\s*\/\s*(?:yr|year|hr|hour|mo|month))?(?:\s*(?:-|–|—|to|a)\s*[$€£]?\s*[\d,.]+\s*(?:k)?\s*(?:usd|eur|cad|gbp|aud)?(?:\s*\/\s*(?:yr|year|hr|hour|mo|month))?)?(?:\s*(?:brutos|gross))?)/i;
    const m3 = normalized.match(rangeRegex);
    if (m3 && m3[1]) {
      return normalizeSalaryUnit(cleanSalaryString(m3[1]), normalized);
    }

    // 4. Patrón código de moneda sin símbolo ($) — ej: "45 USD/hr - 50 USD/hr", "72,3K USD/yr - 75K USD/yr"
    const codeRangeRegex = /([\d,.]+\s*(?:k)?\s*(?:usd|eur|cad|gbp|aud)\s*(?:\/\s*(?:yr|year|hr|hour|mo|month))?(?:\s*(?:-|–|—|to)\s*[\d,.]+\s*(?:k)?\s*(?:usd|eur|cad|gbp|aud)?(?:\s*\/\s*(?:yr|year|hr|hour|mo|month))?)?)/i;
    const m4 = normalized.match(codeRangeRegex);
    if (m4 && m4[1]) {
      return normalizeSalaryUnit(cleanSalaryString(m4[1]), normalized);
    }

    return null;
  }

  /**
   * Añade /hr o /yr si el texto contextual lo indica y el valor aún no tiene unidad.
   * También elimina palabras de periodo capturadas ("per year", "an hour") antes de añadir el sufijo.
   */
  function normalizeSalaryUnit(raw, fullText) {
    if (!raw) return null;
    // Eliminar palabras de periodo que el regex haya capturado al final, para no duplicarlas
    let cleaned = raw.replace(/\s*(?:per\s+(?:year|yr|hour|hr|annum)|an\s+hour|a\s+year)\s*$/i, '').trim();
    // Si ya tiene sufijo /hr /yr etc. — no tocar
    if (/\/\s*(hr|hour|yr|year|mo|month)/i.test(cleaned)) return cleaned;
    // Detectar periodo en el contexto completo del texto
    const ctx = fullText.toLowerCase();
    const isHourly = /\ban\s+hour\b|\bper\s+hour\b|\bhourly\b|\bper\s+hr\b|\b\/hr\b/.test(ctx);
    const isYearly = /\bper\s+year\b|\bannually\b|\ba\s+year\b|\bper\s+annum\b|\b\/yr\b|\b\/year\b/.test(ctx);
    if (isHourly) return cleaned.replace(/[.,;:\s]+$/, '') + '/hr';
    if (isYearly) return cleaned.replace(/[.,;:\s]+$/, '') + '/yr';
    return cleaned;
  }

  function cleanSalaryString(str) {
    if (!str) return null;
    return str.replace(/\s+/g, ' ').replace(/[.,;:\s]+$/, '').trim();
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

  // ── Reintento asíncrono para capturar descripción y sueldo diferidos ───────
  function retryCaptureDescription(jobId) {
    const delays = [1500, 3500];
    delays.forEach(delay => {
      setTimeout(() => {
        const desc = extractJobDescriptionFromDOM();
        if (desc && desc.length > 40) {
          const salary = extractSalary(desc);
          console.log('[RecruiterFinder] Descripción y/o sueldo capturados en reintento asíncrono');
          chrome.runtime.sendMessage({
            type: 'UPDATE_JOB_DESCRIPTION',
            jobId: jobId,
            jobDescription: desc,
            salary: salary
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
  // Títulos / IDs ya procesados en esta sesión de autopilot
  const autopilotProcessedKeys = new Set();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // Resetear tarjetas procesadas al iniciar nueva sesión y volver arriba
    if (message.type === 'AUTOPILOT_RESET') {
      autopilotProcessedKeys.clear();
      document.querySelectorAll('[data-autopilot-processed]').forEach(el => el.removeAttribute('data-autopilot-processed'));
      const scrollContainers = findActualScrollContainers();
      for (const sc of scrollContainers) {
        if (sc.scrollTop > 0) sc.scrollTop = 0;
      }
      sendResponse({ success: true });
      return false;
    }

    if (message.type === 'AUTOPILOT_GET_CARDS') {
      const cards = getLeftPanelJobCards();
      console.log(`[RecruiterFinder] AUTOPILOT_GET_CARDS detectó ${cards.length} tarjetas`);
      sendResponse({
        success: true,
        count: cards.length,
        hasPagination: !!findNextPageButton()
      });
      return false;
    }

    // ── AUTOPILOT_CLICK_NEXT: selecciona la siguiente tarjeta de empleo ────────
    if (message.type === 'AUTOPILOT_CLICK_NEXT') {
      const cards = getLeftPanelJobCards();

      // Buscar la primera tarjeta de empleo no procesada aún (ordenadas de arriba a abajo)
      const targetCard = cards.find(c => !autopilotProcessedKeys.has(c.key));

      if (!targetCard) {
        // Todas las tarjetas visibles ya fueron procesadas -> hacer scroll suave en la lista
        const didScroll = performJobListScroll();
        sendResponse({ success: true, scrolled: true, didScroll, jobId: null });
        return false;
      }

      // Marcar como procesada
      autopilotProcessedKeys.add(targetCard.key);
      try {
        targetCard.element.setAttribute('data-autopilot-processed', 'true');
      } catch (_) {}

      // Click seguro y efectivo
      clickJobCard(targetCard.element);

      // Cerrar posibles modales espontáneos
      dismissAnyModalDialog();

      sendResponse({
        success: true,
        jobId: targetCard.jobId || null,
        title: targetCard.title,
        scrolled: false
      });
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
      autopilotProcessedKeys.clear();
      sendResponse({ success: true });
      return false;
    }
  });

  // ── Palabras clave de insignias y estados que NO son el título de la oferta ─
  const BADGE_KEYWORDS = [
    'promocionado', 'promoted',
    'con verificación', 'verificado', 'verified',
    'activamente contratando', 'actively hiring',
    'visto', 'viewed',
    'fácil solicitud', 'solicitud sencilla', 'easy apply',
    'guardar', 'guardado', 'save', 'saved',
    'descartar', 'dismiss',
    'compartir', 'share',
    'cerrar', 'close',
    'enviar candidatura', 'solicitar', 'solicitado',
    'con respuesta rápida', 'early applicant', 'sé de los primeros'
  ];

  function isBadgeText(str) {
    if (!str) return false;
    const lower = str.trim().toLowerCase();
    return BADGE_KEYWORDS.some(b => lower === b || lower.startsWith(b));
  }

  // ── Comprueba si un elemento es un botón de filtro o cabecera ──────────────
  function isFilterButton(el) {
    if (!el) return false;

    // 1. Ancestros que son barras de filtro o cabeceras
    if (el.closest('header, nav, [role="toolbar"], .search-filters-bar, .scaffold-layout__filters, [class*="search-filters"], [class*="filters-bar"]')) {
      return true;
    }

    // 2. Comprobar si el texto coincide con filtros de búsqueda de LinkedIn
    const text = (el.innerText || el.textContent || '').trim().toLowerCase();
    const firstLine = text.split('\n')[0].trim();
    const filterWords = [
      'fecha de publicación', 'date posted', 'últimas 24', 'última semana', 'último mes',
      'cualquier momento', 'filtros', 'todos los filtros', 'all filters',
      'tipo de empleo', 'job type', 'jornada', 'tiempo completo', 'media jornada',
      'nivel de experiencia', 'experience level', 'en remoto', 'presencial', 'híbrido',
      'crear alerta', 'alerta de empleo', 'crear una alerta', 'set alert',
      'ordenar por', 'sort by', 'más recientes', 'más pertinentes',
      'activar premium', 'premium', 'mostrar más', 'siguiente', 'anterior'
    ];

    for (const kw of filterWords) {
      if (firstLine === kw || firstLine.startsWith(kw) || text === kw) {
        return true;
      }
    }

    return false;
  }

  // ── Extrae el Job ID numérico desde un elemento ───────────────────────────
  function extractJobIdFromElement(el) {
    if (!el) return null;

    // 1. Atributo directo o en ancestro/hijo cercano
    const idAttrs = ['data-job-id', 'data-occludable-job-id', 'data-job-posting-id'];
    for (const attr of idAttrs) {
      const val = el.getAttribute?.(attr) || el.closest?.(`[${attr}]`)?.getAttribute(attr);
      if (val && /^\d+$/.test(val)) return val;
      const child = el.querySelector?.(`[${attr}]`);
      if (child) {
        const childVal = child.getAttribute(attr);
        if (childVal && /^\d+$/.test(childVal)) return childVal;
      }
    }

    // 2. data-entity-urn o data-chameleon-result-urn (urn:li:jobPosting:123456789)
    const urnSources = [
      el.getAttribute?.('data-entity-urn'),
      el.closest?.('[data-entity-urn]')?.getAttribute('data-entity-urn'),
      el.querySelector?.('[data-entity-urn]')?.getAttribute('data-entity-urn'),
      el.getAttribute?.('data-chameleon-result-urn'),
      el.querySelector?.('[data-chameleon-result-urn]')?.getAttribute('data-chameleon-result-urn')
    ];
    for (const u of urnSources) {
      if (u) {
        const m = u.match(/jobPosting:(\d+)/);
        if (m && m[1]) return m[1];
      }
    }

    // 3. Enlaces href a /jobs/view/XXXX o ?currentJobId=XXXX
    const links = el.tagName === 'A'
      ? [el]
      : Array.from(el.querySelectorAll?.('a[href*="/jobs/view/"], a[href*="currentJobId="]') || []);
    for (const a of links) {
      const href = a.href || a.getAttribute('href') || '';
      const m = href.match(/\/jobs\/view\/(\d+)/) || href.match(/currentJobId=(\d+)/);
      if (m && m[1]) return m[1];
    }

    // 4. Búsqueda en el HTML interno por URN numérico
    if (el.innerHTML) {
      const m = el.innerHTML.match(/(?:jobPosting|fsd_jobPosting)(?:%3A|:)(\d{8,12})/);
      if (m && m[1]) return m[1];
    }

    return null;
  }

  // ── Extrae el título real de la oferta ignorando badges ────────────────────
  function extractJobTitleFromCard(el) {
    if (!el) return 'Oferta de empleo';

    // 1. Selectores semánticos de título dentro de la tarjeta
    const titleSelectors = [
      '.job-card-list__title',
      '.job-card-container__link',
      'a[href*="/jobs/view/"]',
      'strong',
      'h3',
      'h4',
      '[class*="title"]:not([class*="subtitle"]):not([class*="company"])'
    ];

    for (const sel of titleSelectors) {
      const candidate = el.querySelector(sel);
      if (candidate) {
        const txt = candidate.textContent.trim();
        if (txt.length >= 3 && !isBadgeText(txt)) {
          return txt;
        }
      }
    }

    // 2. Parsear líneas de texto ignorando insignias / badges iniciales
    const lines = (el.innerText || el.textContent || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0);

    for (const line of lines) {
      if (!isBadgeText(line) && line.length >= 3 && line.length <= 120) {
        return line;
      }
    }

    return 'Oferta de empleo';
  }

  // ── Encuentra todas las tarjetas de empleo en el panel IZQUIERDO ──────────
  // Compatible con /jobs/search/, /jobs/search-results/ y cualquier vista de LinkedIn Jobs
  function getLeftPanelJobCards() {
    const rawCandidates = Array.from(document.querySelectorAll(
      'li.jobs-search-results__list-item, ' +
      'li.scaffold-layout__list-item, ' +
      'li[data-occludable-job-id], ' +
      '.scaffold-layout__list-container > li, ' +
      '.jobs-search-results-list li, ' +
      '[data-view-name="job-card"], ' +
      '.job-card-container, ' +
      'a[href*="/jobs/view/"], ' +
      '[role="button"]'
    ));

    const validCards = [];
    const seenKeys = new Set();

    for (const el of rawCandidates) {
      // 1. Debe estar en la mitad izquierda de la pantalla
      const rect = el.getBoundingClientRect();
      if (rect.left > window.innerWidth * 0.52 || rect.left < 0) continue;
      if (rect.width < 120) continue;
      // Altura física: los filtros miden 28-36px. Las tarjetas reales miden entre 45px y 350px
      if (rect.height < 45 || rect.height > 350) continue;
      if (rect.top < 60) continue; // Debajo del encabezado

      // 2. Excluir panel derecho de detalle
      if (el.closest('.jobs-details__main-content, [data-view-name="job-details"], .jobs-search__job-details, .job-details-jobs-unified-top-card')) {
        continue;
      }

      // 3. Excluir filtros y cabeceras
      if (isFilterButton(el)) continue;

      // 4. Excluir enlaces ajenos
      if (el.href) {
        if (el.href.includes('/company/')) continue;
        if (el.href.includes('premium')) continue;
        if (el.href.includes('/messaging/')) continue;
        if (el.href.includes('/in/')) continue;
      }

      // 5. Excluir botones auxiliares (guardar, descartar, etc.)
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      if (
        aria.includes('guardar') || aria.includes('save') ||
        aria.includes('descartar') || aria.includes('dismiss') ||
        aria.includes('compartir') || aria.includes('share') ||
        aria.includes('cerrar') || aria.includes('close')
      ) {
        continue;
      }

      // 6. Extraer título real de la oferta
      const title = extractJobTitleFromCard(el);
      if (!title || title.length < 3 || isBadgeText(title)) continue;

      // 7. Extraer Job ID numérico
      const jobId = extractJobIdFromElement(el);

      // Deduplicar por Job ID o por título normalizado
      const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 35);
      const uniqueKey = jobId ? `job_${jobId}` : `title_${normTitle}`;

      if (seenKeys.has(uniqueKey)) continue;
      seenKeys.add(uniqueKey);

      validCards.push({
        element: el,
        key: uniqueKey,
        jobId: jobId,
        title: title,
        top: rect.top
      });
    }

    // Ordenar estrictamente de arriba a abajo por posición vertical en pantalla
    validCards.sort((a, b) => a.top - b.top);

    return validCards;
  }

  // ── Localiza el mejor elemento clickeable dentro de la tarjeta ─────────────
  function findClickableInCard(cardEl) {
    if (!cardEl) return cardEl;

    // 1. Contenedor de tarjeta clickeable interno con role="button" (común en LinkedIn)
    const roleButton = cardEl.querySelector(
      '.job-card-container, div[role="button"]:not([aria-label*="Guardar"]):not([aria-label*="Descartar"]):not([aria-label*="Save"]):not([aria-label*="Dismiss"])'
    );
    if (roleButton) return roleButton;

    // 2. Si cardEl mismo tiene role="button" y no es botón auxiliar
    if (cardEl.getAttribute?.('role') === 'button' && !isAuxiliaryButton(cardEl)) {
      return cardEl;
    }

    // 3. Enlace con título del empleo
    const titleLink = cardEl.querySelector('.job-card-list__title, .job-card-container__link, a[href*="/jobs/view/"]');
    if (titleLink) return titleLink;

    // 4. El propio elemento de la tarjeta
    return cardEl;
  }

  function isAuxiliaryButton(el) {
    if (!el) return false;
    const label = (el.getAttribute?.('aria-label') || '').toLowerCase();
    const txt = (el.innerText || el.textContent || '').trim().toLowerCase();
    const auxWords = ['guardar', 'save', 'descartar', 'dismiss', 'compartir', 'share', 'cerrar', 'close'];
    return auxWords.some(w => label.includes(w) || (txt.length < 20 && txt.includes(w)));
  }

  // ── Ejecuta el click simulando interacción de usuario en la tarjeta ────────
  function clickJobCard(cardEl) {
    const clickable = findClickableInCard(cardEl);

    // Scroll suave solo si el elemento no está ya en el viewport
    cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Si clickable es una etiqueta <a>, interceptar navegación para evitar full-page reload
    if (clickable.tagName === 'A' || clickable.closest('a')) {
      const blockNav = (e) => {
        e.preventDefault();
      };
      clickable.addEventListener('click', blockNav, { capture: true, once: true });
    }

    clickable.focus?.();
    clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, buttons: 1, view: window }));
    clickable.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, buttons: 1, view: window }));
    clickable.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true, buttons: 1, view: window }));

    // Si clickable es un elemento interno, disparar también en el contenedor
    if (clickable !== cardEl) {
      cardEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, buttons: 1, view: window }));
      cardEl.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, buttons: 1, view: window }));
      cardEl.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true, buttons: 1, view: window }));
    }
  }

  // ── Realiza scroll moderado SOLO en la lista de ofertas (NUNCA en window) ──
  function performJobListScroll() {
    let scrolled = false;

    // Localizar el contenedor scrollable exacto de la lista
    const scrollContainers = findActualScrollContainers();

    for (const container of scrollContainers) {
      const prevTop = container.scrollTop;
      // Scroll moderado (180px) para que las ofertas no se pasen de largo en listas virtuales
      container.scrollTop += 180;
      if (container.scrollTop !== prevTop) {
        scrolled = true;
      }

      // Disparar eventos de scroll y rueda para activar la virtualización
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
      container.dispatchEvent(new WheelEvent('wheel', {
        deltaY: 200,
        bubbles: true,
        cancelable: true
      }));
    }

    return scrolled;
  }

  // ── Detecta los contenedores con scroll real en la columna izquierda ──────
  function findActualScrollContainers() {
    const containers = new Set();
    const candidates = document.querySelectorAll('div, ul, main, section, aside');
    for (const el of candidates) {
      // Excluir panel de detalle derecho y cabecera
      if (el.closest('.jobs-details__main-content, [data-view-name="job-details"], .jobs-search__job-details, header')) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.left < window.innerWidth * 0.55 && rect.width > 150 && rect.height > 150) {
        if (isElementScrollable(el)) {
          containers.add(el);
        }
      }
    }
    return Array.from(containers);
  }

  // Comprueba si un elemento tiene scroll activo real
  function isElementScrollable(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll') return false;
    if (el.scrollHeight <= el.clientHeight) return false;

    // Prueba física: comprobar si scrollTop se puede mover
    const initial = el.scrollTop;
    el.scrollTop = initial + 2;
    if (el.scrollTop !== initial) {
      el.scrollTop = initial; // restaurar
      return true;
    }
    if (initial > 0) {
      el.scrollTop = initial - 2;
      if (el.scrollTop !== initial) {
        el.scrollTop = initial;
        return true;
      }
    }
    return el.scrollHeight > el.clientHeight + 100;
  }

  // Mantener alias legacy por compatibilidad
  function getLeftPanelJobLinks() {
    return getLeftPanelJobCards().map(c => c.element);
  }
  function getJobCardElements() {
    return getLeftPanelJobCards().map(c => c.element);
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

  // ── Cierra modales intrusivos de LinkedIn ──────────────────────────────────
  function dismissAnyModalDialog() {
    setTimeout(() => {
      // Buscar botón de cerrar en modales de LinkedIn (artdeco-modal)
      const dismissButtons = [
        document.querySelector('.artdeco-modal button[aria-label="Cerrar"]'),
        document.querySelector('.artdeco-modal button[aria-label="Dismiss"]'),
        document.querySelector('.artdeco-modal button[aria-label="Close"]'),
        document.querySelector('.artdeco-modal .artdeco-modal__dismiss')
      ];

      for (const btn of dismissButtons) {
        if (btn) {
          btn.click();
          break;
        }
      }
    }, 400);
  }
})();
