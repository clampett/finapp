const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { createApiProxy } = require('./api-proxy');

const app = express();
const PORT = process.env.PORT || 8080;
// Render terminates TLS in front of this single public gateway.
if (process.env.RENDER === 'true') app.set('trust proxy', 1);

app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }),
  createApiProxy(process.env.FINAPP_API_UPSTREAM || 'http://127.0.0.1:8081'));

// Rate limiting for file access routes
const fileAccessLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many file access attempts, please try again later.'
});

const landingDir = path.join(__dirname, 'build', 'landing');
const dashboardDir = path.join(__dirname, 'build', 'dashboard');

// Redirect /something.html -> /something (and /index.html -> /)
// Skips /dashboard so the React app's own files are untouched
app.use((req, res, next) => {
  if (req.path.startsWith('/dashboard')) return next();
  if (!req.path.endsWith('.html')) return next();

  let clean = req.path.replace(/\.html$/, '');
  if (clean.endsWith('/index')) clean = clean.slice(0, -'index'.length);
  if (clean === '') clean = '/';

  // Sanitize the redirect URL to prevent open redirect vulnerabilities
  if (!clean.startsWith('/')) {
    // If the path doesn't start with '/', it's likely malicious
    return res.status(400).send('Invalid redirect path');
  }

  // Additional validation: check for protocol or other malicious patterns in clean path
  if (clean.includes('://') || clean.includes('\\') || clean.includes('../')) {
    return res.status(400).send('Invalid redirect path');
  }

  const query = req.url.slice(req.path.length); // preserve ?query=string
  res.redirect(301, clean + query);
});

// Static landing page at /
// `extensions` lets /about serve about.html without the suffix
app.use(express.static(landingDir, { extensions: ['html'] }));

// React dashboard at /dashboard
app.use('/dashboard', express.static(dashboardDir));

// SPA fallback: any /dashboard/* route returns the React app's index.html
// so client-side routing (React Router) works on refresh/deep links
app.get('/dashboard/*splat', fileAccessLimiter, (req, res) => {
  res.sendFile(path.join(dashboardDir, 'index.html'));
});

// Landing page index (explicit, in case static middleware is bypassed)
app.get('/', fileAccessLimiter, (req, res) => {
  res.sendFile(path.join(landingDir, 'index.html'));
});

// Custom 404 handler
app.use(fileAccessLimiter, (req, res) => {
   res.status(404).sendFile(path.join(landingDir, '404.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
