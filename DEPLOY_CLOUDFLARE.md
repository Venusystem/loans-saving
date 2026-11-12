# Cloudflare Pages + D1 (online-only pilot)

1. Create the Cloudflare Pages project from this repository (main after merging PR), framework **None**, build command blank, output directory **.**.
2. Cloudflare Pages > Settings > Bindings: add **D1 database** binding named **DB** to the existing D1 database `dbb4f79226-01d9-4b70-b811-99496a95ee01`. Set both Production and Preview as appropriate.
3. Run `schema.sql` in D1 > Console (or `npx wrangler d1 execute venus-loans-db --remote --file=schema.sql`).
4. Pages > Settings > Variables and Secrets: set encrypted secrets `ADMIN_PASSWORD` (strong unique password) and `SESSION_SECRET` (at least 32 random characters). Set for Production and Preview as appropriate. Never commit these.
5. Redeploy after binding/secrets; test /api/session returns 401 before login, then sign in with the cloud password.
6. Back up the original browser data using the app's JSON export **before** connecting a new device. After cloud login, if the D1 database is empty, choose **Import backup** and select the original exported `.json` file. The app displays customer and loan counts for confirmation. Import is blocked once cloud state exists. Do not upload backups to GitHub.
7. Set custom domain `saving.venusdatasystems.com`.

## Important limitations
This is a **single-admin, whole-document optimistic-concurrency pilot**, not a production financial ledger. Concurrent edits return 409 rather than silently overwrite; the affected user must reload, and any uncommitted changes may need re-entry. Writes are not independently atomic at the business transaction level; no server-side role permissions or per-transaction accounting rules. Deploy only with test data until normalized tables, server-side validation, proper user identities, rate limiting, and immutable financial transaction journal are implemented. Cloudflare Pages Functions require a Functions-compatible deployment (Git integration or Wrangler). Existing in-app PIN is **not** server authentication.

Cloud D1 is the authority. No automatic localStorage loading or background syncing is enabled. Browser JSON export remains available for backup.

## Deployment status
Code only. A successful Cloudflare deployment, D1 binding, secrets, schema execution, authentication, and real multi-device tests have NOT been verified. Do not use for real financial transactions until these checks and production security hardening are completed.
