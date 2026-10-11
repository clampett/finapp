const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

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
app.get('/dashboard/*splat', (req, res) => {
  res.sendFile(path.join(dashboardDir, 'index.html'));
});

// Landing page index (explicit, in case static middleware is bypassed)
app.get('/', (req, res) => {
  res.sendFile(path.join(landingDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});