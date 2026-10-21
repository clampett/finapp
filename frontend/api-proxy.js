const http = require('node:http');
const https = require('node:https');

function createApiProxy(upstream) {
  const origin = new URL(upstream);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('FINAPP_API_UPSTREAM must be an HTTP(S) server origin without credentials or a path.');
  }
  return (req, res) => {
    // The origin is fixed by server configuration, never by request parameters.
    const headers = { ...req.headers, host: origin.host };
    delete headers.connection;
    delete headers['proxy-connection'];
    // Browser CORS belongs to the public gateway; Java is a private upstream.
    delete headers.origin;
    const client = origin.protocol === 'https:' ? https : http;
    const request = client.request({
      protocol: origin.protocol, hostname: origin.hostname, port: origin.port || undefined,
      method: req.method, path: req.originalUrl, headers,
    }, response => {
      const forwarded = { ...response.headers };
      // Cookies must belong to the local frontend when proxying a hosted API.
      if (forwarded['set-cookie']) forwarded['set-cookie'] = forwarded['set-cookie'].map(cookie => {
        let value = cookie.replace(/;\s*Domain=[^;]+/ig, '');
        if (!req.secure && ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)) value = value.replace(/;\s*Secure(?=;|$)/ig, '');
        return value;
      });
      res.writeHead(response.statusCode || 502, forwarded);
      response.pipe(res);
    });
    request.setTimeout(90000, () => request.destroy(new Error('Backend timed out')));
    request.on('error', () => {
      if (!res.headersSent) res.status(502).json({ message: 'The shared FinApp backend is unavailable or starting up. Please try again shortly.' });
      else res.destroy();
    });
    req.on('aborted', () => request.destroy());
    res.on('close', () => { if (!res.writableEnded) request.destroy(); });
    req.pipe(request);
  };
}

module.exports = { createApiProxy };
