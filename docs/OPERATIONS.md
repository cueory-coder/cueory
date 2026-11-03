# Operations

This page is the recovery index for Cueory. It contains no credentials or private infrastructure settings.

## Website release rollback

If a live release breaks the site, follow the rollback steps in [SETUP.md](SETUP.md#if-a-release-breaks-the-live-site-2-minutes). That procedure restores the previously served Cloudflare version without changing the GitHub branches. A rollback is temporary: fix the cause in a new pull request through `staging` before releasing again.

## Database backups and restoration

[SECURITY.md](../SECURITY.md) records that the production database is dumped nightly and encrypted before storage. The repository does not yet contain the provider-specific restoration procedure, backup location, or credentials.

Do not improvise a production restore from this repository. Christian must approve the restoration, confirm the backup and target project, and document the verified procedure here before it is used. Until then, database changes continue to follow the staging-first and approval rules in [AGENTS.md](../AGENTS.md) and [CLAUDE.md](../CLAUDE.md).
