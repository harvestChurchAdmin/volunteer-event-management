const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function loadScript(dom, scriptPath) {
  const code = fs.readFileSync(scriptPath, 'utf8');
  const el = dom.window.document.createElement('script');
  el.textContent = code;
  dom.window.document.body.appendChild(el);
}

test('potluck flow: select item -> dish input required -> hidden ids', async () => {
  const html = `<!doctype html><html><head></head><body>
    <div id="slots-by-station">
      <ul class="time-block-list">
        <li class="time-block-item is-potluck" data-block-id="101" data-station-id="10" data-station-name="Mains" data-item-title="Protein" data-is-full="false" role="button" tabindex="0">
          <div class="time-block-item__info"><span class="station-chip muted">Category: Mains</span><strong>Protein</strong></div>
          <div class="time-block-item__others"></div>
          <div><button type="button" class="btn btn-ghost select-slot-btn">Sign up</button></div>
        </li>
      </ul>
    </div>
    <section>
      <div id="selected-slots-panel" style="display:none;"><div id="selected-slots-container"></div></div>
      <div id="signup-form" style="display:none;">
        <form id="signupFormTag" data-is-potluck="true">
          <input type="hidden" name="eventId" value="1">
        </form>
      </div>
    </section>
  </body></html>`;

  const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost' });
  global.window = dom.window;
  global.document = dom.window.document;

  const clientScript = path.join(__dirname, '..', 'src', 'public', 'js', 'main.js');
  loadScript(dom, clientScript);

  await new Promise(r => setTimeout(r, 30));

  const btn = document.querySelector('.select-slot-btn');
  expect(btn).toBeTruthy();
  btn.click();

  await new Promise(r => setTimeout(r, 10));

  const dishInput = document.querySelector('#selected-slots-container input[id^="dish-note-"]');
  expect(dishInput).toBeTruthy();
  expect(dishInput.getAttribute('required')).toBe('required');

  const hiddenIds = Array.from(document.querySelectorAll('input[name="blockIds[]"]')).map(el => el.value);
  expect(hiddenIds).toContain('101');
});

