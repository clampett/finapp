const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const { createApiProxy } = require('../api-proxy');

const listen = (server) =>
  new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)),
  );
const close = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });

test('forwards login bodies, session cookies, path/query, and upstream status without exposing a database', async () => {
  const upstream = http.createServer((req, res) => {
    let body = '';
    req.on('data', (data) => {
      body += data;
    });
    req.on('end', () => {
      if (req.url.startsWith('/api/v1/auth/login')) {
        assert.deepEqual(JSON.parse(body), { username: 'fixture', password: 'fixture' });
        assert.equal(req.headers.origin, undefined);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie':
            'finapp_session=fixture; HttpOnly; Secure; SameSite=Strict; Domain=remote.example',
        });
        res.end(JSON.stringify({ message: 'Login successful', userId: 9 }));
      } else {
        assert.equal(req.url, '/api/v1/graph/9?example=1');
        assert.equal(req.headers.cookie, 'finapp_session=fixture');
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end('{"message":"Denied"}');
      }
    });
  });
  const upstreamUrl = await listen(upstream);
  const app = express();
  app.use('/api', createApiProxy(upstreamUrl));
  const gateway = http.createServer(app);
  const gatewayUrl = await listen(gateway);
  try {
    const login = await fetch(gatewayUrl + '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:8080' },
      body: JSON.stringify({ username: 'fixture', password: 'fixture' }),
    });
    assert.equal(login.status, 200);
    assert.equal((await login.json()).userId, 9);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    assert.doesNotMatch(cookie, /Domain=|;\s*Secure/);
    const denied = await fetch(gatewayUrl + '/api/v1/graph/9?example=1', {
      headers: { Cookie: 'finapp_session=fixture' },
    });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).message, 'Denied');
  } finally {
    await close(gateway);
    await close(upstream);
  }
});

test('rejects an upstream containing credentials or an arbitrary path', () => {
  assert.throws(() => createApiProxy('https://user:secret@example.com'));
  assert.throws(() => createApiProxy('https://example.com/arbitrary'));
  assert.throws(() => createApiProxy('file:///private'));
});
