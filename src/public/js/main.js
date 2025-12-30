// src/public/js/main.js
// Public-side behaviors (CSP-safe; no inline JS).
// IMPORTANT: We do NOT convert times. We display exactly what the server rendered.
// The Selected Times list is built from the UI text inside each opportunity.

document.addEventListener('DOMContentLoaded', () => {
  // Toast/snackbar on Manage page ---------------------------------------------------
  try {
    const toastRoot = document.getElementById('toast-root');
    const toastData = document.getElementById('manage-toast-data');
    const showToast = (message, variant) => {
      if (!toastRoot || !message) return;
      const el = document.createElement('div');
      el.className = 'toast ' + (variant === 'success' ? 'toast--success' : (variant === 'danger' ? 'toast--danger' : ''));
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = `
        <svg class="toast__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 14.414-4.207-4.207 1.414-1.414L11 13.586l4.793-4.793 1.414 1.414L11 16.414Z"/></svg>
        <span>${message}</span>
        <button type="button" class="toast__close" aria-label="Close">×</button>`;
      toastRoot.appendChild(el);
      const remove = () => { try { el.remove(); } catch (_) {} };
      const close = el.querySelector('.toast__close');
      if (close) close.addEventListener('click', remove);
      setTimeout(remove, 4200);
    };
    // Try data attribute first; fall back to inline success notice text.
    let successMsg = '';
    let debugMsg = '';
    if (toastData) {
      successMsg = toastData.getAttribute('data-success') || '';
      debugMsg = toastData.getAttribute('data-debug') || '';
    }
    if (successMsg && successMsg.trim()) {
      showToast(successMsg.trim(), 'success');
    } else {
      const inline = document.querySelector('.notice.notice--success');
      if (inline) {
        const text = (inline.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) showToast(text, 'success');
      }
    }
    if (debugMsg && debugMsg.trim()) {
      showToast(debugMsg.trim(), 'danger');
    }
  } catch (_) {}
  console.log('DOM fully loaded. Initializing scripts.');

  function fallbackCopyText(text) {
    return new Promise((resolve, reject) => {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.setAttribute('readonly', '');
        el.style.position = 'fixed';
        el.style.top = '-999px';
        el.style.left = '-999px';
        document.body.appendChild(el);
        el.select();
        el.setSelectionRange(0, el.value.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(el);
        if (ok) resolve();
        else reject(new Error('Copy command failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  function copyTextToClipboard(text) {
    if (!text) return Promise.reject(new Error('Nothing to copy'));
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopyText(text));
    }
    return fallbackCopyText(text);
  }

  // Optional debug outlines (?debug=containers)
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === 'containers') {
      document.documentElement.classList.add('debug-containers');
    }
  } catch (_) {}

  // Share link buttons (admin + public pages) -------------------------------
  (function initShareLinkCopyButtons() {
    const buttons = document.querySelectorAll('[data-copy-share-link]');
    if (!buttons.length) return;
    buttons.forEach((btn) => {
      if (btn.dataset.shareHandlerAttached === '1') return;
      btn.dataset.shareHandlerAttached = '1';
      const defaultLabel = btn.getAttribute('data-label-default') || 'Copy link';
      const successLabel = btn.getAttribute('data-label-success') || 'Copied!';
      const errorLabel = btn.getAttribute('data-label-error') || 'Unable to copy';
      const labelEl = btn.querySelector('.share-link__copy-label') || btn;

      function resetState() {
        btn.classList.remove('is-busy');
        btn.classList.remove('is-copied');
        if (labelEl) labelEl.textContent = defaultLabel;
      }

      btn.addEventListener('click', () => {
        const value = btn.getAttribute('data-copy-share-link');
        if (!value) return;
        btn.classList.add('is-busy');
        copyTextToClipboard(value).then(() => {
          btn.classList.add('is-copied');
          if (labelEl) labelEl.textContent = successLabel;
          setTimeout(() => resetState(), 2000);
        }).catch(() => {
          btn.classList.remove('is-copied');
          if (labelEl) labelEl.textContent = errorLabel;
          setTimeout(() => resetState(), 2500);
        });
      });
    });
  })();

  // ---- (Admin pages) datepicker initialization handled in admin JS when a modal opens ----

  // Responsive navigation toggle
  try {
    const navToggle = document.querySelector('[data-nav-toggle]');
    const primaryNav = document.querySelector('[data-nav]');
    if (navToggle && primaryNav) {
      const closeNav = () => {
        primaryNav.setAttribute('data-nav-state', 'closed');
        navToggle.setAttribute('aria-expanded', 'false');
      };
      navToggle.addEventListener('click', () => {
        const isOpen = primaryNav.getAttribute('data-nav-state') === 'open';
        const next = isOpen ? 'closed' : 'open';
        primaryNav.setAttribute('data-nav-state', next);
        navToggle.setAttribute('aria-expanded', String(!isOpen));
      });
      primaryNav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => closeNav());
      });
      window.addEventListener('resize', () => {
        if (window.innerWidth >= 961) {
          closeNav();
        }
      });
    }
  } catch (err) {
    console.error('[NavToggle] Failed to initialize responsive navigation toggle:', err);
  }

  // Account menu (header) — close when clicking outside or pressing Esc
  try {
    const closeOpenAccountMenus = () => {
      document.querySelectorAll('details.account-menu[open]').forEach(d => d.removeAttribute('open'));
    };

    document.addEventListener('click', (e) => {
      document.querySelectorAll('details.account-menu[open]').forEach(d => {
        if (!d.contains(e.target)) d.removeAttribute('open');
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeOpenAccountMenus();
    });
  } catch (err) {
    console.error('[AccountMenu] Failed to wire outside/esc close:', err);
  }

  // Help dropdown (header) — close when clicking outside or pressing Esc
  try {
    const closeHelpMenus = () => {
      document.querySelectorAll('.topbar__help details[open]').forEach(d => d.removeAttribute('open'));
    };

    document.addEventListener('click', (e) => {
      document.querySelectorAll('.topbar__help details[open]').forEach(d => {
        if (!d.contains(e.target)) d.removeAttribute('open');
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeHelpMenus();
    });
  } catch (err) {
    console.error('[HelpMenu] Failed to wire outside/esc close:', err);
  }

  // Print helpers (CSP-safe; no inline handlers)
  try {
    const params = new URLSearchParams(location.search || '');
    const auto = params.get('auto');
    // Debug helpers: enable spacing outlines with ?debug=spacing
    const debugFlag = params.get('debug');
    if (debugFlag && /^(1|true|on|yes|spacing)$/i.test(debugFlag)) {
      try { document.body.classList.add('debug-spacing'); } catch (_) {}
    }
    const printBtn = document.querySelector('[data-action="print"]');
    if (printBtn) {
      printBtn.addEventListener('click', (e) => {
        e.preventDefault();
        try { window.print(); } catch (err) { console.error('[Print] Failed to invoke print:', err); }
      });
    }
    if (auto === '1') {
      setTimeout(() => {
        try { window.print(); } catch (err) { console.error('[Print] Auto print failed:', err); }
      }, 200);
    }
  } catch (err) {
    console.error('[Print] Initialization error:', err);
  }

  // Admin Dashboard: client-side sorting for events table
  try {
    const eventsTable = document.querySelector('#adminEventsTable');
    if (eventsTable) {
      const tbody = eventsTable.querySelector('tbody');
      const rows = Array.from(tbody.querySelectorAll('tr.event-row'));

      function parseDateForAdmin(raw) {
        if (!raw) return Number.NaN;
        let d = new Date(raw);
        if (Number.isNaN(d.getTime())) {
          d = new Date(String(raw).replace(' ', 'T'));
        }
        if (Number.isNaN(d.getTime())) {
          d = new Date(String(raw).replace(' ', 'T') + 'Z');
        }
        const t = d.getTime();
        return Number.isNaN(t) ? Number.NaN : t;
      }

      function applyAdminSort(key, direction) {
        const dir = direction === 'desc' ? -1 : 1;
        const sorted = rows.slice().sort((a, b) => {
          if (key === 'date') {
            const aRaw = a.getAttribute('data-sort-date') || '';
            const bRaw = b.getAttribute('data-sort-date') || '';
            const aTs = parseDateForAdmin(aRaw);
            const bTs = parseDateForAdmin(bRaw);
            if (Number.isNaN(aTs) && Number.isNaN(bTs)) return 0;
            if (Number.isNaN(aTs)) return 1;
            if (Number.isNaN(bTs)) return -1;
            if (aTs === bTs) return 0;
            return aTs < bTs ? -1 * dir : 1 * dir;
          }
          if (key === 'name') {
            const aName = (a.getAttribute('data-sort-name') || '').toLowerCase();
            const bName = (b.getAttribute('data-sort-name') || '').toLowerCase();
            return aName.localeCompare(bName) * dir;
          }
          if (key === 'status') {
            const aStatus = (a.getAttribute('data-sort-status') || '').toLowerCase();
            const bStatus = (b.getAttribute('data-sort-status') || '').toLowerCase();
            if (aStatus === bStatus) return 0;
            return aStatus < bStatus ? -1 * dir : 1 * dir;
          }
          return 0;
        });

        sorted.forEach(tr => tbody.appendChild(tr));
      }

      // Default: newest (latest start) first
      applyAdminSort('date', 'desc');

      const headers = eventsTable.querySelectorAll('thead th[data-sort-key]');
      headers.forEach(th => {
        const key = th.getAttribute('data-sort-key');
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
          const current = th.getAttribute('data-sort-dir') || 'desc';
          const next = current === 'asc' ? 'desc' : 'asc';
          headers.forEach(h => h.removeAttribute('aria-sort'));
          th.setAttribute('data-sort-dir', next);
          th.setAttribute('aria-sort', next === 'asc' ? 'ascending' : 'descending');
          applyAdminSort(key, next);
        });
      });

      // Allow clicking anywhere on the row to manage the event (except action controls)
      rows.forEach(row => {
        const targetUrl = row.getAttribute('data-event-url');
        if (!targetUrl) return;
        row.addEventListener('click', (event) => {
          const blocker = event.target.closest('a, button, summary, input, select, textarea, details');
          if (blocker) return;
          window.location.href = targetUrl;
        });
        row.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            const blocker = event.target.closest('a, button, summary, input, select, textarea, details');
            if (blocker) return;
            event.preventDefault();
            window.location.href = targetUrl;
          }
        });
        row.setAttribute('tabindex', '0');
        row.setAttribute('role', 'link');
        const eventName = row.getAttribute('data-event-name') || row.getAttribute('data-sort-name') || 'event';
        row.setAttribute('aria-label', 'Manage event ' + eventName);
      });
    }
  } catch (err) {
    console.error('[AdminDashboard] Failed to initialize table sorting:', err);
  }

  // Generic dropdowns (details.dropdown) — stable + floating portal for dashboard
  try {

    const portalMap = new WeakMap(); // details -> { menu, placeholder }

    function openPortal(details) {
      if (!details.classList.contains('dropdown--float')) return;
      const summary = details.querySelector('summary');
      const menu = details.querySelector('.dropdown__menu');
      if (!summary || !menu) return;
      if (portalMap.has(details)) return; // already portaled
      const placeholder = document.createElement('span');
      placeholder.style.display = 'none';
      menu.parentNode.insertBefore(placeholder, menu);
      document.body.appendChild(menu);
      menu.classList.add('is-portal');
      // Measure and position
      const rect = summary.getBoundingClientRect();
      const menuWidth = 240;
      const prevDisp = menu.style.display, prevVis = menu.style.visibility;
      if (getComputedStyle(menu).display === 'none') { menu.style.visibility = 'hidden'; menu.style.display = 'block'; }
      const menuHeight = Math.max(menu.offsetHeight || 0, 120);
      menu.style.display = prevDisp; menu.style.visibility = prevVis;
      let left = rect.right - menuWidth;
      let top = rect.bottom + 6;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < menuHeight + 12) top = rect.top - menuHeight - 6;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      top = Math.max(8, Math.min(top, window.innerHeight - 8));
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
      menu.style.right = 'auto';
      portalMap.set(details, { menu, placeholder });
    }

    function closePortal(details) {
      const data = portalMap.get(details);
      if (!data) return;
      const { menu, placeholder } = data;
      menu.classList.remove('is-portal');
      menu.style.left = '';
      menu.style.top = '';
      menu.style.right = '';
      if (placeholder.parentNode) placeholder.parentNode.insertBefore(menu, placeholder);
      placeholder.remove();
      portalMap.delete(details);
    }

    // Close on outside click (consider portaled menus)
    document.addEventListener('click', (e) => {
      document.querySelectorAll('details.dropdown[open]').forEach(d => {
        const data = portalMap.get(d);
        const menu = data && data.menu;
        if (d.contains(e.target)) return;
        if (menu && menu.contains(e.target)) return;
        d.removeAttribute('open');
      });
    });

    // Close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('details.dropdown[open]').forEach(d => d.removeAttribute('open'));
    });

    // Toggle handler to portal/unportal floating menus
    document.addEventListener('toggle', (e) => {
      const el = e.target;
      if (!(el && el.matches && el.matches('details.dropdown'))) return;
      if (el.open) {
        openPortal(el);
      } else {
        closePortal(el);
      }
    }, true);

    // Reposition on scroll/resize
    const repro = () => document.querySelectorAll('details.dropdown.dropdown--float[open]').forEach(d => { closePortal(d); openPortal(d); });
    window.addEventListener('resize', repro);
    window.addEventListener('scroll', repro, true);

  } catch (err) {
    console.error('[Dropdowns] Failed to wire outside/esc close:', err);
  }

  // ================================
  // Public Volunteer Multi-Select UI
  // ================================
  try {
    const timeBlockItems = Array.from(document.querySelectorAll('.time-block-item'));
    const signupFormContainer = document.getElementById('signup-form');
    const signupForm = document.getElementById('signupFormTag');
    const selectedSlotsContainer = document.getElementById('selected-slots-container');
    const selectedPanel = document.getElementById('selected-slots-panel');
    const isPotluck = signupForm && signupForm.getAttribute('data-is-potluck') === 'true';
    const isManageMode = signupForm && signupForm.getAttribute('data-mode') === 'manage';
    const viewModeSelect = document.getElementById('slot-view-mode');
    const stationView = document.getElementById('slots-by-station');
    const timeView = document.getElementById('slots-by-time');
    const timeViewList = document.getElementById('slots-by-time-list');
    const selectionFab = document.getElementById('selection-fab');
    const selectionFabButton = selectionFab ? selectionFab.querySelector('button') : null;
    const partySizeInput = document.getElementById('party-size');
    const participantListEl = document.getElementById('participant-list');
    const manageDataEl = document.getElementById('manage-data');
    const registrantRadioEls = Array.from(document.querySelectorAll('input[name="registrant_participating"]'));
    const registrationPayloadInput = document.getElementById('registration-payload');
    const step1ContinueBtn = document.getElementById('step1-continue');
    const selectionStep = document.getElementById('selection-step');
    const reviewStep = document.getElementById('review-step');
    const step1ErrorBox = document.getElementById('step1-errors');
    let initialPayload = {};
    let lastSelectedParticipantKey = null;
    try {
      initialPayload = registrationPayloadInput && registrationPayloadInput.value
        ? JSON.parse(registrationPayloadInput.value)
        : {};
    } catch (err) {
      initialPayload = {};
    }
    let step1Complete = false;
    if (isManageMode) {
      step1Complete = true;
    } else if (initialPayload && (Array.isArray(initialPayload.participants) ? initialPayload.participants.length > 0 : false)) {
      step1Complete = true;
    }

    const DEBUG = false;
    if (!timeBlockItems.length || !signupFormContainer || !signupForm) {
      if (DEBUG) console.debug('[VolunteerUI] No volunteer UI elements detected on this page.');
      return;
    }

    // --- Participant state ---
    let participants = [];
    const originalPlacement = new Map(); // blockId -> { parent, placeholder }
    const slotAssignments = []; // { slotId, participantKey, participantName, blockId, stationName, startRaw, endRaw, start, end, itemTitle, dishName }
    const allowInlineToasts = !isManageMode;

    function participantKeyFromIndex(idx) { return `idx:${idx}`; }
    function participantKeyFromId(id) { return `id:${id}`; }

    let toastHost = null;
    const showToast = (message, variant) => {
      if (!message) return;
      if (!toastHost) {
        toastHost = document.getElementById('toast-root');
        if (!toastHost) {
          toastHost = document.createElement('div');
          toastHost.id = 'toast-root';
          toastHost.setAttribute('aria-live', 'polite');
          toastHost.setAttribute('aria-atomic', 'true');
          toastHost.style.position = 'fixed';
          toastHost.style.inset = 'auto 0 16px 0';
          toastHost.style.display = 'flex';
          toastHost.style.justifyContent = 'center';
          toastHost.style.pointerEvents = 'none';
          toastHost.style.zIndex = '2000';
          toastHost.style.padding = '0 12px';
          document.body.appendChild(toastHost);
        }
      }
      const el = document.createElement('div');
      const variantClass = variant === 'danger' ? 'toast--danger' : 'toast--success';
      el.className = `toast ${variantClass}`;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.innerHTML = `
        <svg class="toast__icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 14.414-4.207-4.207 1.414-1.414L11 13.586l4.793-4.793 1.414 1.414L11 16.414Z"/></svg>
        <span>${message}</span>
        <button type="button" class="toast__close" aria-label="Close">×</button>`;
      toastHost.appendChild(el);
      const remove = () => { try { el.remove(); } catch (_) {} };
      const close = el.querySelector('.toast__close');
      if (close) close.addEventListener('click', remove);
      setTimeout(remove, 3600);
    };

    function parseParticipantsDataset(raw) {
      if (!raw) return [];
      try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr.map(p => ({ id: p.participant_id || p.id, name: String(p.participant_name || p.name || p).trim() })).filter(p => p.name);
      } catch (_) {
        return [];
      }
    }

    function initParticipants() {
      if (isManageMode) {
        const data = manageDataEl ? parseParticipantsDataset(manageDataEl.getAttribute('data-participants')) : [];
        return data.length ? data : [];
      }
      // Signup page
      const payloadParticipants = Array.isArray(initialPayload.participants)
        ? initialPayload.participants.map(p => ({ name: String((p && (p.name || p.participant_name)) || p || '').trim() })).filter(p => p.name || String(p.name) === '')
        : [];
      const preload = participantListEl ? parseParticipantsDataset(participantListEl.getAttribute('data-participants')) : [];
      const registrantNameInput = document.getElementById('signup-name');
      const registrantName = registrantNameInput ? String(registrantNameInput.value || '').trim() : '';
      const registrantParticipating = registrantRadioEls.some(r => r.checked && r.value === 'yes');
      let count = Number(partySizeInput && partySizeInput.value);
      if (!Number.isFinite(count) || count < 1) count = payloadParticipants.length || preload.length || 1;
      if (payloadParticipants.length > count) count = payloadParticipants.length;
      if (partySizeInput && Number(partySizeInput.value) !== count) {
        partySizeInput.value = count;
      }
      const base = payloadParticipants.length ? payloadParticipants.slice(0, count) : (preload.length ? preload.slice(0, count) : []);
      while (base.length < count) base.push({ name: '' });
      if (registrantParticipating) {
        if (!base.length) base.push({ name: registrantName || 'You' });
        else base[0].name = registrantName || 'You';
      } else if (!registrantParticipating && base.length) {
        const defaultNames = ['you', 'yourself', 'registrant'];
        const first = String(base[0].name || '').trim();
        if (!first || defaultNames.includes(first.toLowerCase()) || (registrantName && first.toLowerCase() === registrantName.toLowerCase())) {
          base[0].name = '';
        }
      }
      return base;
    }

    participants = initParticipants();

    function isInViewport(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const vw = window.innerWidth || document.documentElement.clientWidth;
      return r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0;
    }

    function updateSelectionFabVisibility() {
      if (!selectionFab) return;
      const hasSelections = slotAssignments.length > 0;
      const shouldEnable = isManageMode || (step1Complete && hasSelections);
      if (!shouldEnable) {
        try {
          if (selectionFab.contains(document.activeElement) && document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
        } catch (_) {}
        selectionFab.classList.remove('is-visible');
        selectionFab.hidden = true;
        selectionFab.setAttribute('aria-hidden', 'true');
        return;
      }

      let shouldShow = false;
      if (isPotluck) {
        const firstDish = document.querySelector('#selected-slots-container input[id^="dish-note-"]');
        if (firstDish) {
          shouldShow = !isInViewport(firstDish);
        } else if (signupFormContainer) {
          const rect = signupFormContainer.getBoundingClientRect();
          const formVisible = rect.top < window.innerHeight && rect.bottom > 0;
          shouldShow = !formVisible;
        }
      } else if (signupFormContainer) {
        const rect = signupFormContainer.getBoundingClientRect();
        const formVisible = rect.top < window.innerHeight && rect.bottom > 0; // any portion visible
        shouldShow = !formVisible;
      }

      if (shouldShow) {
        selectionFab.hidden = false;
        selectionFab.classList.add('is-visible');
        selectionFab.removeAttribute('aria-hidden');
      } else {
        try {
          if (selectionFab.contains(document.activeElement) && document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
          }
        } catch (_) {}
        selectionFab.classList.remove('is-visible');
        selectionFab.hidden = true;
        selectionFab.setAttribute('aria-hidden', 'true');
      }
    }

    if (selectionFabButton) {
      selectionFabButton.addEventListener('click', (event) => {
        event.preventDefault();

        if (isPotluck) {
          const firstDish = document.querySelector('#selected-slots-container input[id^="dish-note-"]');
          let scrollTarget = firstDish;
          if (firstDish) {
            const card = firstDish.closest('.selected-slot') ||
              firstDish.closest('.card') ||
              firstDish.closest('.signup-panel');
            if (card) scrollTarget = card;
          } else {
            const step2Heading = document.getElementById('step2Heading');
            scrollTarget = selectedPanel || step2Heading || signupFormContainer;
          }

          if (!scrollTarget) return;

          try {
            scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (err) {
            scrollTarget.scrollIntoView();
          }

          setTimeout(() => {
            if (!firstDish || typeof firstDish.focus !== 'function') return;
            try {
              firstDish.focus();
            } catch (_) {
              firstDish.focus();
            }
          }, 420);
        } else {
          const step2Heading = document.getElementById('step2Heading');
          const scrollTarget = step2Heading || selectedPanel || signupFormContainer;

          if (!scrollTarget) return;

          try {
            scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } catch (err) {
            scrollTarget.scrollIntoView();
          }
        }
      });
    }
  if (selectionFab) {
    selectionFab.setAttribute('aria-hidden', 'true');
    const onScroll = () => updateSelectionFabVisibility();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    updateSelectionFabVisibility();
  }

  // Manage page: confirm participant delete and optionally remove assignments
  if (isManageMode) {
    const assignmentsMetaEl = manageDataEl;
    let participantAssignments = new Map();
    try {
      const data = assignmentsMetaEl ? JSON.parse(assignmentsMetaEl.getAttribute('data-assignments') || '{}') : {};
      participantAssignments = new Map(
        (data.participants || []).map(p => ({
          id: Number(p.participant_id),
          name: p.participant_name,
          sched: Array.isArray(p.schedule) ? p.schedule : [],
          pot: Array.isArray(p.potluck) ? p.potluck : []
        })).map(p => [p.id, p])
      );
    } catch (_) {}

    document.querySelectorAll('.manage-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const form = btn.closest('form');
        if (!form) return;
        const pid = Number(btn.getAttribute('data-participant-id'));
        const pName = btn.getAttribute('data-participant-name') || 'this participant';
        const counts = participantAssignments.get(pid) || { sched: [], pot: [], name: pName };
        // Include any pending (unsaved) assignments in the UI
        const pendingSched = isPotluck ? [] : slotAssignments.filter(a => a.participantKey === participantKeyFromId(pid));
        const pendingPot = isPotluck ? slotAssignments.filter(a => a.participantKey === participantKeyFromId(pid)) : [];
        const schedTotal = (counts.sched ? counts.sched.length : 0) + pendingSched.length;
        const potTotal = (counts.pot ? counts.pot.length : 0) + pendingPot.length;
        const total = schedTotal + potTotal;
        function labelForSchedule(item) {
          const station = item.station_name || item.station || '';
          const start = item.start_label || item.start_time || '';
          const end = item.end_label || item.end_time || '';
          const time = start && end ? `${start} – ${end}` : (start || end);
          return [station, time].filter(Boolean).join(' — ') || station || time || 'Slot';
        }
        function labelForPot(item) {
          const station = item.station_name || item.station || '';
          const title = item.item_title || item.title || '';
          return [station, title].filter(Boolean).join(' — ') || station || title || 'Item';
        }
        const pendingLabels = pendingSched.map(a => getSlotLabel(a)).concat(pendingPot.map(a => getSlotLabel(a)));
        const savedLabels = [
          ...(counts.sched || []).map(labelForSchedule),
          ...(counts.pot || []).map(labelForPot)
        ].filter(Boolean);
        const labels = [...savedLabels, ...pendingLabels];

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.setAttribute('aria-hidden', 'false');
        modal.innerHTML = `
          <div class="modal-content">
            <div class="modal-header">
              <h3>Delete ${pName}</h3>
              <button type="button" class="close-btn" data-modal-cancel aria-label="Close">&times;</button>
            </div>
            <div class="modal-body">
              ${total === 0 ? '<p>This participant has no assignments.</p>' : `<p>This will remove ${total} assignment${total === 1 ? '' : 's'} (including unsaved changes).</p>`}
              ${schedTotal > 0 ? `<p class="muted">Schedule: ${schedTotal} slot${schedTotal === 1 ? '' : 's'}</p>` : ''}
              ${potTotal > 0 ? `<p class="muted">Items: ${potTotal} item${potTotal === 1 ? '' : 's'}</p>` : ''}
              ${labels.length ? `<ul class="modal-list">${labels.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-ghost" data-modal-cancel>Cancel</button>
              <button type="button" class="btn btn-danger" data-modal-confirm>Delete</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const closeModal = () => { try { modal.remove(); } catch (_) {} };
        modal.querySelectorAll('[data-modal-cancel]').forEach(el => el.addEventListener('click', closeModal));
        modal.addEventListener('click', (evt) => {
          if (evt.target === modal) closeModal();
        });
        modal.querySelector('[data-modal-confirm]')?.addEventListener('click', () => {
          // Drop any pending assignments for this participant before submit
          for (let i = slotAssignments.length - 1; i >= 0; i -= 1) {
            if (slotAssignments[i].participantKey === participantKeyFromId(pid)) {
              slotAssignments.splice(i, 1);
            }
          }
          updateConflictingSlots();
          updateCapacityStates();
          renderSelectedList();
          rebuildPayload();
          let input = form.querySelector('input[name="removeAssignments"]');
          if (!input) {
            input = document.createElement('input');
            input.type = 'hidden';
            input.name = 'removeAssignments';
            form.appendChild(input);
          }
          input.value = '1';
          closeModal();
          form.submit();
        });
      });
    });
  }

    timeBlockItems.forEach(item => {
      if (typeof item.dataset.originalTabindex === 'undefined') {
        const existingTabIndex = item.getAttribute('tabindex');
        item.dataset.originalTabindex = existingTabIndex !== null ? existingTabIndex : '0';
      }
    });

    function computeTimestamp(raw) {
      if (!raw) return Number.NaN;
      let date = new Date(raw);
      if (Number.isNaN(date.getTime())) {
        date = new Date(raw.replace(' ', 'T'));
      }
      if (Number.isNaN(date.getTime())) {
        date = new Date(raw.replace(' ', 'T') + 'Z');
      }
      const time = date.getTime();
      return Number.isNaN(time) ? Number.NaN : time;
    }

    function getSlotMeta(item) {
      const id = item.getAttribute('data-block-id') || '';
      const stationId = item.getAttribute('data-station-id') || '';
      const stationName = item.getAttribute('data-station-name') || '';
      const startRaw = item.getAttribute('data-start-time');
      const endRaw = item.getAttribute('data-end-time');
      const itemTitle = item.getAttribute('data-item-title') || '';
      const capacity = Number(item.getAttribute('data-capacity'));
      const reserved = Number(item.getAttribute('data-reserved') || '0');
      if (typeof item.dataset.startTs === 'undefined') {
        item.dataset.startTs = String(computeTimestamp(startRaw));
      }
      if (typeof item.dataset.endTs === 'undefined') {
        item.dataset.endTs = String(computeTimestamp(endRaw));
      }
      const infoDiv = item.querySelector('.time-block-item__info');
      let startLabel = '';
      let endLabel = '';
      if (infoDiv) {
        const strongs = infoDiv.querySelectorAll('strong');
        if (strongs.length > 0) {
          startLabel = (strongs[0].textContent || '').trim();
        }
        if (strongs.length > 1) {
          endLabel = (strongs[1].textContent || '').trim();
        }
      }
      return {
        id,
        stationId,
        stationName,
        itemTitle,
        start: Number(item.dataset.startTs),
        end: Number(item.dataset.endTs),
        startLabel,
        endLabel,
        startRaw,
        endRaw,
        capacity: Number.isFinite(capacity) ? capacity : null,
        reserved: Number.isFinite(reserved) ? reserved : 0
      };
    }

    function getDisplayTextFromItem(item) {
      const infoDiv = item.querySelector('div');
      if (!infoDiv) return '(unknown time)';
      const text = infoDiv.textContent || infoDiv.innerText || '';
      const lower = text.toLowerCase();
      const marker = '• capacity needed';
      const idx = lower.indexOf(marker);
      let clean = idx >= 0 ? text.slice(0, idx).trim() : text.trim();
      const stationName = item.getAttribute('data-station-name');
      if (stationName) {
        const label = `Station: ${stationName}`;
        if (clean.startsWith(label)) {
          clean = clean.slice(label.length).trim();
        } else {
          clean = clean.replace(/^Station:\s*[^–]+/i, '').trim();
        }
        return `${stationName} — ${clean}`;
      }
      return clean;
    }

    function splitDateAndTime(label) {
      if (!label) {
        return { date: '', time: '' };
      }
      const trimmed = label.trim();
      if (!trimmed) {
        return { date: '', time: '' };
      }
      const commaParts = trimmed.split(',');
      if (commaParts.length >= 3) {
        return {
          date: `${commaParts[0].trim()}, ${commaParts[1].trim()}`,
          time: commaParts.slice(2).join(',').trim()
        };
      }
      if (commaParts.length === 2) {
        const [first, second] = commaParts;
        const maybeTime = second.trim();
        if (maybeTime) {
          return { date: first.trim(), time: maybeTime };
        }
      }
      const spaceParts = trimmed.split(/\s+/);
      if (spaceParts.length >= 2) {
        return {
          date: spaceParts.slice(0, spaceParts.length - 1).join(' '),
          time: spaceParts[spaceParts.length - 1]
        };
      }
      return { date: trimmed, time: '' };
    }

    function formatSelectedSlotTime(slot) {
      const { startLabel = '', endLabel = '' } = slot || {};
      const fallback = slot && slot.displayText ? slot.displayText : '';
      if (!startLabel && !endLabel) {
        return fallback;
      }
      const startParts = splitDateAndTime(startLabel);
      const endParts = splitDateAndTime(endLabel);
      const hasStart = Boolean(startLabel);
      const hasEnd = Boolean(endLabel);
      const sameDay = startParts.date && endParts.date && startParts.date === endParts.date;

      if (sameDay) {
        if (startParts.time && endParts.time) {
          return `${startParts.date} • ${startParts.time} – ${endParts.time}`;
        }
        return endParts.time
          ? `${startParts.date} • ${endParts.time}`
          : startLabel;
      }

      if (hasStart && hasEnd) {
        return `${startLabel} → ${endLabel}`;
      }

      return hasStart ? startLabel : endLabel;
    }

    function slotsOverlap(a, b) {
      if (!a || !b) return false;
      if (!Number.isFinite(a.start) || !Number.isFinite(a.end) || !Number.isFinite(b.start) || !Number.isFinite(b.end)) {
        return false;
      }
      return a.start < b.end && b.start < a.end;
    }

    function getParticipantNameByKey(key) {
      if (!key) return '';
      if (key.startsWith('id:')) {
        const id = Number(key.slice(3));
        const found = participants.find(p => Number(p.id) === id);
        return found ? found.name : '';
      }
      if (key.startsWith('idx:')) {
        const idx = Number(key.slice(4));
        const found = participants[idx];
        return found ? found.name : '';
      }
      return '';
    }

    function markConflictState(item, conflicts, hasAnySelectionForBlock, canAssign, selectedHasConflict, assignedForSelected, isSingleParticipant) {
      const button = item.querySelector('.select-slot-btn');
      const note = item.querySelector('[data-role="conflict-note"]');
      const hint = item.querySelector('[data-role="assign-hint"] .assign-hint-text');
      const baseIsFull = item.getAttribute('data-is-full') === 'true' || item.classList.contains('is-full');
      const allowAssignment = canAssign !== false && (!baseIsFull || assignedForSelected);

      if (hasAnySelectionForBlock) {
        item.classList.add('selected');
        item.setAttribute('aria-pressed', 'true');
      } else {
        item.classList.remove('selected');
        item.setAttribute('aria-pressed', 'false');
      }

      const shouldDisable = (conflicts.length && !allowAssignment) || (!!selectedHasConflict && !allowAssignment);
      if (shouldDisable) {
        item.classList.add('disabled-overlap');
        item.setAttribute('aria-disabled', 'true');
        item.setAttribute('tabindex', '-1');
        if (button) {
          button.disabled = true;
          button.textContent = 'Conflict';
        }
      } else {
        item.classList.remove('disabled-overlap');
        if (allowAssignment) {
          item.setAttribute('aria-disabled', 'false');
          const originalTab = item.dataset.originalTabindex || '0';
          item.setAttribute('tabindex', originalTab);
          if (button) {
            const disableBtn = selectedHasConflict && !assignedForSelected;
            button.disabled = disableBtn;
            if (assignedForSelected) {
              button.textContent = 'Unassign';
            } else {
              button.textContent = hasAnySelectionForBlock && !isSingleParticipant ? 'Assign another' : 'Assign';
            }
            if (assignedForSelected) button.classList.add('is-selected-assigned');
            else button.classList.remove('is-selected-assigned');
          }
        }
      }
      if (note) {
        if (conflicts.length) {
          note.textContent = conflicts.length === 1 ? conflicts[0] : 'This participant conflicts. Choose another participant.';
          note.hidden = false;
        } else {
          note.textContent = '';
          note.hidden = true;
        }
      }
      if (hint) {
        if (isSingleParticipant) {
          hint.textContent = 'Click “Assign” to add this selection.';
        } else {
          hint.textContent = 'Pick a participant, then click “Assign” to add this selection.';
        }
      }
    }

    function participantHasConflict(participantKey, meta) {
      if (!participantKey) return false;
      if (!meta) return false;
      const relevant = slotAssignments.filter(a => a.participantKey === participantKey && a.blockId !== Number(meta.id));
      return relevant.some(other => slotsOverlap(meta, other));
    }

    function getAssignedCount(blockId) {
      return slotAssignments.filter(a => a.blockId === Number(blockId)).length;
    }

    function isBlockAtCapacity(meta) {
      if (!meta || !Number.isFinite(meta.capacity) || meta.capacity <= 0) return false;
      const assigned = getAssignedCount(meta.id);
      return (meta.reserved || 0) + assigned >= meta.capacity;
    }

    function getSlotLabel(meta) {
      if (!meta) return 'Selection';
      if (meta.stationName && meta.startLabel) return `${meta.stationName} — ${meta.startLabel}`;
      if (meta.stationName && meta.itemTitle) return `${meta.stationName} — ${meta.itemTitle}`;
      return meta.stationName || meta.itemTitle || 'Selection';
    }

    function updateCapacityStates() {
      timeBlockItems.forEach(item => {
        const meta = getSlotMeta(item);
        const button = item.querySelector('.select-slot-btn');
        const picker = item.querySelector('.participant-picker');
        const participantKey = picker ? picker.value : null;
        const assignedForSelected = participantKey
          ? slotAssignments.some(a => a.blockId === Number(meta.id) && a.participantKey === participantKey)
          : false;
        if (!meta || !Number.isFinite(meta.capacity) || meta.capacity <= 0) {
          item.classList.remove('is-full');
          item.removeAttribute('data-is-full');
          if (button) button.disabled = false;
          return;
        }
        const assigned = getAssignedCount(meta.id);
        const remaining = meta.capacity - (meta.reserved || 0) - assigned;
        const full = remaining <= 0;
        const options = picker ? Array.from(picker.options).map(o => o.value).filter(Boolean) : [];
        const isSingleParticipant = options.length === 1;
        if (full) {
          item.classList.add('is-full');
          item.setAttribute('data-is-full', 'true');
          item.setAttribute('aria-disabled', 'true');
          item.setAttribute('tabindex', '-1');
          if (button) {
            button.disabled = !assignedForSelected;
            button.textContent = assignedForSelected ? 'Unassign' : 'Full';
            if (assignedForSelected) button.classList.add('is-selected-assigned');
            else button.classList.remove('is-selected-assigned');
          }
        } else {
          item.classList.remove('is-full');
          item.setAttribute('data-is-full', 'false');
          const originalTab = item.dataset.originalTabindex || '0';
          item.setAttribute('aria-disabled', 'false');
          item.setAttribute('tabindex', originalTab);
          if (button) {
            button.disabled = false;
            if (assignedForSelected) {
              button.textContent = 'Unassign';
              button.classList.add('is-selected-assigned');
            } else {
              button.textContent = item.classList.contains('selected') ? 'Assign another' : 'Assign';
              button.classList.remove('is-selected-assigned');
            }
          }
        }
      });
    }

    function updateConflictingSlots() {
      timeBlockItems.forEach(item => {
        const meta = getSlotMeta(item);
        const picker = item.querySelector('.participant-picker');
        const participantKey = picker ? picker.value : null;
        const conflicts = [];
        const hasSelection = slotAssignments.some(s => s.blockId === Number(meta.id));
        let canAssign = true;
        const options = picker ? Array.from(picker.options).map(o => o.value).filter(Boolean) : [];
        const isSingleParticipant = options.length === 1;
        const selectedConflict = participantKey ? participantHasConflict(participantKey, meta) : false;
        const assignedForSelected = participantKey
          ? slotAssignments.some(a => a.blockId === Number(meta.id) && a.participantKey === participantKey)
          : false;
        if (participantKey && selectedConflict) {
          const name = getParticipantNameByKey(participantKey) || 'Participant';
          conflicts.push(`${name} has an overlapping time. Choose another participant.`);
        }
        if (options.length) {
          const hasAvailable = options.some(key => !participantHasConflict(key, meta));
          canAssign = hasAvailable;
        }
        if (isBlockAtCapacity(meta) && !assignedForSelected) {
          canAssign = false;
        }
        markConflictState(item, conflicts, hasSelection, canAssign, selectedConflict, assignedForSelected, isSingleParticipant);
      });
    }

    function getVisibleItems() {
      if (timeView && !timeView.hasAttribute('hidden')) {
        return Array.from(timeView.querySelectorAll('.time-block-item'));
      }
      if (stationView) {
        return Array.from(stationView.querySelectorAll('.time-block-item'));
      }
      return [];
    }

    function compareAssignments(a, b) {
      const startA = Number.isFinite(a.start) ? a.start : Number.POSITIVE_INFINITY;
      const startB = Number.isFinite(b.start) ? b.start : Number.POSITIVE_INFINITY;
      if (startA !== startB) return startA - startB;
      const endA = Number.isFinite(a.end) ? a.end : Number.POSITIVE_INFINITY;
      const endB = Number.isFinite(b.end) ? b.end : Number.POSITIVE_INFINITY;
      if (endA !== endB) return endA - endB;
      const stationA = (a.stationName || '').toLowerCase();
      const stationB = (b.stationName || '').toLowerCase();
      if (stationA !== stationB) return stationA.localeCompare(stationB);
      const partA = (a.participantName || '').toLowerCase();
      const partB = (b.participantName || '').toLowerCase();
      if (partA !== partB) return partA.localeCompare(partB);
      const textA = (a.displayText || '').toLowerCase();
      const textB = (b.displayText || '').toLowerCase();
      return textA.localeCompare(textB);
    }

    function rebuildParticipantPickers() {
      const options = participants.map((p, idx) => ({
        value: isManageMode ? participantKeyFromId(p.id) : participantKeyFromIndex(idx),
        label: p.name || `Participant ${idx + 1}`
      }));
      document.querySelectorAll('.participant-picker').forEach(sel => {
      const isSingle = options.length === 1;
      const blockId = Number(sel.closest('.time-block-item')?.getAttribute('data-block-id'));
      const assigned = Number.isFinite(blockId)
        ? slotAssignments.find(a => a.blockId === blockId)
        : null;
        if (!isSingle && !assigned) {
          sel.dataset.userSet = '';
        } else if (!isSingle) {
          sel.dataset.userSet = sel.dataset.userSet === '1' ? '1' : '';
        }
        const hasUserChoice = sel.dataset.userSet === '1';
        const current = hasUserChoice ? sel.value : (assigned ? assigned.participantKey : '');
        sel.innerHTML = '';
        if (!isSingle) {
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = 'Choose participant…';
          placeholder.disabled = true;
          placeholder.selected = current === '' || current == null;
          sel.appendChild(placeholder);
        }
        options.forEach(opt => {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          sel.appendChild(o);
        });
        const stillValid = options.some(opt => opt.value === current);
        const targetVal = stillValid
          ? current
          : (isSingle ? options[0]?.value : '');
        sel.value = targetVal;
        sel.disabled = isSingle;
        const label = sel.closest('.participant-picker-wrap')?.querySelector('.participant-picker-label');
        if (label) {
          label.style.display = isSingle ? 'none' : '';
        }
        const button = sel.closest('.time-block-item')?.querySelector('.select-slot-btn');
        if (button && isSingle) {
          button.textContent = button.classList.contains('selected') ? 'Unassign' : 'Select';
        }
        if (!isSingle && (sel.value === '' || sel.value == null)) {
          sel.selectedIndex = 0;
          sel.dataset.userSet = '';
        } else if (sel.value) {
          sel.dataset.userSet = '1';
        }
      });
    }

    function getParticipantOptions() {
      return participants.map((p, idx) => ({
        key: isManageMode ? participantKeyFromId(p.id) : participantKeyFromIndex(idx),
        name: p.name || `Participant ${idx + 1}`
      }));
    }

    function ensureParticipantInputs() {
      if (isManageMode || !participantListEl) return;
      let count = Number(partySizeInput && partySizeInput.value);
      if (!Number.isFinite(count) || count < 1) count = 1;
      while (participants.length < count) participants.push({ name: '' });
      if (participants.length > count) participants = participants.slice(0, count);

      const registrantParticipating = registrantRadioEls.some(r => r.checked && r.value === 'yes');
      const registrantNameInput = document.getElementById('signup-name');
      const registrantName = registrantNameInput ? String(registrantNameInput.value || '').trim() : '';
      if (registrantParticipating) {
        if (!participants.length) participants.push({ name: registrantName || 'You' });
        else participants[0].name = registrantName || 'You';
      } else if (participants[0] && (participants[0].name === registrantName || participants[0].name === 'You')) {
        participants[0].name = '';
      }
      if (participants.length > 1) {
        lastSelectedParticipantKey = null;
      }

      // Drop assignments for participants that no longer exist (e.g., after lowering count)
      const validKeys = new Set(getParticipantOptions().map(opt => opt.key));
      for (let i = slotAssignments.length - 1; i >= 0; i -= 1) {
        if (!validKeys.has(slotAssignments[i].participantKey)) {
          slotAssignments.splice(i, 1);
        }
      }

      participantListEl.innerHTML = '';
      const list = document.createElement('div');
      list.className = 'participant-inputs';
      participants.forEach((p, idx) => {
        const wrap = document.createElement('div');
        wrap.className = 'form-group';
        const label = document.createElement('label');
        label.textContent = `Participant ${idx + 1}`;
        label.setAttribute('for', `participant-${idx}`);
        const input = document.createElement('input');
        input.id = `participant-${idx}`;
        input.type = 'text';
        input.value = p.name || '';
        input.placeholder = 'Full name';
        input.addEventListener('input', () => {
          participants[idx].name = input.value;
          input.classList.remove('input-error');
          input.removeAttribute('aria-invalid');
          if (!isManageMode) {
            step1Complete = false;
            updateStepVisibility();
            updateSignupFormVisibility();
          }
          rebuildParticipantPickers();
          renderSelectedList();
          rebuildPayload();
        });
        wrap.appendChild(label);
        wrap.appendChild(input);
        list.appendChild(wrap);
      });
      participantListEl.appendChild(list);
      rebuildParticipantPickers();
      renderSelectedList();
      rebuildPayload();
      updateConflictingSlots();
      updateSelectionFabVisibility();
    }

    function addAssignment(meta, participantKey, dishName) {
      if (!meta || !participantKey) return;
      const blockId = Number(meta.id);
      const participantName = getParticipantNameByKey(participantKey);
      const existing = slotAssignments.find(a => a.blockId === blockId && a.participantKey === participantKey);
      if (existing) return;
      if (isBlockAtCapacity(meta)) {
        const item = timeBlockItems.find(el => el.getAttribute('data-block-id') === String(meta.id));
        const note = item ? item.querySelector('[data-role="conflict-note"]') : null;
        if (note) {
          note.textContent = 'This slot is already full.';
          note.hidden = false;
        }
        return;
      }
      slotAssignments.push({
        slotId: `${blockId}:${participantKey}`,
        blockId,
        participantKey,
        participantName,
        stationName: meta.stationName,
        startRaw: meta.startRaw,
        endRaw: meta.endRaw,
        start: meta.start,
        end: meta.end,
        startLabel: meta.startLabel,
        endLabel: meta.endLabel,
        displayText: getDisplayTextFromItem(document.querySelector(`.time-block-item[data-block-id="${meta.id}"]`)),
        itemTitle: meta.itemTitle,
        dishName: dishName || ''
      });
      lastSelectedParticipantKey = participantKey;
      slotAssignments.sort(compareAssignments);
      updateConflictingSlots();
      updateCapacityStates();
      renderSelectedList();
      rebuildPayload();
      updateSignupFormVisibility();
      updateSelectionFabVisibility();
      if (allowInlineToasts) {
        showToast(`${participantName || 'Participant'} assigned to ${getSlotLabel(meta)}.`);
      }
    }

    function removeAssignment(slotId, participantKey) {
      const idx = slotAssignments.findIndex(a => a.slotId === slotId && a.participantKey === participantKey);
      if (idx >= 0) {
        const removed = slotAssignments[idx];
        slotAssignments.splice(idx, 1);
        const blockEl = document.querySelector(`.time-block-item[data-block-id="${removed.blockId}"]`);
        const pickerEl = blockEl ? blockEl.querySelector('.participant-picker') : null;
        if (pickerEl) {
          const multi = pickerEl.options.length > 1;
          if (multi) {
            pickerEl.value = '';
            pickerEl.dataset.userSet = '';
          }
        }
        updateConflictingSlots();
        updateCapacityStates();
        renderSelectedList();
        rebuildPayload();
        updateSignupFormVisibility();
        updateSelectionFabVisibility();
        if (removed && allowInlineToasts) {
          const meta = {
            stationName: removed.stationName,
            startLabel: removed.startLabel,
            endLabel: removed.endLabel,
            itemTitle: removed.itemTitle,
            displayText: removed.displayText
          };
          showToast(`${removed.participantName || 'Participant'} unassigned from ${getSlotLabel(meta)}.`, 'danger');
        }
      }
    }

    function renderSelectedList() {
      renderSaveReview();
      if (!selectedSlotsContainer) return;
      selectedSlotsContainer.innerHTML = '';
      const title = document.createElement('h4');
      title.textContent = isPotluck ? 'Selected Items' : 'Selected Opportunities';
      selectedSlotsContainer.appendChild(title);

      if (!slotAssignments.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No selections yet.';
        selectedSlotsContainer.appendChild(empty);
        return;
      }

      const ul = document.createElement('ul');
      slotAssignments.forEach(assign => {
        const li = document.createElement('li');
        li.className = 'selected-slot';

        const textWrap = document.createElement('div');
        textWrap.className = 'selected-slot__text';

        const personLine = document.createElement('div');
        personLine.className = 'selected-slot__person';
        personLine.textContent = assign.participantName || 'Participant';
        textWrap.appendChild(personLine);

        const stationLine = document.createElement('span');
        stationLine.className = 'selected-slot__station';
        if (isPotluck) {
          stationLine.textContent = `${assign.stationName || 'Category'} — ${assign.itemTitle || 'Item'}`;
        } else {
          stationLine.textContent = assign.stationName || assign.displayText || 'Opportunity';
          const timeLine = document.createElement('span');
          timeLine.className = 'selected-slot__time';
          timeLine.textContent = formatSelectedSlotTime(assign);
          textWrap.appendChild(timeLine);
        }
        textWrap.appendChild(stationLine);
        li.appendChild(textWrap);

        // Participant reassignment
        const picker = document.createElement('select');
        picker.className = 'participant-picker-inline';
        getParticipantOptions().forEach(opt => {
          const o = document.createElement('option');
          o.value = opt.key;
          o.textContent = opt.name;
          picker.appendChild(o);
        });
        picker.value = assign.participantKey;
        picker.addEventListener('change', () => {
          const newKey = picker.value;
          if (!newKey) return;
          // prevent duplicate for same block
          const exists = slotAssignments.find(a => a.blockId === assign.blockId && a.participantKey === newKey);
          if (exists) {
            picker.value = assign.participantKey;
            return;
          }
          if (!isPotluck) {
            const meta = getSlotMeta(document.querySelector(`.time-block-item[data-block-id="${assign.blockId}"]`));
            if (meta && participantHasConflict(newKey, meta)) {
              picker.value = assign.participantKey;
              if (allowInlineToasts) {
                showToast(`${getParticipantNameByKey(newKey) || 'Participant'} has an overlapping time. Choose another participant.`, 'danger');
              }
              return;
            }
          }
          assign.participantKey = newKey;
          assign.participantName = getParticipantNameByKey(newKey);
          assign.slotId = `${assign.blockId}:${newKey}`;
          slotAssignments.sort(compareAssignments);
          rebuildPayload();
          updateConflictingSlots();
          renderSelectedList();
          if (allowInlineToasts) {
            showToast(`${assign.participantName || 'Participant'} assigned to ${getSlotLabel(assign)}.`, 'success');
          }
        });
        li.appendChild(picker);

        if (isPotluck) {
          const noteWrap = document.createElement('div');
          noteWrap.className = 'selected-slot__note';
          const labelEl = document.createElement('label');
          labelEl.textContent = 'Dish name';
          labelEl.className = 'sr-only';
          const input = document.createElement('input');
          input.type = 'text';
          input.placeholder = 'Enter dish name';
          input.value = assign.dishName || '';
          input.setAttribute('data-assignment-id', assign.slotId);
          input.addEventListener('input', () => {
            assign.dishName = input.value;
            input.classList.remove('input-error');
            input.removeAttribute('aria-invalid');
            rebuildPayload();
          });
          noteWrap.appendChild(labelEl);
          noteWrap.appendChild(input);
          li.appendChild(noteWrap);
        }

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'selected-slot-remove';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeAssignment(assign.slotId, assign.participantKey));
        li.appendChild(removeBtn);

        ul.appendChild(li);
      });
      selectedSlotsContainer.appendChild(ul);

      const badge = document.getElementById('selectedCountBadge');
      if (badge) {
        badge.textContent = `(${slotAssignments.length})`;
        badge.style.display = '';
      }

      renderSaveReview();
    }

    function renderSaveReview() {
      const saveReviewEl = document.getElementById('save-review');
      if (!saveReviewEl) return;
      saveReviewEl.innerHTML = '';
      if (!slotAssignments.length) {
        const p = document.createElement('p');
        p.className = 'muted';
        p.textContent = 'No selections yet. Assign a participant to a time block or item above, then save.';
        saveReviewEl.appendChild(p);
        return;
      }

      const heading = document.createElement('strong');
      heading.className = 'save-review__label';
      heading.textContent = 'Review before saving:';
      saveReviewEl.appendChild(heading);

      const list = document.createElement('ul');
      list.className = 'save-review__list';
      slotAssignments.forEach(assign => {
        const li = document.createElement('li');
        li.className = 'save-review__item';
        const topLine = document.createElement('div');
        topLine.className = 'save-review__title';
        topLine.textContent = assign.participantName || 'Participant';
        li.appendChild(topLine);

        const detail = document.createElement('div');
        detail.className = 'save-review__detail';
        if (isPotluck) {
          detail.textContent = `${assign.stationName || 'Item'} — ${assign.itemTitle || ''}${assign.dishName ? ` (${assign.dishName})` : ''}`;
        } else {
          detail.textContent = `${assign.stationName || 'Station'} — ${formatSelectedSlotTime(assign)}`;
        }
        li.appendChild(detail);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'selected-slot-remove save-review__remove';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => removeAssignment(assign.slotId, assign.participantKey));
        li.appendChild(removeBtn);

        list.appendChild(li);
      });
      saveReviewEl.appendChild(list);
    }

    function updateStepVisibility() {
      if (!isManageMode && selectionStep) {
        selectionStep.style.display = step1Complete ? '' : 'none';
      }
      if (!isManageMode && reviewStep) {
        reviewStep.style.display = step1Complete ? '' : 'none';
      }
    }

    function updateSignupFormVisibility() {
      const hasSel = slotAssignments.length > 0;
      const canShow = (isManageMode || step1Complete);
      const show = canShow && (isManageMode || hasSel);
      if (selectedPanel) selectedPanel.style.display = show ? 'block' : 'none';
      if (signupFormContainer) signupFormContainer.style.display = show ? 'block' : 'none';
      const step2 = document.getElementById('step2Heading');
      const step3 = document.getElementById('step3Heading');
      if (step2) step2.style.display = show ? '' : 'none';
      if (step3) step3.style.display = show ? '' : 'none';
    }

    function buildPayload() {
      const eventIdInput = signupForm.querySelector('input[name="eventId"]');
      const eventId = eventIdInput ? eventIdInput.value : '';
      const registrant = {
        name: (document.getElementById('signup-name') || {}).value || '',
        email: (document.getElementById('signup-email') || {}).value || '',
        phone: (document.getElementById('signup-phone') || {}).value || ''
      };
      const payload = { eventId, registrant, participants: [], scheduleAssignments: [], potluckAssignments: [] };
      const participantOptions = getParticipantOptions();
      const partySizeVal = Number(partySizeInput && partySizeInput.value);
      const registrantParticipating = registrantRadioEls.some(r => r.checked && r.value === 'yes');

      if (!isManageMode) {
        payload.partySize = Number.isFinite(partySizeVal) && partySizeVal > 0 ? partySizeVal : participants.length;
        payload.party_size = payload.partySize;
        payload.registrant_participating = registrantParticipating ? 'yes' : 'no';
        payload.participants = participants.map(p => String(p.name || '').trim());
        slotAssignments.forEach(assign => {
          const idx = participantOptions.findIndex(opt => opt.key === assign.participantKey);
          if (idx === -1) return;
          if (isPotluck) {
            payload.potluckAssignments.push({
              itemId: assign.blockId,
              participantIndex: idx,
              dishName: assign.dishName || ''
            });
          } else {
            payload.scheduleAssignments.push({
              blockId: assign.blockId,
              participantIndex: idx
            });
          }
        });
      } else {
        slotAssignments.forEach(assign => {
          const pid = assign.participantKey.startsWith('id:') ? Number(assign.participantKey.slice(3)) : null;
          if (!pid) return;
          if (isPotluck) {
            payload.potluckAssignments.push({
              itemId: assign.blockId,
              participantId: pid,
              dishName: assign.dishName || ''
            });
          } else {
            payload.scheduleAssignments.push({
              blockId: assign.blockId,
              participantId: pid
            });
          }
        });
      }
      return payload;
    }

    function rebuildPayload() {
      const payloadInput = document.getElementById('registration-payload');
      if (!payloadInput) return;
      const payload = buildPayload();
      payloadInput.value = JSON.stringify(payload);
    }

    function hydrateAssignmentsFromPayload() {
      if (isManageMode || !initialPayload || slotAssignments.length) return;
      const participantOptions = getParticipantOptions();

      const schedule = Array.isArray(initialPayload.scheduleAssignments) ? initialPayload.scheduleAssignments : [];
      schedule.forEach(assign => {
        const blockId = Number(assign.blockId || assign.time_block_id || assign);
        const idx = Number(assign.participantIndex);
        const participantKey = Number.isFinite(idx) && participantOptions[idx] ? participantOptions[idx].key : null;
        if (!participantKey || !Number.isFinite(blockId)) return;
        const metaItem = timeBlockItems.find(el => el.getAttribute('data-block-id') === String(blockId));
        if (!metaItem) return;
        const meta = getSlotMeta(metaItem);
        addAssignment(meta, participantKey);
      });

      const potluck = Array.isArray(initialPayload.potluckAssignments) ? initialPayload.potluckAssignments : [];
      potluck.forEach(assign => {
        const blockId = Number(assign.itemId || assign.block_id || assign);
        const idx = Number(assign.participantIndex);
        const participantKey = Number.isFinite(idx) && participantOptions[idx] ? participantOptions[idx].key : null;
        if (!participantKey || !Number.isFinite(blockId)) return;
        const metaItem = timeBlockItems.find(el => el.getAttribute('data-block-id') === String(blockId));
        if (!metaItem) return;
        const meta = getSlotMeta(metaItem);
        addAssignment(meta, participantKey, assign.dishName || assign.dish || '');
      });
    }

    function updateParticipantNamesFromInputs() {
      if (isManageMode) return;
      const inputs = participantListEl ? participantListEl.querySelectorAll('input[id^="participant-"]') : [];
      inputs.forEach((input, idx) => {
        if (participants[idx]) participants[idx].name = input.value;
      });
      slotAssignments.forEach(assign => {
        assign.participantName = getParticipantNameByKey(assign.participantKey);
      });
      rebuildParticipantPickers();
      renderSelectedList();
      rebuildPayload();
      updateConflictingSlots();
      updateSelectionFabVisibility();
    }

    function applyViewMode(mode) {
      if (!stationView || !timeView || !timeViewList) return;
      if (mode === 'time') {
        stationView.setAttribute('hidden', 'hidden');
        timeView.removeAttribute('hidden');
        const sorted = timeBlockItems.slice().sort((a, b) => {
          const aStart = Number(a.dataset.startTs);
          const bStart = Number(b.dataset.startTs);
          if (Number.isNaN(aStart) || Number.isNaN(bStart)) return 0;
          if (aStart === bStart) return 0;
          return aStart < bStart ? -1 : 1;
        });
        sorted.forEach(item => {
          const currentParent = item.parentElement;
          if (currentParent && currentParent !== timeViewList) {
            currentParent.removeChild(item);
          }
          timeViewList.appendChild(item);
        });
      } else {
        timeView.setAttribute('hidden', 'hidden');
        stationView.removeAttribute('hidden');
        timeBlockItems.forEach(item => {
          const id = item.getAttribute('data-block-id');
          if (!id) return;
          const placement = originalPlacement.get(id);
          if (!placement) return;
          const { parent, placeholder } = placement;
          if (parent && placeholder && parent.contains(placeholder)) {
            parent.insertBefore(item, placeholder.nextSibling);
          } else if (parent) {
            parent.appendChild(item);
          }
        });
      }

      updateConflictingSlots();
    }

    timeBlockItems.forEach(item => {
      const id = item.getAttribute('data-block-id');
      const parent = item.parentElement;
      if (!id || !parent || originalPlacement.has(id)) return;
      const placeholder = document.createComment(`slot-placeholder-${id}`);
      parent.insertBefore(placeholder, item);
      const meta = getSlotMeta(item);
      if (!Number.isNaN(meta.start)) item.dataset.startTs = String(meta.start);
      if (!Number.isNaN(meta.end)) item.dataset.endTs = String(meta.end);
      originalPlacement.set(id, { parent, placeholder });
    });

    if (viewModeSelect && stationView && timeView && timeViewList) {
      viewModeSelect.addEventListener('change', () => {
        applyViewMode(viewModeSelect.value === 'time' ? 'time' : 'station');
      });
      applyViewMode(viewModeSelect.value === 'time' ? 'time' : 'station');
    }

    // Bind Select buttons and participant pickers
    timeBlockItems.forEach(item => {
      const button = item.querySelector('.select-slot-btn');
      const isFull = item.getAttribute('data-is-full') === 'true' || item.classList.contains('is-full');
      item.setAttribute('aria-disabled', isFull ? 'true' : 'false');
      item.setAttribute('aria-pressed', item.classList.contains('selected') ? 'true' : 'false');

      if (!item.querySelector('.participant-picker') && !isFull) {
        const options = getParticipantOptions();
        const isSingle = options.length === 1;
        const picker = document.createElement('select');
        picker.className = 'participant-picker';
        const wrap = document.createElement('div');
        wrap.className = 'participant-picker-wrap';
        const label = document.createElement('span');
        label.className = 'participant-picker-label';
        label.textContent = 'Assign to';
        wrap.appendChild(label);
        if (isSingle) {
          label.style.display = 'none';
        } else {
          const placeholder = document.createElement('option');
          placeholder.value = '';
          placeholder.textContent = 'Choose participant…';
          placeholder.disabled = true;
          placeholder.selected = true;
          picker.appendChild(placeholder);
        }
        options.forEach(opt => {
          const o = document.createElement('option');
          o.value = opt.key;
          o.textContent = opt.name;
          if (!isSingle && lastSelectedParticipantKey && opt.key === lastSelectedParticipantKey) {
            o.selected = true;
          }
          if (isSingle) o.selected = true;
          picker.appendChild(o);
        });
        picker.disabled = isSingle;
        if (!isSingle) {
          picker.value = '';
          picker.dataset.userSet = '';
        } else {
          picker.dataset.userSet = '1';
        }
        wrap.appendChild(picker);
        const actionWrap = item.querySelector('.time-block-item__action') || item;
        actionWrap.insertBefore(wrap, button);
      }
      const picker = item.querySelector('.participant-picker');
      if (picker) {
        picker.addEventListener('change', () => {
          lastSelectedParticipantKey = picker.value || null;
          picker.dataset.userSet = picker.value ? '1' : '';
          updateConflictingSlots();
        });
      }

      if (button) {
        button.disabled = !!isFull;
        if (!isFull) {
          button.textContent = item.classList.contains('selected') ? 'Assign another' : 'Assign';
        }
        button.addEventListener('click', (e) => {
          e.preventDefault();
          if (button.disabled) return;
          const meta = getSlotMeta(item);
          const participantKey = picker ? picker.value : (getParticipantOptions()[0] && getParticipantOptions()[0].key);
          if (!participantKey) {
            const note = item.querySelector('[data-role="conflict-note"]');
            if (note) {
              note.textContent = 'Pick who you want to assign first.';
              note.hidden = false;
            }
            if (picker) picker.focus();
            return;
          }
          const existing = slotAssignments.find(a => a.blockId === Number(meta.id) && a.participantKey === participantKey);
          if (existing) {
            removeAssignment(existing.slotId, participantKey);
            return;
          }
          if (participantHasConflict(participantKey, meta)) {
            const note = item.querySelector('[data-role="conflict-note"]');
            const name = getParticipantNameByKey(participantKey) || 'Participant';
            if (note) {
              note.textContent = `${name} has an overlapping time. Choose another participant.`;
              note.hidden = false;
            }
            button.disabled = true;
            return;
          }
          const exists = slotAssignments.find(a => a.blockId === Number(meta.id) && a.participantKey === participantKey);
          if (exists) return;
          addAssignment(meta, participantKey);
        });
      }
    });

    function getErrorBox() {
      let box = document.getElementById('signup-client-errors');
      if (!box) {
        const host = signupFormContainer || signupForm || document.body;
        box = document.createElement('div');
        box.id = 'signup-client-errors';
        box.className = 'notice notice--error';
        if (host.firstChild) host.insertBefore(box, host.firstChild);
        else host.appendChild(box);
      }
      return box;
    }

    function clearStep1Errors() {
      if (step1ErrorBox) {
        step1ErrorBox.style.display = 'none';
        step1ErrorBox.textContent = '';
      }
      const step1Fields = [];
      ['signup-name', 'signup-email'].forEach(id => {
        const el = document.getElementById(id);
        if (el) step1Fields.push(el);
      });
      if (participantListEl) {
        step1Fields.push(...participantListEl.querySelectorAll('input[id^="participant-"]'));
      }
      step1Fields.forEach(el => {
        el.classList.remove('input-error');
        el.removeAttribute('aria-invalid');
      });
    }

    function clearClientErrors() {
      const root = signupFormContainer || signupForm || document;
      const box = document.getElementById('signup-client-errors');
      if (box) {
        box.style.display = 'none';
        box.textContent = '';
      }
      clearStep1Errors();
      if (root) {
        root.querySelectorAll('.input-error').forEach(el => {
          el.classList.remove('input-error');
          el.removeAttribute('aria-invalid');
        });
      }
    }

    function markInvalid(input) {
      if (!input) return;
      input.classList.add('input-error');
      input.setAttribute('aria-invalid', 'true');
    }

    function showStep1Error(message, focusEl) {
      if (step1ErrorBox) {
        step1ErrorBox.innerHTML = `<strong>Heads up:</strong> ${message}`;
        step1ErrorBox.style.display = '';
      }
      if (focusEl && typeof focusEl.focus === 'function') {
        focusEl.focus();
      }
      const target = focusEl || step1ErrorBox;
      if (target && typeof target.scrollIntoView === 'function' && !isInViewport(target)) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    function validateStep1() {
      if (isManageMode) return { ok: true };
      clearStep1Errors();
      const errors = [];
      let focusEl = null;

      const registrantNameInput = document.getElementById('signup-name');
      const registrantEmailInput = document.getElementById('signup-email');
      const registrantName = registrantNameInput ? String(registrantNameInput.value || '').trim() : '';
      const registrantEmail = registrantEmailInput ? String(registrantEmailInput.value || '').trim() : '';
      const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(registrantEmail);

      if (!registrantName) {
        errors.push('Please enter your name.');
        markInvalid(registrantNameInput);
        focusEl = focusEl || registrantNameInput;
      }
      if (!registrantEmail || !emailValid) {
        errors.push('Please enter a valid email.');
        markInvalid(registrantEmailInput);
        focusEl = focusEl || registrantEmailInput;
      }

      const participantInputs = participantListEl ? Array.from(participantListEl.querySelectorAll('input[id^="participant-"]')) : [];
      const emptyInputs = participantInputs.filter(input => !String(input.value || '').trim());
      if (emptyInputs.length) {
        errors.push('Enter a name for each participant.');
        emptyInputs.forEach(markInvalid);
        focusEl = focusEl || emptyInputs[0];
      }

      const nameBuckets = new Map();
      participantInputs.forEach(input => {
        const name = String(input.value || '').trim();
        if (!name) return;
        const key = name.toLowerCase();
        const list = nameBuckets.get(key) || [];
        list.push(input);
        nameBuckets.set(key, list);
      });
      const dupInputs = Array.from(nameBuckets.values()).filter(list => list.length > 1).flat();
      if (dupInputs.length) {
        errors.push('Participant names must be unique.');
        dupInputs.forEach(markInvalid);
        focusEl = focusEl || dupInputs[0];
      }

      if (errors.length) {
        return { ok: false, message: errors[0], focusEl };
      }
      return { ok: true };
    }

    function showClientError(message, focusEl) {
      const box = getErrorBox();
      if (box) {
        box.textContent = message;
        box.style.display = '';
      }
      if (focusEl && typeof focusEl.focus === 'function') {
        focusEl.focus();
      }
      if (focusEl && typeof focusEl.scrollIntoView === 'function' && !isInViewport(focusEl)) {
        focusEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (!focusEl && box && typeof box.scrollIntoView === 'function') {
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    // Basic validation on submit: ensure selections and participant names are valid
    if (signupForm) {
      signupForm.addEventListener('submit', (e) => {
        clearClientErrors();
        const errors = [];
        let focusEl = null;

        const payload = buildPayload();
        if (!isManageMode) {
          const step1Result = validateStep1();
          if (!step1Result.ok) {
            e.preventDefault();
            showStep1Error(step1Result.message, step1Result.focusEl);
            return false;
          }
          step1Complete = true;
          updateStepVisibility();
        }
        if (!isManageMode && slotAssignments.length === 0) {
          errors.push('Add at least one assignment.');
          focusEl = focusEl || selectionFabButton || signupForm;
        }
        if (isPotluck) {
          const missingDish = slotAssignments.find(a => !a.dishName || !String(a.dishName).trim());
          if (missingDish) {
            errors.push('Please enter a dish name for each item.');
            const dishInput = selectedSlotsContainer
              ? selectedSlotsContainer.querySelector(`.selected-slot__note input[data-assignment-id="${missingDish.slotId}"]`)
              : null;
            if (dishInput) {
              markInvalid(dishInput);
              focusEl = focusEl || dishInput;
            }
          }
        }

        if (errors.length) {
          e.preventDefault();
          if (!step1Complete) {
            showStep1Error(errors[0], focusEl);
          } else {
            showClientError(errors[0], focusEl);
          }
          return false;
        }
        rebuildPayload();
      });
    }

    // Party/registrant controls -> rebuild participant list and payload
    if (partySizeInput) {
      partySizeInput.addEventListener('input', () => {
        ensureParticipantInputs();
        if (!isManageMode) {
          step1Complete = false;
          updateStepVisibility();
          updateSignupFormVisibility();
        }
      });
    }
    if (step1ContinueBtn && !isManageMode) {
      step1ContinueBtn.addEventListener('click', async () => {
        const result = validateStep1();
        if (!result.ok) {
          showStep1Error(result.message, result.focusEl);
          return;
        }

        // Duplicate guard: ping server and send manage link instead of proceeding
        try {
          const eventIdInput = document.querySelector('input[name="eventId"]');
          const csrfInput = document.querySelector('input[name="_csrf"]');
          const emailInput = document.getElementById('signup-email');
          const eventId = eventIdInput ? eventIdInput.value : '';
          const email = emailInput ? emailInput.value : '';
          const csrf = csrfInput ? csrfInput.value : '';
          if (eventId && email && csrf) {
            const resp = await fetch('/manage/check-duplicate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ eventId, email, _csrf: csrf })
            });
            if (resp.ok) {
              const data = await resp.json();
              if (data && data.duplicate) {
                showStep1Error('It looks like you already have a signup for this event. We emailed your manage link again—please check your inbox (and Spam/Junk) to update your signup.', emailInput);
                return;
              }
            }
          }
        } catch (err) {
          console.error('Duplicate check failed; continuing:', err);
        }

        step1Complete = true;
        updateStepVisibility();
        updateSignupFormVisibility();
        // When entering Step 2 fresh, clear any remembered participant selection so
        // multi-participant pickers start on the placeholder.
        lastSelectedParticipantKey = null;
        document.querySelectorAll('.participant-picker').forEach(sel => { sel.dataset.userSet = ''; });
        rebuildParticipantPickers();
        updateConflictingSlots();
        const target = selectionStep || document.getElementById('step2Heading') || timeBlockItems[0];
        if (target) {
          const top = target.getBoundingClientRect().top + window.scrollY - 24;
          window.scrollTo({ top, behavior: 'smooth' });
          if (typeof target.focus === 'function') {
            target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
          }
        }
      });
    }
    registrantRadioEls.forEach(r => {
      r.addEventListener('change', () => {
        const registrantParticipating = registrantRadioEls.some(x => x.checked && x.value === 'yes');
        const registrantName = (document.getElementById('signup-name') || {}).value || '';
        if (registrantParticipating) {
          if (!participants.length) participants.push({ name: registrantName || 'You' });
          else participants[0].name = registrantName || 'You';
        } else if (participants[0]) {
          participants[0].name = '';
        }
        step1Complete = false;
        lastSelectedParticipantKey = null;
        ensureParticipantInputs();
        updateStepVisibility();
        updateSignupFormVisibility();
      });
    });
    const registrantNameInput = document.getElementById('signup-name');
    if (registrantNameInput && !isManageMode) {
      registrantNameInput.addEventListener('input', () => {
        registrantNameInput.classList.remove('input-error');
        registrantNameInput.removeAttribute('aria-invalid');
        step1Complete = false;
        const registrantParticipating = registrantRadioEls.some(r => r.checked && r.value === 'yes');
        if (registrantParticipating && participants[0]) {
          participants[0].name = registrantNameInput.value || participants[0].name;
          rebuildParticipantPickers();
          renderSelectedList();
          rebuildPayload();
        }
        ensureParticipantInputs();
        updateStepVisibility();
        updateSignupFormVisibility();
      });
    }
    const registrantEmailInput = document.getElementById('signup-email');
    if (registrantEmailInput && !isManageMode) {
      registrantEmailInput.addEventListener('input', () => {
        registrantEmailInput.classList.remove('input-error');
        registrantEmailInput.removeAttribute('aria-invalid');
        step1Complete = false;
        updateStepVisibility();
        updateSignupFormVisibility();
      });
    }

    // Kick off initial renders + payload
    ensureParticipantInputs();
    rebuildParticipantPickers();
    updateStepVisibility();

    if (!isManageMode) {
      hydrateAssignmentsFromPayload();
    } else if (isManageMode && manageDataEl) {
      // Pre-populate manage assignments
      try {
        const data = JSON.parse(manageDataEl.getAttribute('data-assignments') || '{}');
        (data.participants || []).forEach(p => {
          (p.schedule || []).forEach(s => {
            const metaItem = timeBlockItems.find(el => el.getAttribute('data-block-id') === String(s.time_block_id));
            if (!metaItem) return;
            const meta = getSlotMeta(metaItem);
            addAssignment(meta, participantKeyFromId(p.participant_id));
          });
          (p.potluck || []).forEach(s => {
            const metaItem = timeBlockItems.find(el => el.getAttribute('data-block-id') === String(s.item_id));
            if (!metaItem) return;
            const meta = getSlotMeta(metaItem);
            addAssignment(meta, participantKeyFromId(p.participant_id), s.dish_name || '');
          });
        });
      } catch (err) {
        console.warn('[VolunteerUI] Failed to pre-populate manage assignments:', err && err.message);
      }
    }

    if (!isManageMode) updateParticipantNamesFromInputs();
    updateCapacityStates();
    updateConflictingSlots();
    renderSelectedList();
    rebuildPayload();
    updateSignupFormVisibility();
    updateSelectionFabVisibility();

  } catch (e) {
    console.error('[VolunteerUI] Fatal initialization error:', e);
  }

  // Debug overlay: outline elements that may create stacking contexts (useful for modal z-index bugs)
  (function(){
    const debugKey = 'ui-debug-overlay';
    function createOverlay() {
      const style = document.createElement('style');
      style.id = 'ui-debug-overlay-style';
      style.textContent = `
        .ui-debug-outline { outline: 2px dashed rgba(255,0,0,0.9) !important; }
      `;
      document.head.appendChild(style);
      const els = Array.from(document.querySelectorAll('*'));
      els.forEach(el => {
        try {
          const cs = getComputedStyle(el);
          if (['fixed','absolute','relative','sticky'].includes(cs.position) || cs.zIndex !== 'auto' || cs.transform !== 'none') {
            el.classList.add('ui-debug-outline');
          }
        } catch (e) { /* ignore */ }
      });
    }

    function removeOverlay() {
      const style = document.getElementById('ui-debug-overlay-style');
      if (style) style.remove();
      document.querySelectorAll('.ui-debug-outline').forEach(e => e.classList.remove('ui-debug-outline'));
    }

    function toggleDebug(force) {
      const on = typeof force === 'boolean' ? force : !localStorage.getItem(debugKey);
      if (on) {
        createOverlay();
        localStorage.setItem(debugKey, '1');
        console.log('UI debug overlay: ON');
      } else {
        removeOverlay();
        localStorage.removeItem(debugKey);
        console.log('UI debug overlay: OFF');
      }
    }

    // keyboard shortcut: Ctrl+Shift+D to toggle
    document.addEventListener('keydown', function(e){
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        toggleDebug();
      }
    });

    // restore state
    if (localStorage.getItem(debugKey)) toggleDebug(true);
  })();

});
  // Generic datetime -> hidden canonical sync for any form using .datetime-field
  try {
    function canonicalFromLocal(value) {
      if (!value) return '';
      if (value.includes('T')) {
        const [date, time] = value.split('T');
        return `${date} ${time.slice(0, 5)}`;
      }
      const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})/);
      if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
      const d = new Date(value);
      if (!isNaN(d)) {
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      return '';
    }

    function syncDatetimeFields(root) {
      const forms = Array.from((root || document).querySelectorAll('form'));
      forms.forEach(form => {
        if (form._canonInit) return;
        form.addEventListener('submit', () => {
          form.querySelectorAll('.datetime-field').forEach(field => {
            const targetId = field.getAttribute('data-canonical-target');
            if (!targetId) return;
            const hidden = document.getElementById(targetId);
            if (hidden) hidden.value = canonicalFromLocal(field.value);
          });
        });
        form._canonInit = true;
      });
    }
    syncDatetimeFields(document);
  } catch (err) {
    console.error('[DatetimeSync] init failed:', err);
  }

  // Admin Dashboard: validate New Event form client-side (modal)
  try {
    const newEventForm = document.getElementById('newEventForm');
    if (newEventForm) {
      newEventForm.addEventListener('submit', (e) => {
        const name = document.getElementById('event-name');
        const startVisible = document.getElementById('event-start-new');
        const endVisible = document.getElementById('event-end-new');
        const errors = [];
        if (!name || !name.value.trim()) errors.push('Event name is required.');
        if (!startVisible || !startVisible.value) errors.push('Start date & time is required.');
        if (!endVisible || !endVisible.value) errors.push('End date & time is required.');
        if (startVisible && endVisible && startVisible.value && endVisible.value) {
          const s = new Date(startVisible.value);
          const t = new Date(endVisible.value);
          if (!isNaN(s) && !isNaN(t) && t <= s) errors.push('End must be after start.');
        }
        if (errors.length) {
          e.preventDefault();
          // Render inline error list near the form
          let box = document.getElementById('newEventErrors');
          if (!box) {
            box = document.createElement('div');
            box.id = 'newEventErrors';
            box.className = 'notice notice--error';
            newEventForm.insertBefore(box, newEventForm.firstChild);
          }
          box.innerHTML = '<ul>' + errors.map(m => `<li>${m}</li>`).join('') + '</ul>';
          try { name && name.focus(); } catch (_) {}
        }
      });
    }
  } catch (err) {
    console.error('[NewEventValidation] init failed:', err);
  }
