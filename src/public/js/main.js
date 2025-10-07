// src/public/js/main.js
// Public-side behaviors (CSP-safe; no inline JS).
// IMPORTANT: We do NOT convert times. We display exactly what the server rendered.
// The Selected Times list is built from the UI text inside each slot.

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

  // ================================
  // Public Volunteer Multi-Select UI
  // ================================
  try {
    const timeBlockItems = Array.from(document.querySelectorAll('.time-block-item'));
    const signupFormContainer = document.getElementById('signup-form');
    const signupForm = document.getElementById('signupFormTag');
    const selectedSlotsContainer = document.getElementById('selected-slots-container');
    const isManageMode = signupForm && signupForm.getAttribute('data-mode') === 'manage';

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
        isFull: el.getAttribute('data-is-full')
      });
    });

    // State: selected slots -> we store the blockId and the exact display text we show the user.
    let selectedSlots = []; // { id, displayText }

    function getDisplayTextFromItem(item) {
      // We’ll build the same line the user sees in the list item:
      // e.g., "Fri, Oct 31 @ 05:00 PM – 09:00 PM"
      const infoDiv = item.querySelector('div'); // first div holds the time text we render on the server
      if (!infoDiv) return '(unknown time)';
      // Extract text content from that div only
      const text = infoDiv.textContent || infoDiv.innerText || '';
      // The text includes "• Capacity Needed: X"; strip that off for the Selected Times summary.
      const lower = text.toLowerCase();
      const marker = '• capacity needed';
      const idx = lower.indexOf(marker);
      return idx >= 0 ? text.slice(0, idx).trim() : text.trim();
    }

    function renderSelectedList() {
      selectedSlotsContainer.innerHTML = '';
      const title = document.createElement('h4');
      title.textContent = 'Selected Slots';
      selectedSlotsContainer.appendChild(title);

      if (!selectedSlots.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'No slots selected.';
        selectedSlotsContainer.appendChild(empty);
        return;
      }

      const ul = document.createElement('ul');
      selectedSlots.forEach(slot => {
        const li = document.createElement('li');
        li.textContent = slot.displayText;
        ul.appendChild(li);
      });
      selectedSlotsContainer.appendChild(ul);

      const hint = document.createElement('p');
      hint.className = 'selected-hint';
      hint.textContent = 'Scroll to the form whenever you are ready to confirm your selected slots.';
      selectedSlotsContainer.appendChild(hint);

      console.debug('[VolunteerUI] Selected list rendered:', selectedSlots.map(s => ({ id: s.id, displayText: s.displayText })));
    }

    function rebuildHiddenInputs() {
      // We only need blockIds for the server.
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

    function toggleSlotSelection(item) {
      const id = item.getAttribute('data-block-id');
      if (!id) {
        console.error('[VolunteerUI] Missing data-block-id on time-block-item:', item);
        return;
      }
      const itemIndex = timeBlockItems.indexOf(item);

      const idx = selectedSlots.findIndex(s => s.id === id);
      if (idx >= 0) {
        // Deselect
        selectedSlots.splice(idx, 1);
        item.classList.remove('selected');
        item.setAttribute('aria-pressed', 'false');
        const btn = item.querySelector('.select-slot-btn');
        if (btn) btn.textContent = 'Select';
      } else {
        // Select using the exact display text shown in the list
        const displayText = getDisplayTextFromItem(item);
        selectedSlots.push({ id, displayText });
        item.classList.add('selected');
        item.setAttribute('aria-pressed', 'true');
        const btn = item.querySelector('.select-slot-btn');
        if (btn) btn.textContent = 'Selected';
      }

      renderSelectedList();
      rebuildHiddenInputs();
      updateSignupFormVisibility();
      if (selectedSlots.length > 0 && item.classList.contains('selected')) {
        for (let offset = 1; offset < timeBlockItems.length; offset += 1) {
          const candidate = timeBlockItems[(itemIndex + offset) % timeBlockItems.length];
          if (candidate === item) continue;
          const disabled = candidate.getAttribute('data-is-full') === 'true' || candidate.classList.contains('is-full');
          if (!disabled) {
            candidate.focus();
            break;
          }
        }
      }

      console.debug('[VolunteerUI] Selected slots:', selectedSlots);
    }

    // Pre-populate from any items already marked as selected (manage experience)
    timeBlockItems.forEach(item => {
      if (!item.classList.contains('selected')) return;
      const id = item.getAttribute('data-block-id');
      if (!id || selectedSlots.some(slot => slot.id === id)) return;
      item.setAttribute('aria-pressed', 'true');
      const button = item.querySelector('.select-slot-btn');
      if (button) button.textContent = 'Selected';
      selectedSlots.push({ id, displayText: getDisplayTextFromItem(item) });
    });

    if (isManageMode) {
      renderSelectedList();
      rebuildHiddenInputs();
      updateSignupFormVisibility();
    } else if (selectedSlots.length) {
      renderSelectedList();
      rebuildHiddenInputs();
      updateSignupFormVisibility();
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
