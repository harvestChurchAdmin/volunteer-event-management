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
      el.className = 'toast ' + (variant === 'success' ? 'toast--success' : '');
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
    if (toastData) {
      successMsg = toastData.getAttribute('data-success') || '';
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

    const DEBUG = false;
    if (!timeBlockItems.length || !signupFormContainer || !signupForm) {
      if (DEBUG) console.debug('[VolunteerUI] No volunteer UI elements detected on this page.');
      return;
    }

    if (DEBUG) console.debug('[VolunteerUI] Found', timeBlockItems.length, 'time block entries.');
    timeBlockItems.slice(0, 5).forEach((el, i) => {
      if (!DEBUG) return;
      console.debug(`[VolunteerUI] Item[${i}] dataset:`, {
        blockId: el.getAttribute('data-block-id'),
        start: el.getAttribute('data-start-time'),
        end: el.getAttribute('data-end-time'),
        isFull: el.getAttribute('data-is-full'),
        station: el.getAttribute('data-station-name')
      });
    });

    // State: selected opportunities -> we store metadata needed for conflicts and rendering.
    let selectedSlots = []; // { id, displayText, start, end, stationId, stationName, startLabel, endLabel, startRaw, endRaw }
    const originalPlacement = new Map(); // blockId -> { parent, placeholder }

    function isInViewport(el) {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const vw = window.innerWidth || document.documentElement.clientWidth;
      return r.top < vh && r.bottom > 0 && r.left < vw && r.right > 0;
    }

    function updateSelectionFabVisibility() {
      if (!selectionFab) return;
      const hasSelections = selectedSlots.length > 0;
      const shouldEnable = isManageMode || hasSelections;
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
          // Potluck: scroll to the first dish name field in Step 2 and focus it.
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
          // Standard volunteer signup: scroll to Step 2 review panel, but do not auto-focus
          // any field so the keyboard does not pop up and hide selections on mobile.
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
        endRaw
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

    function formatSlotForMessage(slot) {
      if (!slot) return '(unknown)';
      if (slot.displayText) return slot.displayText;
      const parts = [];
      if (slot.stationName) parts.push(slot.stationName);
      return parts.length ? parts.join(' — ') : '(unknown)';
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

    function markConflictState(item, conflicts) {
      const button = item.querySelector('.select-slot-btn');
      const note = item.querySelector('[data-role="conflict-note"]');
      const baseIsFull = item.getAttribute('data-is-full') === 'true' || item.classList.contains('is-full');
      const isSelected = item.classList.contains('selected');

      if (isSelected) {
        item.classList.remove('disabled-overlap');
        item.setAttribute('aria-disabled', 'false');
        item.setAttribute('aria-pressed', 'true');
        const originalTab = item.dataset.originalTabindex || '0';
        item.setAttribute('tabindex', originalTab);
        if (button) {
          button.disabled = false;
          button.textContent = 'Selected';
        }
        if (note) {
          note.textContent = '';
          note.hidden = true;
        }
        return;
      }

      if (conflicts.length) {
        item.classList.add('disabled-overlap');
        item.setAttribute('aria-disabled', 'true');
        item.setAttribute('aria-pressed', 'false');
        item.setAttribute('tabindex', '-1');
        if (button) {
          button.disabled = true;
          button.textContent = 'Conflict';
        }
        if (note) {
          const message = conflicts.length === 1
            ? `Conflicts with ${formatSlotForMessage(conflicts[0])}`
            : 'Conflicts with other selected opportunities';
          note.textContent = message;
          note.hidden = false;
        }
        return;
      }

      item.classList.remove('disabled-overlap');
      item.setAttribute('aria-pressed', 'false');
      if (!baseIsFull) {
        item.setAttribute('aria-disabled', 'false');
        const originalTab = item.dataset.originalTabindex || '0';
        item.setAttribute('tabindex', originalTab);
        if (button) {
          button.disabled = false;
          button.textContent = item.classList.contains('selected') ? 'Selected' : 'Select';
        }
      }
      if (note) {
        note.textContent = '';
        note.hidden = true;
      }
    }

    function updateConflictingSlots() {
      timeBlockItems.forEach(item => {
        const meta = getSlotMeta(item);
        const conflicts = selectedSlots.filter(slot => slot.id !== meta.id && slotsOverlap(slot, meta));
        markConflictState(item, conflicts);
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

        function compareSlots(a, b) {
      const startA = Number.isFinite(a.start) ? a.start : Number.POSITIVE_INFINITY;
      const startB = Number.isFinite(b.start) ? b.start : Number.POSITIVE_INFINITY;
      if (startA !== startB) {
        return startA - startB;
      }
      const endA = Number.isFinite(a.end) ? a.end : Number.POSITIVE_INFINITY;
      const endB = Number.isFinite(b.end) ? b.end : Number.POSITIVE_INFINITY;
      if (endA !== endB) {
        return endA - endB;
      }
      const stationA = (a.stationName || '').toLowerCase();
      const stationB = (b.stationName || '').toLowerCase();
      if (stationA !== stationB) {
        return stationA.localeCompare(stationB);
      }
      const textA = (a.displayText || '').toLowerCase();
      const textB = (b.displayText || '').toLowerCase();
      return textA.localeCompare(textB);
    }

    function sortSelectedSlots() {
      if (selectedSlots.length <= 1) return;
      selectedSlots.sort(compareSlots);
    }


    function renderStepIndicator() {
      if (!stepsContainer) return;
      const hasSelection = selectedSlots.length > 0;
      const needsDish = isPotluck ? anySelectedNeedsDish() : false;
      const steps = isPotluck
        ? ['Select items', 'Enter dish names', 'Enter contact info']
        : ['Select opportunities', 'Enter contact info', 'Confirm selections'];
      let activeIdx = 0;
      if (hasSelection) activeIdx = isPotluck ? (needsDish ? 1 : 2) : 1;
      stepsContainer.innerHTML = '';
      const ol = document.createElement('ol');
      ol.className = 'signup-steps__list';
      steps.forEach((label, i) => {
        const li = document.createElement('li');
        li.className = 'signup-step' + (i === activeIdx ? ' is-active' : '');
        li.innerHTML = `<span class="signup-step__num">${i + 1}</span><span class="signup-step__label">${label}</span>`;
        ol.appendChild(li);
      });
      stepsContainer.appendChild(ol);
    }

    function renderSelectedList() {
      if (!selectedSlotsContainer) return; // Schedule mode: no selected list UI
      selectedSlotsContainer.innerHTML = '';
      const title = document.createElement('h4');
      title.textContent = isPotluck ? 'Selected Items' : 'Selected Opportunities';
      selectedSlotsContainer.appendChild(title);

      // Column header removed for clarity/responsiveness; each row now includes its own label.

      if (!selectedSlots.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No selections yet.';
        selectedSlotsContainer.appendChild(empty);
        return;
      }

      sortSelectedSlots();

      const ul = document.createElement('ul');
      selectedSlots.forEach(slot => {
        const li = document.createElement('li');
        li.classList.add('selected-slot');

        const textWrap = document.createElement('div');
        textWrap.className = 'selected-slot__text';

        const stationLine = document.createElement('span');
        stationLine.className = 'selected-slot__station';
        if (isPotluck) {
          const cat = (slot.stationName || '').trim();
          const item = (slot.itemTitle || '').trim();
          // Build: [Category chip] [Item text with ellipsis]
          stationLine.textContent = '';
          stationLine.classList.add('selected-slot__station--inline');
          const catChip = document.createElement('span');
          catChip.className = 'cat-chip';
          catChip.textContent = cat || 'Category';
          const itemSpan = document.createElement('span');
          itemSpan.className = 'selected-slot__item';
          itemSpan.textContent = item || 'Item';
          if (item) itemSpan.title = `${cat ? cat + ' — ' : ''}${item}`;
          stationLine.appendChild(catChip);
          stationLine.appendChild(itemSpan);
          // keep compact single visual line
        } else {
          stationLine.textContent = slot.stationName || slot.displayText || 'Selected opportunity';
          const timeLine = document.createElement('span');
          timeLine.className = 'selected-slot__time';
          timeLine.textContent = formatSelectedSlotTime(slot);
          textWrap.appendChild(timeLine);
        }
        textWrap.appendChild(stationLine);

        li.appendChild(textWrap);

        // For potluck events, collect a dish name per selected item
        if (isPotluck) {
          const noteWrap = document.createElement('div');
          noteWrap.className = 'selected-slot__note';
          const labelEl = document.createElement('label');
          labelEl.textContent = 'Dish name (required)';
          labelEl.className = 'sr-only';
          const input = document.createElement('input');
          input.type = 'text';
          input.id = `dish-note-${slot.id}`;
          input.name = `dish_notes[${slot.id}]`;
          input.placeholder = 'Enter dish name (required)';
          // Pre-fill from DOM if available (manage view)
          try {
            const srcItem = timeBlockItems.find(el => el.getAttribute('data-block-id') === slot.id);
            if (srcItem) {
              const existing = srcItem.getAttribute('data-dish-note');
              if (existing) input.value = existing;
            }
          } catch (_) {}
          noteWrap.appendChild(labelEl);
          noteWrap.appendChild(input);
          li.appendChild(noteWrap);
        }

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'selected-slot-remove';
        remove.textContent = 'Remove';
        remove.setAttribute('data-slot-id', slot.id);
        remove.addEventListener('click', () => {
          const item = timeBlockItems.find(el => el.getAttribute('data-block-id') === slot.id);
          if (item) {
            toggleSlotSelection(item);
          }
        });
        li.appendChild(remove);

        ul.appendChild(li);
      });
      selectedSlotsContainer.appendChild(ul);

      // Removed additional hint text; step headings and required fields guide the flow.

      if (DEBUG) console.debug('[VolunteerUI] Selected list rendered:', selectedSlots.map(s => ({ id: s.id, displayText: s.displayText })));
    }

    function rebuildHiddenInputs() {
      signupForm.querySelectorAll('input[name="blockIds[]"]').forEach(input => input.remove());
      selectedSlots.forEach(slot => {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'blockIds[]';
        hidden.value = slot.id;
        signupForm.appendChild(hidden);
      });
      const formData = new FormData(signupForm);
      if (DEBUG) console.debug('[VolunteerUI] Hidden inputs now:', Array.from(formData.entries()));
    }

    function updateSignupFormVisibility() {
      const hasSel = selectedSlots.length > 0;
      const show = (isManageMode || hasSel);
      if (selectedPanel) selectedPanel.style.display = show ? 'block' : 'none';
      if (signupFormContainer) signupFormContainer.style.display = show ? 'block' : 'none';
      const step2 = document.getElementById('step2Heading');
      const step3 = document.getElementById('step3Heading');
      if (step2) step2.style.display = show ? '' : 'none';
      if (step3) step3.style.display = show ? '' : 'none';
      const badge = document.getElementById('selectedCountBadge');
      if (badge) {
        if (hasSel) {
          badge.textContent = `(${selectedSlots.length})`;
          badge.style.display = '';
        } else {
          badge.style.display = 'none';
        }
      }
    }

    function anySelectedNeedsDish() {
      if (!isPotluck) return false;
      return selectedSlots.some(slot => {
        const input = document.getElementById(`dish-note-${slot.id}`);
        const val = input ? String(input.value || '').trim() : '';
        return val.length === 0;
      });
    }

    function updateDishRequirement() {
      if (!isPotluck) return;
      selectedSlots.forEach(slot => {
        const input = document.getElementById(`dish-note-${slot.id}`);
        if (!input) return;
        input.setAttribute('required', 'required');
        input.setAttribute('aria-required', 'true');
        input.setAttribute('placeholder', 'Enter dish name (required)');
      });
    }

    function updateSelectionFab() {
      if (!selectionFab) return;
      updateSelectionFabVisibility();
    }

    function toggleSlotSelection(item) {
      const id = item.getAttribute('data-block-id');
      if (!id) {
        console.error('[VolunteerUI] Missing data-block-id on time-block-item:', item);
        return;
      }
      if (item.classList.contains('disabled-overlap')) {
        return;
      }

      const existingIdx = selectedSlots.findIndex(s => s.id === id);
      if (existingIdx >= 0) {
        selectedSlots.splice(existingIdx, 1);
        item.classList.remove('selected');
        item.classList.remove('disabled-overlap');
        item.setAttribute('aria-pressed', 'false');
        const btn = item.querySelector('.select-slot-btn');
        if (btn) btn.textContent = 'Select';
      } else {
        const slotMeta = getSlotMeta(item);
        const displayText = getDisplayTextFromItem(item);

        selectedSlots.push({ id, displayText, ...slotMeta });
        sortSelectedSlots();
        item.classList.add('selected');
        item.setAttribute('aria-pressed', 'true');
        const btn = item.querySelector('.select-slot-btn');
        if (btn) btn.textContent = 'Selected';
      }

      renderSelectedList();
      rebuildHiddenInputs();
      updateSignupFormVisibility();
      updateConflictingSlots();
      updateSelectionFab();
      updateDishRequirement();

      // Removed auto-scroll on first selection to avoid focus jump. Users can use the
      // "Continue to sign-up" button to navigate to the form.

      // Do not move focus automatically after selection; this can cause the page
      // to scroll unexpectedly on mobile. Users can continue selecting or use the
      // floating button to jump to the form when ready.

      if (DEBUG) console.debug('[VolunteerUI] Selected opportunities:', selectedSlots);
    }

    // Pre-populate from any items already marked as selected (manage experience)
    timeBlockItems.forEach(item => {
      if (!item.classList.contains('selected')) return;
      const id = item.getAttribute('data-block-id');
      if (!id || selectedSlots.some(slot => slot.id === id)) return;
      item.setAttribute('aria-pressed', 'true');
      const button = item.querySelector('.select-slot-btn');
      if (button) button.textContent = 'Selected';
      const slotMeta = getSlotMeta(item);
      selectedSlots.push({ id, displayText: getDisplayTextFromItem(item), ...slotMeta });
    });

    updateConflictingSlots();
    updateSelectionFab();

    if (isManageMode) {
      renderSelectedList();
      rebuildHiddenInputs();
      updateSignupFormVisibility();
    } else if (selectedSlots.length) {
      renderSelectedList();
      rebuildHiddenInputs();
      updateSignupFormVisibility();
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

    if (viewModeSelect && stationView && timeView && timeViewList) {
      viewModeSelect.addEventListener('change', () => {
        applyViewMode(viewModeSelect.value === 'time' ? 'time' : 'station');
      });
    }

    // Bind Select buttons and item interactions
    timeBlockItems.forEach(item => {
      const button = item.querySelector('.select-slot-btn');
      const isFull = item.getAttribute('data-is-full') === 'true' || item.classList.contains('is-full');
      item.setAttribute('aria-disabled', isFull ? 'true' : 'false');
      item.setAttribute('aria-pressed', item.classList.contains('selected') ? 'true' : 'false');
      if (button) {
        button.disabled = !!isFull;
        if (!isFull) {
          button.textContent = item.classList.contains('selected') ? 'Selected' : 'Select';
        }
        button.addEventListener('click', (e) => {
          e.preventDefault();
          if (button.disabled) return;
          toggleSlotSelection(item);
        });
      }
      if (!isFull) {
        item.addEventListener('click', (e) => {
          if (button && e.target.closest('.select-slot-btn')) return;
          toggleSlotSelection(item);
        });
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleSlotSelection(item);
          }
        });
      }
    });

    if (viewModeSelect) {
      applyViewMode(viewModeSelect.value === 'time' ? 'time' : 'station');
    }

    // Helpers for inline contact validation
    const emailInput = signupForm.querySelector('#signup-email');
    const phoneInput = signupForm.querySelector('#signup-phone');

    function getErrorIdForInput(input) {
      const base = input.id || input.name || 'field';
      return `${base}-error`;
    }

    function clearFieldError(input) {
      if (!input) return;
      input.classList.remove('input-error');
      input.removeAttribute('aria-invalid');
      const errorId = getErrorIdForInput(input);
      const existing = document.getElementById(errorId);
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
      const describedBy = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      const next = describedBy.filter(id => id !== errorId);
      if (next.length) {
        input.setAttribute('aria-describedby', next.join(' '));
      } else {
        input.removeAttribute('aria-describedby');
      }
    }

    function setFieldError(input, message) {
      if (!input) return;
      clearFieldError(input);
      input.classList.add('input-error');
      input.setAttribute('aria-invalid', 'true');
      const errorId = getErrorIdForInput(input);
      const error = document.createElement('p');
      error.id = errorId;
      error.className = 'field-error';
      error.textContent = message;
      const parent = input.parentNode;
      if (parent) {
        if (input.nextSibling) {
          parent.insertBefore(error, input.nextSibling);
        } else {
          parent.appendChild(error);
        }
      }
      const describedBy = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
      if (!describedBy.includes(errorId)) {
        describedBy.push(errorId);
        input.setAttribute('aria-describedby', describedBy.join(' '));
      }
    }

    function validateEmailField() {
      if (!emailInput) return true;
      const value = String(emailInput.value || '').trim();
      clearFieldError(emailInput);
      if (!value) {
        setFieldError(emailInput, 'Email is required.');
        return false;
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
        setFieldError(emailInput, 'Please provide a valid email address.');
        return false;
      }
      return true;
    }

    function validatePhoneField() {
      if (!phoneInput) return true;
      const raw = String(phoneInput.value || '').trim();
      const digits = raw.replace(/\D/g, '');
      clearFieldError(phoneInput);
      if (!raw) {
        setFieldError(phoneInput, 'Phone number is required.');
        return false;
      }
      if (digits.length !== 10) {
        setFieldError(phoneInput, 'Phone number must be 10 digits.');
        return false;
      }
      return true;
    }

    if (emailInput) {
      emailInput.addEventListener('blur', () => {
        validateEmailField();
      });
    }
    if (phoneInput) {
      phoneInput.addEventListener('blur', () => {
        validatePhoneField();
      });
    }

    // Initial render
    updateSignupFormVisibility();
    updateDishRequirement();

    // Submission debug and client-side validation
    signupForm.addEventListener('submit', (e) => {
      const formData = new FormData(signupForm);
      if (DEBUG) console.debug('[VolunteerUI] Submitting with data:', Array.from(formData.entries()));
      // Server persists; we do not alter any times client-side.
      if (isPotluck) {
        // Validate per selected slot
        const missing = [];
        selectedSlots.forEach(slot => {
          const input = document.getElementById(`dish-note-${slot.id}`);
          const val = input ? (input.value || '').trim() : '';
          // Clear any previous error state
          if (input) {
            input.classList.remove('input-error');
            input.removeAttribute('aria-invalid');
          }
          if (!val) {
            missing.push(slot);
            if (input) {
              input.classList.add('input-error');
              input.setAttribute('aria-invalid', 'true');
            }
          }
        });
        // Sync per-item dish inputs into hidden inputs inside the form
        signupForm.querySelectorAll('input[name^="dish_notes["]').forEach(h => { if (h.closest('#selected-slots-container')) h.remove(); });
        selectedSlots.forEach(slot => {
          const source = document.getElementById(`dish-note-${slot.id}`);
          if (!source) return;
          const hidden = document.createElement('input');
          hidden.type = 'hidden';
          hidden.name = `dish_notes[${slot.id}]`;
          hidden.value = source.value || '';
          signupForm.appendChild(hidden);
        });
        if (missing.length) {
          e.preventDefault();
          try {
            let box = document.getElementById('selectedDishErrors');
            if (!box) {
              box = document.createElement('div');
              box.id = 'selectedDishErrors';
              box.className = 'notice notice--error';
              const afterTitle = selectedSlotsContainer.querySelector('h4');
              if (afterTitle && afterTitle.parentNode === selectedSlotsContainer) {
                selectedSlotsContainer.insertBefore(box, afterTitle.nextSibling);
              } else {
                selectedSlotsContainer.insertBefore(box, selectedSlotsContainer.firstChild);
              }
            }
            const names = missing.map(s => {
              // Prefer Station — Item text
              const item = timeBlockItems.find(el => el.getAttribute('data-block-id') === s.id);
              const itemTitle = item ? (item.getAttribute('data-item-title') || '').trim() : '';
              const cat = s.stationName || '';
              return cat && itemTitle ? `${cat} — ${itemTitle}` : (s.displayText || cat || s.id);
            });
            box.innerHTML = `<p style="margin:0;">Please enter a dish name for: <strong>${names.join(', ')}</strong>.</p>`;
            const first = document.getElementById(`dish-note-${missing[0].id}`);
            if (first && typeof first.focus === 'function') first.focus();
          } catch (err) { /* ignore */ }
        }
      }

      const emailValid = validateEmailField();
      const phoneValid = validatePhoneField();
      if (!emailValid || !phoneValid) {
        e.preventDefault();
        const firstInvalid = !emailValid && emailInput ? emailInput : (!phoneValid && phoneInput ? phoneInput : null);
        if (firstInvalid && typeof firstInvalid.focus === 'function') {
          firstInvalid.focus();
        }
      }
    });

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
