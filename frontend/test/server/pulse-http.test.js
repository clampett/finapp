const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

test('Pulse HTTP rejected private fields and oversized input and throttled repeated requests before inference', async () => {
  // Reserved an ephemeral test port without changing the developer's running gateway.
  const reservation = http.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, [path.join(__dirname, '../../express.js')], {
    env: { ...process.env, PORT: String(port) },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Test gateway did not start.')), 5000);
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('Server running')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(Error(`Test gateway exited: ${code}`));
      });
    });
    const endpoint = `http://127.0.0.1:${port}/api/v1/coach/pulse`;
    const post = (body) =>
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(
      (
        await post(
          JSON.stringify({
            cashflow: 'unknown',
            concentration: 'unknown',
            forecast: 'none',
            balances: 10000,
          }),
        )
      ).status,
      400,
    );
    assert.equal((await post('{broken')).status, 400);
    assert.equal((await post(JSON.stringify({ message: 'x'.repeat(3000) }))).status, 413);
    const blocked = await post(
      JSON.stringify({ cashflow: 'unknown', concentration: 'unknown', forecast: 'none' }),
    );
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.match((await blocked.json()).message, /AI Pulse/);
  } finally {
    // Stopped only the child gateway created by this test.
    child.kill();
    await new Promise((resolve) =>
      child.exitCode !== null ? resolve() : child.once('exit', resolve),
    );
  }
});
