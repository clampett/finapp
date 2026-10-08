const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

const landingDir = path.join(__dirname, 'build', 'landing');
const dashboardDir = path.join(__dirname, 'build', 'dashboard');

// Static landing page at /
app.use(express.static(landingDir));

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