const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');

test('coach HTTP rejected oversized JSON and throttled repeated requests without calling Ollama', async () => {
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
    const endpoint = `http://127.0.0.1:${port}/api/v1/coach/explain`;
    const post = (body) =>
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    assert.equal(
      (await post(JSON.stringify({ topic: 'conversation', question: 'x'.repeat(20000) }))).status,
      413,
    );
    assert.equal((await post('{broken')).status, 400);
    for (let i = 0; i < 10; i++) assert.equal((await post('{"topic":"invalid"}')).status, 503);
    const blocked = await post('{"topic":"invalid"}');
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
    assert.match((await blocked.json()).message, /wait a minute/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/v1/gateway/health`)).status, 200);
  } finally {
    // Stopped only the child gateway created by this test.
    child.kill();
    await new Promise((resolve) =>
      child.exitCode !== null ? resolve() : child.once('exit', resolve),
    );
  }
});

test('coach HTTP value-asset validates input and returns structured estimation', async () => {
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
    const endpoint = `http://127.0.0.1:${port}/api/v1/coach/value-asset`;
    const post = (body) =>
      fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

    // Invalid / missing description
    assert.equal((await post(JSON.stringify({}))).status, 400);
    assert.equal((await post(JSON.stringify({ description: '' }))).status, 400);
    assert.equal((await post(JSON.stringify({ description: 'a'.repeat(600) }))).status, 400);

    // Valid asset estimation request
    const res = await post(
      JSON.stringify({ description: '2019 Toyota RAV4; my reference amount is $15,000' }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data);
    assert.equal(body.data.categoryName, 'Vehicles');
    assert.equal(body.data.amount, 15000);
    assert.equal(body.data.source, 'provided');
    assert.equal(body.data.verified, false);
    assert.equal(Object.hasOwn(body.data, 'kind'), false);
  } finally {
    child.kill();
    await new Promise((resolve) =>
      child.exitCode !== null ? resolve() : child.once('exit', resolve),
    );
  }
});
