# Local development database

Run `./start.ps1` from the repository root. Docker provides PostgreSQL 15 on localhost:5432, database finapp, local role/password postgres/postgres. Spring Boot uses the local profile and seeds testuser / test123 with BCrypt and a Recent Grad example graph. Existing data is reused. No .env, Neon account, or Render service is required.

Each developer has a separate copy of the database. Account creation and verification happen on the same machine: copy the CODE printed under [SPRING] into the verification page. Console mode never attempts SMTP. Use the resend button for an expired code; sign in again to resume a closed verification page.

Data is stored in the external Docker volume finapp_postgres_data. Compose down -v does not remove this volume. Explicitly deleting it or losing the disk still loses data. While the DB is running, use `./backup-db.ps1 -DatabaseMode local`; keep a private copy of backups elsewhere. Existing backups and hosted data have been retained.

Use new Flyway migrations for schema changes; do not edit already-applied migrations. Development fixtures live in LocalDevelopmentData.java and run only with the local Spring profile. They preserve existing testuser data; a password conflict is reported instead of overwriting an account. Set FINAPP_DEV_SEED_USER=false in the shell to disable the fixture.

Scenario edits currently live in browser localStorage, not PostgreSQL. Share feature code through Git and scenario examples through JSON export/import. A shared username does not sync data between machines.

Legacy shared-database backup utilities remain available explicitly for recovery; local startup never selects hosted settings from the old .env.
