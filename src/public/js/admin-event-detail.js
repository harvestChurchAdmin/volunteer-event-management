// src/public/js/admin-event-detail.js
// JS for Admin Event Detail page — CSP-safe (no inline JS)

(function() {
  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  const modalOpener = new WeakMap();

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

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

  function toTimestamp(value) {
    if (!value) return NaN;
    const canonical = canonicalFromLocal(value);
    const match = canonical.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})$/);
    if (!match) return NaN;
    const [, y, mo, d, h, mi] = match;
    return new Date(+y, +mo - 1, +d, +h, +mi).getTime();
  }

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

    // Client-side validation for new time block form
    if (timeBlockForm) {
      timeBlockForm.addEventListener('submit', function(e) {
        syncFormDatetimes(timeBlockForm);
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

    // Confirmation prompts
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

    // Close buttons (any element with data-close attribute)
    qsa('[data-close]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        const selector = btn.getAttribute('data-close');
        const target = selector ? qs(selector) : btn.closest('.modal');
        closeModal(target);
      });
    });

    // Click outside to close
    qsa('.modal').forEach(function(modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal(modal);
      });
    });

    // ESC closes any open modal
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        qsa('.modal[aria-hidden="false"]').forEach(closeModal);
      }
    });
  });
})();
