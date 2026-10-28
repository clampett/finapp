const landingDir = path.join(__dirname, 'build', 'landing');
const dashboardDir = path.join(__dirname, 'build', 'dashboard');

// Build an allowlist of redirect targets from the landing files that actually exist.
// Maps the "clean" request path -> canonical route, e.g.
//   "/about"      -> "/about"
//   "/"           -> "/"            (from index.html)
//   "/blog/"      -> "/blog/"       (from blog/index.html)
function collectLandingRoutes(dir, prefix = '', routes = new Map()) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return routes; // landing dir missing (e.g. build not run yet)
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      collectLandingRoutes(path.join(dir, entry.name), `${prefix}/${entry.name}`, routes);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      const base = entry.name.slice(0, -'.html'.length);
      const route = base === 'index' ? `${prefix}/` : `${prefix}/${base}`;
      routes.set(route, route);
    }
  }
  return routes;
}
const landingRoutes = collectLandingRoutes(landingDir);

// Rate limiter for the .html -> clean URL redirect route
const htmlRedirectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,               // limit each IP to 100 requests per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Too many requests, please try again later.',
});

// Redirect /something.html -> /something (and /index.html -> /)
// Skips /dashboard so the React app's own files are untouched.
// Using app.get with a regex (instead of a global app.use) means the limiter
// only applies to .html requests, not to every request the server handles.
app.get(/\.html$/, htmlRedirectLimiter, (req, res, next) => {
  if (req.path.startsWith('/dashboard')) return next();

  let clean = req.path.replace(/\.html$/, '');
  if (clean.endsWith('/index')) clean = clean.slice(0, -'index'.length);
  if (clean === '') clean = '/';

  // The redirect path comes from our own allowlist, never from the request itself.
  const safePath = landingRoutes.get(clean);
  if (!safePath) {
    return res.status(400).send('Invalid redirect path');
  }

  // Rebuild query string from parsed query parameters instead of slicing raw URL
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query || {})) {
    if (Array.isArray(value)) {
      for (const v of value) {
        if (typeof v === 'string') queryParams.append(key, v);
      }
    } else if (typeof value === 'string') {
      queryParams.append(key, value);
    }
  }
  const query = queryParams.toString();

  // Defense in depth: validate the final target too
  const redirectTarget = query ? `${safePath}?${query}` : safePath;
  if (!isSafeLocalRedirectTarget(redirectTarget)) {
    return res.status(400).send('Invalid redirect path');
  }

  res.redirect(301, redirectTarget);
});
