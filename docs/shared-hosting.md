# One shared development server

Everyone signs into the same FinApp backend with the existing development account:

- Username: `testuser`
- Password: `test123`

This is an intentionally shared class testing account, not an administrator or database credential. The existing account has already been migrated to the hosted database; do not reset its password or create another independent database.

## What teammates do

Open the hosted FinApp URL and sign in. No Neon membership, hosting account, Docker, Java installation, database password, or `.env` is needed.

For frontend development, pull the repository and run `./start.ps1`. It installs missing npm dependencies, builds the landing pages/dashboard, and serves them at http://localhost:8080. Express proxies `/api` to the public server URL in `shared-backend.json`. The URL is safe to commit; database settings are not. Authentication cookies remain on the browser's frontend origin. Scenario edits currently remain browser drafts, even when everyone uses the same login.

The initial public URL is deliberately empty until a real deployment exists. Startup explains this instead of pretending a server has been deployed. Once the owner fills it in and publishes that change, teammates need no setup beyond pulling the code.

## One-time owner deployment on Render Free

1. Create a Render account using GitHub at https://dashboard.render.com/register. Do not add a payment method or select a paid plan.
2. Publish the reviewed deployment changes to a GitHub branch. Render builds repository contents; uncommitted local files are not available there.
3. In Render, create a Blueprint from that branch and its root `render.yaml`. Verify the only resource is the **Free** web service `finapp-team-dev`. There is no Render database, paid disk, private service, or second compute instance in this blueprint.
4. Enter the three existing `SPRING_DATASOURCE_*` values from the owner's private `.env` into Render's environment settings. This is done once on the server, not distributed to teammates. Keep the Neon database and its current users. Never put these values in GitHub or `shared-backend.json`.
5. Deploy and wait for `/api/v1/health` to return HTTP 200. Open the public HTTPS URL and sign in as `testuser` / `test123`; check a simulation too.
6. Put the actual public origin (for example the URL assigned by Render, with no `/api` suffix) into `shared-backend.json` as `url`, then publish that nonsecret configuration change. Teammates pull it and run `./start.ps1`, or use the hosted site directly.

The root Dockerfile builds all three existing services into one image. Only Express's `PORT` is public; Java and Python listen on container loopback. Database credentials are injected into server processes. Child process failure stops the instance so the host can restart it. No data is persisted on the ephemeral hosting filesystem.

The blueprint disables automatic deployments so changes do not modify the shared server without an explicit deploy. Choose the intended source branch in Render. Existing `testuser` credentials were verified against the shared database before this hosting change; public deployment still requires the final hosted login check above.

## Free-plan behavior

Render Free services sleep after 15 minutes without traffic and can take time to wake up. The login request allows 90 seconds for a cold start. The Free workspace allowance is shared across free services; keep this to one service and do not enable keep-alive automation. Do not upgrade if a limit is reached. See https://render.com/docs/free.

The image is sized for a 512 MB instance, but the hosted environment must still be checked under actual workload. If a free allowance is exhausted, service can be temporarily unavailable; paid capacity is not enabled automatically by this project. Neon remains on its separate Free plan.

## Owner/backend development

`./start.ps1 -Mode local` runs the full isolated stack using the protected local Docker volume. Its users are local, as expected.

`./start.ps1 -Mode server` runs Java/Python locally against the owner's configured shared database and streams Spring Boot logs. This advanced path uses the owner's existing private `.env`; teammates using the shared backend do not use it.

The old graph bulk-save API lacks ownership validation and is blocked on the shared server. The dashboard's existing node editing/export/import/browser draft functionality is retained. Public seeded demos still work; private workspace reads require a valid session and the matching user ID. Full server-side graph editing remains separate work.

New registrations retain the current email verification flow. Mock verification codes are in the owner's server logs, so the existing shared test login is the intended class development path until real email delivery is configured.
