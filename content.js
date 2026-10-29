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
    // Método 1: Por el enlace especial de mensaje al hiring team
    const hiringMsgLink = document.querySelector('a[href*="JOB_DETAILS_HIRING_TEAM"], a[href*="screenContext=JOB_DETAILS_HIRING_TEAM"]');
    if (hiringMsgLink) {
      // Subir al ancestro común que contiene tanto el mensaje como el perfil
      let el = hiringMsgLink;
      for (let i = 0; i < 7; i++) {
        if (!el.parentElement) break;
        el = el.parentElement;
        if (el.querySelector('a[href*="/in/"]')) {
          return el;
        }
      }
    }

    // Método 2: Por palabras clave en títulos o encabezados (español e inglés)
    const keywords = [
      'conoce al equipo de contratación',
      'personas con las que puedes hablar',
      'anunciante del empleo',
      'meet the hiring team',
      'people you can reach out to',
      'job poster'
    ];

    const allElements = document.querySelectorAll('h2, h3, p, span, div');
    for (const el of allElements) {
      if (el.children.length > 2) continue; // Evitar contenedores gigantescos
      const text = el.textContent.trim().toLowerCase();
      if (!text) continue;

      const matchesKeyword = keywords.some(kw => text.includes(kw));
      if (matchesKeyword) {
        // Encontrar el contenedor cercano que tenga el enlace al perfil (/in/)
        let container = el;
        for (let i = 0; i < 6; i++) {
          if (!container.parentElement) break;
          container = container.parentElement;
          if (container.querySelector('a[href*="/in/"]')) {
            return container;
          }
        }
      }
    }

    // Método 3: Selectores clásicos de LinkedIn
    const classicSection = document.querySelector(
      '[data-test-id="job-insight-hiring-team-card"], ' +
      '.hirer-card__hirer-information, ' +
      '.job-details-people-who-viewed__content'
    );
    if (classicSection && classicSection.querySelector('a[href*="/in/"]')) {
      return classicSection;
    }

    return null;
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

    return {
      jobId: jobId || String(Date.now()),
      jobTitle,
      company,
      companyUrl,
      location,
      jobUrl: jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : window.location.href.split('?')[0]
    };
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
})();
