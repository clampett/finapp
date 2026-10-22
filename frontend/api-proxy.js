const http = require('node:http');
const https = require('node:https');

function createApiProxy(upstream) {
  // Validated one configured upstream before requests were accepted, preventing
  // browser-controlled URLs or embedded credentials from choosing a proxy target.
  const origin = new URL(upstream);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      'FINAPP_API_UPSTREAM must be an HTTP(S) server origin without credentials or a path.',
    );
  }
  return (req, res) => {
    // The origin is fixed by server configuration, never by request parameters.
    const headers = { ...req.headers, host: origin.host };
    delete headers.connection;
    delete headers['proxy-connection'];
    // Browser CORS belongs to the public gateway; Java is a private upstream.
    delete headers.origin;
    const client = origin.protocol === 'https:' ? https : http;
    const request = client.request(
      {
        protocol: origin.protocol,
        hostname: origin.hostname,
        port: origin.port || undefined,
        method: req.method,
        path: req.originalUrl,
        headers,
      },
      (response) => {
        const forwarded = { ...response.headers };
        // Cookies must belong to the local frontend when proxying a hosted API.
        if (forwarded['set-cookie'])
          forwarded['set-cookie'] = forwarded['set-cookie'].map((cookie) => {
            let value = cookie.replace(/;\s*Domain=[^;]+/gi, '');
            if (!req.secure && ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname))
              value = value.replace(/;\s*Secure(?=;|$)/gi, '');
            return value;
          });
        res.writeHead(response.statusCode || 502, forwarded);
        response.pipe(res);
      },
    );
    request.setTimeout(15000, () => request.destroy(new Error('Backend timed out')));
    request.on('error', () => {
      // Returned a JSON error only before headers had been sent; an already
      // streaming response was closed instead of receiving a second HTTP response.
      if (!res.headersSent)
        res.status(502).json({
          message:
            'Cannot reach local Spring Boot. Check the terminal running start.ps1 for errors.',
        });
      else res.destroy();
    });
    req.on('aborted', () => request.destroy());
    res.on('close', () => {
      if (!res.writableEnded) request.destroy();
    });
    req.pipe(request);
  };
}

module.exports = { createApiProxy };
