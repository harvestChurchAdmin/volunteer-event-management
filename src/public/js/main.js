// src/public/js/main.js
// Public-side behaviors (CSP-safe; no inline JS).
// IMPORTANT: We do NOT convert times. We display exactly what the server rendered.
// The Selected Times list is built from the UI text inside each opportunity.

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded. Initializing scripts.');

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

  // Print helpers (CSP-safe; no inline handlers)
  try {
    const params = new URLSearchParams(location.search || '');
    const auto = params.get('auto');
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
    const isManageMode = signupForm && signupForm.getAttribute('data-mode') === 'manage';
    const viewModeSelect = document.getElementById('slot-view-mode');
    const stationView = document.getElementById('slots-by-station');
    const timeView = document.getElementById('slots-by-time');
    const timeViewList = document.getElementById('slots-by-time-list');
    const selectionFab = document.getElementById('selection-fab');
    const selectionFabButton = selectionFab ? selectionFab.querySelector('button') : null;

    if (!timeBlockItems.length || !signupFormContainer || !signupForm || !selectedSlotsContainer) {
      console.debug('[VolunteerUI] No volunteer UI elements detected on this page.');
      return;
    }

    console.debug('[VolunteerUI] Found', timeBlockItems.length, 'time block entries.');
    timeBlockItems.slice(0, 5).forEach((el, i) => {
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

    function updateSelectionFabVisibility() {
      if (!selectionFab) return;
      const rect = signupFormContainer.getBoundingClientRect();
      const beforeForm = rect.top - 120 > window.innerHeight;
      if (selectedSlots.length > 0 && beforeForm) {
        selectionFab.hidden = false;
        selectionFab.classList.add('is-visible');
        selectionFab.setAttribute('aria-hidden', 'false');
      } else {
        selectionFab.classList.remove('is-visible');
        selectionFab.hidden = true;
        selectionFab.setAttribute('aria-hidden', 'true');
      }
    }

    if (selectionFabButton) {
      selectionFabButton.addEventListener('click', (event) => {
        event.preventDefault();
        try {
          signupFormContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (err) {
          signupFormContainer.scrollIntoView();
        }
        setTimeout(() => {
          const focusTarget =
            signupForm.querySelector('input:not([type="hidden"]), select, textarea');
          if (focusTarget && typeof focusTarget.focus === 'function') {
            focusTarget.focus({ preventScroll: true });
          }
        }, 420);
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


    function renderSelectedList() {
      selectedSlotsContainer.innerHTML = '';
      const title = document.createElement('h4');
      title.textContent = 'Selected Opportunities';
      selectedSlotsContainer.appendChild(title);

      if (!selectedSlots.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No opportunities selected.';
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
        stationLine.textContent = slot.stationName || slot.displayText || 'Selected opportunity';
        textWrap.appendChild(stationLine);

        const timeLine = document.createElement('span');
        timeLine.className = 'selected-slot__time';
        timeLine.textContent = formatSelectedSlotTime(slot);
        textWrap.appendChild(timeLine);

        li.appendChild(textWrap);

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

      const hint = document.createElement('p');
      hint.className = 'selected-hint';
      hint.textContent = 'Complete the form below to confirm your selected opportunities.';
      selectedSlotsContainer.appendChild(hint);

      console.debug('[VolunteerUI] Selected list rendered:', selectedSlots.map(s => ({ id: s.id, displayText: s.displayText })));
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
      console.debug('[VolunteerUI] Hidden inputs now:', Array.from(formData.entries()));
    }

    function updateSignupFormVisibility() {
      if (isManageMode) {
        signupFormContainer.style.display = 'block';
      } else {
        signupFormContainer.style.display = selectedSlots.length > 0 ? 'block' : 'none';
      }
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

      if (selectedSlots.length > 0 && item.classList.contains('selected')) {
        const visibleItems = getVisibleItems();
        const currentIndex = visibleItems.indexOf(item);
        if (currentIndex >= 0) {
          for (let idx = currentIndex + 1; idx < visibleItems.length; idx += 1) {
            const candidate = visibleItems[idx];
            const disabled = candidate.getAttribute('data-is-full') === 'true' || candidate.classList.contains('is-full');
            if (!disabled) {
              candidate.focus();
              break;
            }
          }
        }
      }

      console.debug('[VolunteerUI] Selected opportunities:', selectedSlots);
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

    // Initial render
    updateSignupFormVisibility();

    // Submission debug
    signupForm.addEventListener('submit', (e) => {
      const formData = new FormData(signupForm);
      console.debug('[VolunteerUI] Submitting with data:', Array.from(formData.entries()));
      // Server persists; we do not alter any times client-side.
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
