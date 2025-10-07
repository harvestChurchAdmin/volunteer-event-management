const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

async function waitForServer(url, timeout = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    (function ping() {
      http.get(url, res => resolve()).on('error', err => {
        if (Date.now() - start > timeout) return reject(new Error('timeout waiting for server'));
        setTimeout(ping, 200);
      });
    })();
  });
}

async function run() {
  const serverProc = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js')], {
    env: Object.assign({}, process.env, { NODE_ENV: 'test', PORT: '3100' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', d => process.stdout.write('[server] ' + d));
  serverProc.stderr.on('data', d => process.stderr.write('[server.err] ' + d));

  try {
    await waitForServer('http://127.0.0.1:3100/');
  } catch (err) {
    serverProc.kill('SIGKILL');
    throw err;
  }

  // Run Puppeteer test
  const puppeteer = require('puppeteer');
  const launchOpts = { headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'], timeout: 120000 };
  console.log('Launching puppeteer with options', launchOpts);
  const browser = await puppeteer.launch(launchOpts).catch(err => {
    console.error('Puppeteer launch failed, will retry with headless:true and verbose error');
    return puppeteer.launch(Object.assign({ headless: true }, launchOpts));
  });
  const page = await browser.newPage();
  try {
  // Navigate to a lightweight test page that includes a modal with datetime fields (no auth required)
  await page.goto('http://127.0.0.1:3100/test-picker.html', { waitUntil: 'networkidle2' });

    // Find a button with data-open that opens a modal containing datetime controls
    const openBtn = await page.$('[data-open]');
    if (!openBtn) throw new Error('No element with [data-open] found on /test-picker.html');

    await openBtn.click();
    // wait for modal to appear
    await page.waitForSelector('.modal[aria-hidden="false"]', { timeout: 3000 });

    // Check for datetime fields inside the modal and confirm canonical sync
    const syncResult = await page.evaluate(() => {
      const modal = document.querySelector('.modal[aria-hidden="false"]');
      if (!modal) return { found: false };
      const visible = modal.querySelector('.datetime-field');
      const hidden = modal.querySelector('input[type="hidden"][name="start_time"]');
      if (!visible || !hidden) return { found: false };
      visible.value = '2030-01-15T09:45';
      visible.dispatchEvent(new Event('input', { bubbles: true }));
      visible.dispatchEvent(new Event('change', { bubbles: true }));
      return {
        found: true,
        hiddenValue: hidden.value
      };
    });

    console.log('Datetime sync result:', syncResult);

    if (!syncResult.found) throw new Error('datetime-field markup not found inside modal');
    if (syncResult.hiddenValue !== '2030-01-15 09:45') {
      throw new Error('Hidden canonical value not updated correctly');
    }

    await browser.close();
    serverProc.kill('SIGKILL');
    console.log('SMOKE TEST: SUCCESS');
  } catch (err) {
    await browser.close();
    serverProc.kill('SIGKILL');
    console.error('SMOKE TEST: FAILED:', err);
    process.exit(2);
  }
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
