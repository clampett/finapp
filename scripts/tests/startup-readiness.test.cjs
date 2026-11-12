const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const run = promisify(execFile);
const helper = path.resolve(__dirname, '../FinApp.Common.ps1').replaceAll("'", "''");

// Exercised Windows PowerShell 5.1 against real local HTTP responses, including
// an open port that belonged to an unhealthy or unrelated application.
test(
  'startup accepts only a healthy FinApp response and bounds stalled requests',
  {
    skip: process.platform !== 'win32',
  },
  async () => {
    const server = http.createServer((req, res) => {
      if (req.url === '/slow') return;
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/healthy' }).end();
        return;
      }
      if (req.url === '/error') {
        res.writeHead(503).end('Unavailable');
        return;
      }
      if (req.url === '/invalid') {
        res.end('Not JSON');
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          success: true,
          data: {
            status: req.url === '/unhealthy' ? 'DOWN' : 'UP',
            service:
              req.url === '/gateway'
                ? 'frontend-gateway'
                : req.url === '/unrelated'
                  ? 'another-app'
                  : 'java-backend',
          },
        }),
      );
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      const checks = ['healthy', 'unhealthy', 'unrelated', 'invalid', 'error', 'redirect', 'slow'];
      const fields = checks.map(
        (name) => `${name} = (Test-FinAppBackendReady 'http://127.0.0.1:${port}/${name}')`,
      );
      const { stdout } = await run(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `. '${helper}'; $results = @{ open = (Test-FinAppPortOpen ${port}); gateway = (Test-FinAppBackendReady 'http://127.0.0.1:${port}/gateway' 'frontend-gateway'); wrongService = (Test-FinAppBackendReady 'http://127.0.0.1:${port}/gateway'); ${fields.join('; ')} }; $results | ConvertTo-Json -Compress`,
        ],
        { timeout: 20000, windowsHide: true },
      );
      const results = JSON.parse(stdout.trim());
      assert.equal(results.open, true);
      assert.equal(results.healthy, true);
      assert.equal(results.gateway, true);
      assert.equal(results.wrongService, false);
      for (const name of checks.slice(1)) assert.equal(results[name], false, name);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    const { stdout } = await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `. '${helper}'; Test-FinAppPortOpen ${port}; Test-FinAppBackendReady 'http://127.0.0.1:${port}/healthy'`,
      ],
      { timeout: 10000, windowsHide: true },
    );
    assert.deepEqual(stdout.trim().split(/\r?\n/), ['False', 'False']);
  },
);

test(
  'a bound Windows socket is detected before it can accept connections',
  {
    skip: process.platform !== 'win32',
  },
  async () => {
    const { stdout } = await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `. '${helper}'; $socket = [Net.Sockets.Socket]::new([Net.Sockets.AddressFamily]::InterNetworkV6, [Net.Sockets.SocketType]::Stream, [Net.Sockets.ProtocolType]::Tcp); try { $socket.DualMode = $true; $socket.Bind([Net.IPEndPoint]::new([Net.IPAddress]::IPv6Any, 0)); Test-FinAppPortOpen $socket.LocalEndPoint.Port } finally { $socket.Dispose() }`,
      ],
      { timeout: 10000, windowsHide: true },
    );
    assert.equal(stdout.trim(), 'True');
  },
);

test('an occupied frontend port reports an error and exits unsuccessfully', async () => {
  const occupied = http.createServer();
  await new Promise((resolve) => occupied.listen(0, resolve));
  try {
    const express = path.resolve(__dirname, '../../frontend/express.js');
    await assert.rejects(
      run(process.execPath, [express], {
        env: { ...process.env, PORT: String(occupied.address().port) },
        timeout: 10000,
        windowsHide: true,
      }),
      (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /port .* is already in use/);
        assert.doesNotMatch(error.stdout, /Server running/);
        return true;
      },
    );
  } finally {
    await new Promise((resolve) => occupied.close(resolve));
  }
});
