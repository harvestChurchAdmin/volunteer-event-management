// src/public/js/admin-event-detail.js
// Client-side behaviour for the admin event detail page. Everything lives in an
// IIFE to keep the global scope clean and to remain CSP friendly (no inline JS).

(function() {
  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  const modalOpener = new WeakMap();
  const SCROLL_KEY = 'admin:scrollY';
  const FOCUS_STATION_KEY = 'admin:focusStation';
  const COLLAPSED_STORAGE_KEY = 'admin:collapsedStations';

  // Helpers ------------------------------------------------------------------
  /**
   * Pad a number with a leading zero (used for datetime components).
   */
  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  /**
   * Convert a `<input type="datetime-local">` compatible value into the canonical
   * format used by the backend (`YYYY-MM-DD HH:mm`).
   */
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
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
    return '';
  }

  /**
   * Convert canonical DB-friendly text to a value the datetime-local input can show.
   */
  function localFromCanonical(value) {
    if (!value) return '';
    if (value.includes('T')) {
      return value.slice(0, 16);
    }
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
    const d = new Date(value);
    if (!isNaN(d)) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
    return '';
  }

  /**
   * Convert either canonical text or datetime-local value into a timestamp so we
   * can compare ordering without Date.parse guessing.
   */
  function toTimestamp(value) {
    if (!value) return NaN;
    const canonical = canonicalFromLocal(value);
    const match = canonical.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})$/);
    if (!match) return NaN;
    const [, y, mo, d, h, mi] = match;
    return new Date(+y, +mo - 1, +d, +h, +mi).getTime();
  }

  /**
   * Ensure the requested station card is in view and briefly highlighted without
   * mutating its collapsed/expanded state.
   */
  function focusStationCard(stationState) {
    if (!stationState) return;

    let payload = stationState;
    if (typeof stationState === 'string') {
      try {
        payload = JSON.parse(stationState);
      } catch (err) {
        payload = { id: stationState };
      }
    } else if (typeof stationState !== 'object') {
      payload = { id: stationState };
    }

    if (!payload || !payload.id) return;
    const id = String(payload.id);
    const card = qs('article.station-card[data-station-id="' + id + '"]');
    if (!card) return;

    // Bring the card into view without smooth scrolling to avoid heavy motion.
    try { card.scrollIntoView({ behavior: 'auto', block: 'start' }); } catch (err) {
      window.scrollTo(0, card.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0));
    }

    card.classList.add('station-card--flash');
    setTimeout(function() {
      card.classList.remove('station-card--flash');
    }, 1600);
  }

  /**
   * Display a modal, optionally remembering the element that triggered it so
   * focus can be restored after closing.
   */
  function openModal(modal, opener) {
    if (!modal) return;
    if (opener) modalOpener.set(modal, opener);
    try {
      if (modal.parentNode !== document.body) {
        modal._originalParent = modal.parentNode;
        modal._originalNextSibling = modal.nextSibling;
        document.body.appendChild(modal);
      }
    } catch (err) { /* ignore */ }

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    try {
      if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      const heading = modal.querySelector('.modal-header h3');
      if (heading) {
        if (!heading.id) heading.id = 'modal-title-' + Math.random().toString(36).slice(2, 8);
        modal.setAttribute('aria-labelledby', heading.id);
      }
    } catch (err) { /* ignore */ }
    try { document.body.classList.add('modal-open'); } catch (err) { /* ignore */ }

    setTimeout(function() {
      const focusable = modal.querySelector('input, button, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable && typeof focusable.focus === 'function') focusable.focus();
    }, 0);

    const trapHandler = function(e) {
      if (e.key !== 'Tab') return;
      const focusables = qsa('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])', modal)
        .filter(el => !el.disabled && el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    modal._trapHandler = trapHandler;
    document.addEventListener('keydown', trapHandler);
  }

  /**
   * Hide the modal, tear down focus trapping, and return focus to the opener.
   */
  function closeModal(modal) {
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    try {
      modal.removeAttribute('role');
      modal.removeAttribute('aria-modal');
      modal.removeAttribute('aria-labelledby');
    } catch (err) { /* ignore */ }
    try { document.body.classList.remove('modal-open'); } catch (err) { /* ignore */ }

    if (modal._trapHandler) {
      document.removeEventListener('keydown', modal._trapHandler);
      delete modal._trapHandler;
    }

    try {
      if (modal._originalParent) {
        if (modal._originalNextSibling && modal._originalNextSibling.parentNode === modal._originalParent) {
          modal._originalParent.insertBefore(modal, modal._originalNextSibling);
        } else {
          modal._originalParent.appendChild(modal);
        }
        delete modal._originalParent;
        delete modal._originalNextSibling;
      }
    } catch (err) { /* ignore */ }

    const opener = modalOpener.get(modal);
    if (opener && typeof opener.focus === 'function') opener.focus();
  }

  /**
   * Render a bullet list of validation errors in the provided container.
   */
  function showErrors(container, messages) {
    if (!container) return;
    container.innerHTML = '';
    const ul = document.createElement('ul');
    messages.forEach(msg => {
      const li = document.createElement('li');
      li.textContent = msg;
      ul.appendChild(li);
    });
    container.appendChild(ul);
    container.style.display = 'block';
    container.classList.add('notice', 'notice--error', 'form-errors');
  }

  /**
   * Copy visible datetime values into hidden canonical fields prior to submit.
   */
  function syncFormDatetimes(form) {
    if (!form) return;
    qsa('.datetime-field', form).forEach(field => {
      const targetId = field.getAttribute('data-canonical-target');
      if (!targetId) return;
      const hidden = document.getElementById(targetId);
      if (!hidden) return;
      hidden.value = canonicalFromLocal(field.value);
    });
  }

  /**
   * Attach datetime-field behaviour to inputs within `root`. Handles syncing
   * between visible datetime-local inputs and hidden canonical fields.
   */
  function initDatetimeFields(root = document) {
    qsa('.datetime-field', root).forEach(field => {
      if (field._datetimeInit) return;
      const targetId = field.getAttribute('data-canonical-target');
      if (!targetId) return;
      const hidden = document.getElementById(targetId);
      if (!hidden) return;

      const syncToHidden = () => {
        hidden.value = canonicalFromLocal(field.value);
      };
      const syncToVisible = () => {
        field.value = localFromCanonical(hidden.value);
      };

      if (hidden.value && !field.value) {
        syncToVisible();
      } else if (!hidden.value && field.value) {
        syncToHidden();
      }

      field.addEventListener('change', syncToHidden);
      field.addEventListener('blur', syncToHidden);
      field.addEventListener('input', syncToHidden);

      const promptPicker = () => {
        try {
          if (typeof field.showPicker === 'function') field.showPicker();
        } catch (err) { /* showPicker not supported */ }
      };
      field.addEventListener('focus', promptPicker);
      field.addEventListener('click', promptPicker);

      const maybeAdjustEnd = () => {
        if (!field.classList.contains('datetime-field')) return;
        const dataRole = field.getAttribute('data-datetime-role');
        if (dataRole !== 'start') return;
        const form = field.form;
        if (!form) return;
        const endField = form.querySelector('.datetime-field[data-datetime-role=\"end\"]');
        if (!endField) return;
        const startValue = field.value;
        if (!startValue) return;
        const startDate = new Date(startValue);
        if (Number.isNaN(startDate.getTime())) return;
        const existingEnd = endField.value ? new Date(endField.value) : null;
        if (!existingEnd || Number.isNaN(existingEnd.getTime()) || existingEnd <= startDate) {
          const adjusted = new Date(startDate.getTime() + 60 * 60 * 1000);
          const pad = (n) => String(n).padStart(2, '0');
          endField.value = `${adjusted.getFullYear()}-${pad(adjusted.getMonth() + 1)}-${pad(adjusted.getDate())}T${pad(adjusted.getHours())}:${pad(adjusted.getMinutes())}`;
          const endHiddenId = endField.getAttribute('data-canonical-target');
          if (endHiddenId) {
            const endHidden = document.getElementById(endHiddenId);
            if (endHidden) endHidden.value = canonicalFromLocal(endField.value);
          }
        }
      };

      field.addEventListener('change', maybeAdjustEnd);
      field.addEventListener('blur', maybeAdjustEnd);

      const form = field.form;
      if (form && !form._datetimeSubmitListener) {
        form.addEventListener('submit', function() {
          syncFormDatetimes(form);
        });
        form._datetimeSubmitListener = true;
      }

      field._datetimeInit = true;
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    initDatetimeFields();

    const timeBlockModal = qs('#timeBlockModal');
    const newStationModal = qs('#newStationModal');
    const timeBlockForm = qs('#timeBlockForm');
    const timeBlockErrors = qs('#timeBlockErrors');

    // Modal openers ----------------------------------------------------------
    qsa('[data-open]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const selector = btn.getAttribute('data-open');
        if (!selector) return;
        const modal = qs(selector);
        if (!modal) return;

        const form = modal.querySelector('form');
        if (form) {
          qsa('input[data-from="btn"]', form).forEach(el => el.remove());
          Array.from(btn.attributes).forEach(attr => {
            if (!attr.name.startsWith('data-') || attr.name === 'data-open') return;
            const name = attr.name.replace(/^data-/, '');
            const value = attr.value;
            if (modal === timeBlockModal && name === 'station-id' && timeBlockForm) {
              timeBlockForm.setAttribute('action', '/admin/station/' + value + '/blocks');
            }
            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = name;
            hidden.value = value;
            hidden.setAttribute('data-from', 'btn');
            form.appendChild(hidden);
          });
        }

        if (timeBlockErrors) {
          timeBlockErrors.style.display = 'none';
          timeBlockErrors.innerHTML = '';
        }

        openModal(modal, btn);
        initDatetimeFields(modal);
      });
    });

    // Client-side validation for new time block form -------------------------
    if (timeBlockForm) {
      timeBlockForm.addEventListener('submit', function(e) {
        syncFormDatetimes(timeBlockForm);
        // Preserve scroll position across full page submit so user returns to same spot
        try {
          sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || window.pageYOffset || 0));
          const addAnother = document.getElementById('timeblock-add-another');
          if (addAnother && addAnother.checked) {
            // record station-id so we can re-open after reload
            const stationId = timeBlockForm.querySelector('input[name="station-id"]')?.value || timeBlockForm.querySelector('input[name="station_id"]')?.value;
            if (stationId) sessionStorage.setItem('admin:openAddTimeBlock', String(stationId));
          } else {
            sessionStorage.removeItem('admin:openAddTimeBlock');
          }
        } catch (err) { /* ignore sessionStorage errors */ }
        const errors = [];
        const start = qs('input[name="start_time"]', timeBlockForm)?.value?.trim();
        const end = qs('input[name="end_time"]', timeBlockForm)?.value?.trim();
        const capacity = qs('input[name="capacity_needed"]', timeBlockForm)?.value;

        if (!start) errors.push('Start time is required.');
        if (!end) errors.push('End time is required.');

        if (start && end) {
          const startTs = toTimestamp(start);
          const endTs = toTimestamp(end);
          if (isNaN(startTs) || isNaN(endTs)) {
            errors.push('Please provide valid start and end times.');
          } else if (startTs >= endTs) {
            errors.push('End time must be after start time.');
          }
        }

        const capNumber = Number(capacity);
        if (!Number.isFinite(capNumber) || capNumber < 1) {
          errors.push('Capacity needed must be a positive number.');
        }

        if (errors.length) {
          e.preventDefault();
          showErrors(timeBlockErrors, errors);
          return false;
        }
        return true;
      });
    }

    // Preserve scroll position + station focus when editing station details ---
    qsa('form[id^="editStationForm-"]').forEach(function(form) {
      if (form.dataset.scrollPersistInit === 'true') return;
      form.addEventListener('submit', function() {
        try {
          sessionStorage.setItem(SCROLL_KEY, String(window.scrollY || window.pageYOffset || 0));
          const fromAttr = form.getAttribute('data-station-id');
          const match = /^editStationForm-(.+)$/.exec(form.id || '');
          const stationId = fromAttr || (match ? match[1] : null);
          if (stationId) {
            const card = qs('article.station-card[data-station-id="' + stationId + '"]');
            const payload = {
              id: stationId,
              collapsed: card ? card.classList.contains('is-collapsed') : false
            };
            sessionStorage.setItem(FOCUS_STATION_KEY, JSON.stringify(payload));
          }
        } catch (err) { /* ignore sessionStorage errors */ }
      });
      form.dataset.scrollPersistInit = 'true';
    });

    // Confirmation prompts ---------------------------------------------------
    const confirmState = {
      modal: null,
      messageNode: null,
      confirmButton: null,
      pendingForm: null
    };

    function ensureConfirmModal() {
      if (confirmState.modal) return;
      const modal = document.createElement('div');
      modal.id = 'globalConfirmModal';
      modal.className = 'modal';
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="confirmModalTitle">Please confirm</h3>
            <button class="close-btn" data-close="#globalConfirmModal">&times;</button>
          </div>
          <div class="modal-body">
            <p id="confirmModalMessage"></p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-ghost" data-role="cancel">Cancel</button>
            <button type="button" class="btn btn-danger" data-role="confirm">Confirm</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      confirmState.modal = modal;
      confirmState.messageNode = modal.querySelector('#confirmModalMessage');
      confirmState.confirmButton = modal.querySelector('[data-role="confirm"]');
      const cancelButton = modal.querySelector('[data-role="cancel"]');

      cancelButton.addEventListener('click', function() {
        confirmState.pendingForm = null;
        closeModal(confirmState.modal);
      });

      confirmState.confirmButton.addEventListener('click', function() {
        const form = confirmState.pendingForm;
        if (!form) {
          closeModal(confirmState.modal);
          return;
        }
        form.dataset.skipConfirm = 'true';
        confirmState.pendingForm = null;
        closeModal(confirmState.modal);
        if (typeof form.requestSubmit === 'function') form.requestSubmit();
        else form.submit();
      });
    }

    qsa('form.js-confirm').forEach(function(form) {
      form.addEventListener('submit', function(e) {
        if (form.dataset.skipConfirm === 'true') {
          delete form.dataset.skipConfirm;
          return true;
        }
        e.preventDefault();
        ensureConfirmModal();
        confirmState.pendingForm = form;
        const message = form.getAttribute('data-confirm') || 'Are you sure?';
        const cta = form.getAttribute('data-confirm-cta') || 'Confirm';
        confirmState.messageNode.textContent = message;
        confirmState.confirmButton.textContent = cta;
        const opener = form.querySelector('[type="submit"], button') || form;
        openModal(confirmState.modal, opener);
        return false;
      });
    });

    // Close buttons (any element with data-close attribute) ------------------
    qsa('[data-close]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const selector = btn.getAttribute('data-close');
        const target = selector ? qs(selector) : btn.closest('.modal');
        closeModal(target);
      });
    });

    // Click outside to close -------------------------------------------------
    qsa('.modal').forEach(function(modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal(modal);
      });
    });

    // ESC closes any open modal ---------------------------------------------
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        qsa('.modal[aria-hidden="false"]').forEach(closeModal);
      }
    });

    // Restore scroll position and optionally re-open time block modal after full page reload
    try {
      const saved = sessionStorage.getItem(SCROLL_KEY);
      if (saved !== null) {
        window.scrollTo(0, Number(saved) || 0);
        sessionStorage.removeItem(SCROLL_KEY);
      }
      const openStation = sessionStorage.getItem('admin:openAddTimeBlock');
      if (openStation) {
        // Find the add time block button for this station and click it to re-open modal
        const btn = qs('.open-time-block-btn[data-station-id="' + openStation + '"]');
        if (btn) { btn.click(); }
        sessionStorage.removeItem('admin:openAddTimeBlock');
      }
      const focusStation = sessionStorage.getItem(FOCUS_STATION_KEY);
      if (focusStation) {
        setTimeout(function() {
          focusStationCard(focusStation);
        }, 0);
        sessionStorage.removeItem(FOCUS_STATION_KEY);
      }
    } catch (err) { /* ignore */ }

    // Station collapse/expand with localStorage persistence ------------------
    (function() {
      const STORAGE_KEY = COLLAPSED_STORAGE_KEY;
      function readSet() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (!raw) return new Set();
          return new Set(JSON.parse(raw));
        } catch (e) { return new Set(); }
      }
      function saveSet(set) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
      }

      const collapsed = readSet();
      // apply persisted state
      collapsed.forEach(sid => {
        const card = qs('article.station-card[data-station-id="' + sid + '"]');
        const btn = qs('.station-toggle[data-station-id="' + sid + '"]');
        if (card) card.classList.add('is-collapsed');
        if (btn) {
          btn.setAttribute('aria-pressed', 'true');
          btn.setAttribute('aria-expanded', 'false');
        }
      });

      qsa('.station-toggle').forEach(btn => {
        btn.addEventListener('click', function() {
          const sid = btn.getAttribute('data-station-id');
          const card = qs('article.station-card[data-station-id="' + sid + '"]');
          if (!card) return;
          const collapsedNow = card.classList.toggle('is-collapsed');
          // aria-pressed indicates visual pressed state; aria-expanded should reflect content visibility
          btn.setAttribute('aria-pressed', collapsedNow ? 'true' : 'false');
          btn.setAttribute('aria-expanded', collapsedNow ? 'false' : 'true');
          if (collapsedNow) collapsed.add(sid); else collapsed.delete(sid);
          saveSet(collapsed);
        });
      });
    })();

    // Inline capacity editing ------------------------------------------------
    function handleCapacityFormSubmit(form, cb) {
      // Serialize to x-www-form-urlencoded so express.urlencoded() will parse req.body
      const data = new URLSearchParams();
      Array.from(form.elements).forEach(el => {
        if (!el.name) return;
        if (el.type === 'checkbox') {
          if (el.checked) data.append(el.name, el.value);
        } else if (!el.disabled) {
          data.append(el.name, el.value);
        }
      });
      fetch(form.action, {
        method: form.method || 'POST',
        credentials: 'same-origin',
        body: data.toString(),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }).then(async res => {
        if (res.ok) {
          // Try to parse JSON response if controller implements it
          try {
            const j = await res.json();
            if (j && j.updated && typeof j.capacity !== 'undefined') {
              cb(null, j.capacity);
              return;
            }
          } catch (e) { /* not JSON */ }
          // fallback to value from form
          const cap = data.get('capacity_needed');
          cb(null, cap);
        } else {
          cb(new Error('Server error ' + res.status));
        }
      }).catch(err => cb(err));
    }

    qsa('.edit-capacity-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const bid = btn.getAttribute('data-block-id');
        const form = qs('.capacity-edit-form[data-block-id="' + bid + '"]');
        const metric = btn.closest('.admin-block__metric');
        const display = metric ? metric.querySelector('.capacity-display') : null;
        if (form) {
          form.style.display = '';
          if (display) display.style.display = 'none';
          // Focus input
          const input = form.querySelector('input[name="capacity_needed"]');
          if (input) input.focus();
        }
      });
    });

    qsa('.cancel-capacity-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const form = btn.closest('.capacity-edit-form');
        if (!form) return;
        const metric = form.closest('.admin-block__metric');
        const display = metric ? metric.querySelector('.capacity-display') : null;
        form.style.display = 'none';
        if (display) display.style.display = '';
      });
    });

    qsa('.capacity-edit-form').forEach(form => {
      form.addEventListener('submit', function(e) {
        e.preventDefault();
        const metric = form.closest('.admin-block__metric');
        const display = metric ? metric.querySelector('.capacity-display') : null;
        handleCapacityFormSubmit(form, function(err, newCap) {
          if (err) {
            alert('Failed to update capacity: ' + (err && err.message ? err.message : 'unknown'));
            return;
          }
          // Update UI
          if (display) {
            display.innerHTML = '<strong>' + String(newCap) + '</strong>';
            display.style.display = '';
          }
          form.style.display = 'none';
        });
      });
    });

    // Drag & drop ordering for stations --------------------------------------
    (function initStationDnD() {
      const list = qs('.js-station-list');
      if (!list) return;
      let dragSrcEl = null;

      function evtTargetStation(el) {
        return el.closest && el.closest('article.station-card');
      }

      function handleDragStart(e) {
        const el = evtTargetStation(e.target);
        if (!el) return;
        dragSrcEl = el;
        e.dataTransfer.effectAllowed = 'move';
        try { e.dataTransfer.setData('text/plain', el.getAttribute('data-station-id')); } catch (err) {}
        el.classList.add('dragging');
      }

      function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const over = evtTargetStation(e.target);
        if (!over || over === dragSrcEl) return;
        const rect = over.getBoundingClientRect();
        const before = (e.clientY - rect.top) < (rect.height / 2);
        if (before) {
          over.parentNode.insertBefore(dragSrcEl, over);
        } else {
          over.parentNode.insertBefore(dragSrcEl, over.nextSibling);
        }
      }

      function handleDragEnd(e) {
        if (dragSrcEl) dragSrcEl.classList.remove('dragging');
        dragSrcEl = null;
        persistStationOrder();
      }

      function persistStationOrder() {
        const eventId = list.getAttribute('data-event-id');
        if (!eventId) return;
        const items = Array.from(list.querySelectorAll('article.station-card'));
        const payload = items.map((it, idx) => ({ station_id: Number(it.getAttribute('data-station-id')), station_order: idx }));
        // send POST JSON to server
        fetch(`/admin/event/${encodeURIComponent(eventId)}/stations/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: payload }),
          credentials: 'same-origin'
        }).then(res => {
          if (!res.ok) console.warn('Failed to persist station order', res.status);
        }).catch(err => console.error('Error persisting station order', err));
      }

      // wire events
      qsa('article.station-card', list).forEach(item => {
        item.addEventListener('dragstart', handleDragStart, false);
        item.addEventListener('dragover', handleDragOver, false);
        item.addEventListener('dragend', handleDragEnd, false);
      });

      // also support drag by handle (pointerdown -> set draggable)
      qsa('.drag-handle', list).forEach(h => {
        h.addEventListener('pointerdown', function() {
          const card = evtTargetStation(h);
          if (!card) return;
          card.setAttribute('draggable', 'true');
        });
      });
    })();
  });
})();
