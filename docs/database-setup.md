# Database ownership and backups

The database belongs to the shared backend. Teammates connect to FinApp with `testuser` / `test123`; they do not connect to PostgreSQL or need Neon invitations. See [shared hosting](shared-hosting.md) for the intended development workflow.

Flyway versions schema and seed data. It does not synchronize accounts between separate local databases. The existing local database was backed up and migrated to the `finapp-team-dev` hosted project, `team-dev` branch, `finapp` database. IDs and password hashes were preserved; all 11 user records and the other tables matched the local source at migration time.

## Owner-only server configuration

Only the backend owner configures `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, and `SPRING_DATASOURCE_PASSWORD` in the hosting provider's secret settings. The owner may keep a private root `.env` for local backend maintenance with `./start.ps1 -Mode server`. Preserve the existing URL and database; do not create a new database just to fix a failed login.

Use the direct PostgreSQL hostname and `sslmode=require` or stronger. Flyway runs on this connection, so it must not be a transaction-pooler URL. The application uses a small Hikari pool. `.env`, `.neon`, and backups are ignored by Git. The public API origin in `shared-backend.json` is safe to commit and contains no database credentials.

## Backups

On the owner's configured computer, run `./backup-db.ps1` for the shared database. For an intentionally isolated local source, start its database and use `./backup-db.ps1 -DatabaseMode local`. The scripts write custom-format PostgreSQL backups to ignored `backups/`, with a SHA256 sidecar for new backups. Backups contain private account data and password hashes. Retain a private off-device copy and periodically verify recovery.

## Initial import and recovery

`./scripts/Import-LocalDatabase.ps1 -BackupFile ./backups/YOUR_BACKUP.dump` imports into a NEW EMPTY shared database only. It refuses populated destinations and restores in one transaction without dropping objects. It is not a merge tool and must not be rerun against the active shared database. A laptop's separate old local accounts need an explicit conflict-aware merge if they must be retained.

For recovery, restore to a new empty database, verify it, and then change the server's private connection settings. Do not overwrite the active shared database to test a backup. Stop source writes while taking the final migration snapshot. Schema changes belong in new Flyway migrations; Flyway clean is disabled.

## Docker and durability

The hosted database is outside Docker. `docker compose down -v` on a teammate's machine cannot remove it. Local mode (`./start.ps1 -Mode local`) deliberately uses an independent database and a protected external `finapp_postgres_data` volume. Compose does not remove that volume with `down -v`, but explicit volume deletion/pruning or disk failure still can. The historical backend Compose entry point includes the root file so it does not create a second hidden database.

Keep the existing Neon Free plan and do not enable billing. Hosting does not make records permanent or immune to owner deletion, SQL changes, provider policies, or account loss. Backups remain necessary. Scenario drafts are currently browser-local and are separate from stored application accounts.

## Agent tooling

The requested official Neon and Neon Postgres skills remain installed under `.agents/skills/`. `.codex/config.toml` contains a project-scoped OAuth MCP URL, without an API key. This optional tooling is for the backend owner/coding agent; it is not required for teammates to sign into FinApp. The CLI's gitignored `.neon` context and existing owner configuration are preserved.