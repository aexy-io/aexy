# Bimaplan local Gmail, DeepSeek, and SMTP setup

This guide is specific to `/Users/sameer/Projects/aexy-bimaplan` and the local Docker stack exposed at `http://localhost:3000`.

## What has already been configured

- The canonical PostgreSQL image is PostgreSQL 17, matching the preserved local database volume.
- Both the backend and Temporal worker load `backend/.env` through Docker Compose.
- The frontend loads `frontend/.env` and remains available at `http://localhost:3000`.
- Local fallback email uses Mailpit at `http://localhost:8025`, so local tests cannot accidentally email real people through SMTP.
- DeepSeek uses `deepseek-chat` first and `deepseek-reasoner` as the same-key fallback, so a second model-provider key is unnecessary.
- The existing `august@capbumpy.in` Service Desk mailbox is linked to its matching Google integration as `gmail_sync` in the `Test T2` workspace.

## Values required on a fresh local setup

Open `backend/.env` and populate these values if they are missing:

```dotenv
GOOGLE_CLIENT_ID=<your Google OAuth web client ID>
GOOGLE_CLIENT_SECRET=<your Google OAuth web client secret>
DEEPSEEK_API_KEY=<your DeepSeek API key>
```

Do not paste these secrets into `frontend/.env`. Anything prefixed with `NEXT_PUBLIC_` is deliberately visible to the browser and therefore must never contain a secret.

## Google Cloud configuration

1. Open the Google Cloud project that owns the OAuth client used for `august@capbumpy.in`.
2. Enable the Gmail API under **APIs & Services → Library**.
3. Configure the OAuth consent screen and add `august@capbumpy.in` as a test user while the application remains in testing mode.
4. Add these Gmail scopes to the consent configuration:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.modify
```

5. Use a **Web application** OAuth client and add both authorized redirect URIs exactly:

```text
http://localhost:8000/api/v1/auth/google/callback
http://localhost:8000/api/v1/integrations/google/callback
```

6. Adding `http://localhost:3000` as an authorized JavaScript origin is safe for local UI use, although the Gmail authorization callback itself is handled by the backend.
7. Copy the resulting client ID and client secret into the matching empty `backend/.env` values.
8. The refresh token already stored locally was issued to a particular OAuth client. If you insert credentials for a different client, disconnect and reconnect Google rather than expecting that old refresh token to work.

## DeepSeek configuration

1. Create one DeepSeek API key and place it in `DEEPSEEK_API_KEY` inside `backend/.env`.
2. Keep these values unchanged unless a later test demonstrates a reason to change them:

```dotenv
LLM_PROVIDER=deepseek
LLM_MODEL=deepseek-chat
DEEPSEEK_FALLBACK_MODELS=deepseek-reasoner
```

3. Both DeepSeek models use the same API key. The fallback helps when one model rejects or cannot complete a request, but it does not protect against a complete DeepSeek provider outage.
4. If both model attempts fail, the safe product behaviour should be manual review rather than silently inventing a classification.

## Local SMTP and Mailpit configuration

Keep these values for safe local testing:

```dotenv
EMAIL_PROVIDER=smtp
EMAIL_NOTIFICATIONS_ENABLED=true
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_USE_TLS=false
SMTP_USE_SSL=false
SMTP_SENDER_EMAIL=service-desk@aexy.local
SMTP_SENDER_NAME=Aexy Service Desk (Local)
```

Mailpit catches every SMTP message inside Docker and displays it at `http://localhost:8025`. It does not deliver those fallback messages to the public internet.

The Service Desk Gmail route is separate from SMTP. Once the mailbox is linked and Gmail OAuth works, Service Desk receipts and replies prefer the Gmail API. Mailpit remains the safe fallback for generic application notifications and for Gmail-route failures during local testing.

## Optional real Gmail SMTP fallback

Do not use this optional block during ordinary development. It causes generic fallback messages to leave the laptop and reach real recipients.

If real SMTP fallback is explicitly required later, enable two-step verification for `august@capbumpy.in`, create a Google app password if the Workspace policy permits it, and change only these values:

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=august@capbumpy.in
SMTP_PASSWORD=<Google app password, not the normal account password>
SMTP_USE_TLS=true
SMTP_USE_SSL=false
SMTP_SENDER_EMAIL=august@capbumpy.in
SMTP_SENDER_NAME=Bimaplan Operations
```

The Gmail API configuration already supports real inbound sync and real replies, so Gmail SMTP is normally redundant and should remain disabled.

## Frontend configuration

`frontend/.env` should contain exactly the local, non-secret connection values below:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_SITE_URL=http://localhost:3000
INTERNAL_API_URL=http://backend:8000/api/v1
NEXT_PUBLIC_STRIPE_ENABLED=false
NEXT_PUBLIC_GTM_API_URL=http://localhost:8000/api/v1
```

No Gmail, SMTP, DeepSeek, OAuth, or database secrets belong in the frontend file.

## Restart after entering the three secrets

Run these commands from `/Users/sameer/Projects/aexy-bimaplan`:

```bash
cd /Users/sameer/Projects/aexy-bimaplan
docker compose -p aexy config --quiet
docker compose -p aexy up -d --no-build --force-recreate backend temporal-worker
docker compose -p aexy ps
```

The explicit `-p aexy` preserves the current `aexy_postgres_data` named volume. Rebuilding is unnecessary for an environment-only change because Compose recreates the affected containers. Use `docker compose -p aexy up -d --build` after code or dependency changes.

Do not run `docker compose -p aexy down -v`, because the `-v` option deletes the preserved PostgreSQL data volume.

## Application-side Gmail verification

1. Sign into Aexy as a member of the `Test T2` workspace, because the existing Google integration and `august@capbumpy.in` mailbox belong there.
2. Open `http://localhost:3000/crm/settings` and confirm the connected Google address is `august@capbumpy.in`.
3. Confirm Gmail sync is enabled, then run **Sync now** once after adding the OAuth client credentials.
4. If the page reports an expired or invalid grant, disconnect Google and reconnect `august@capbumpy.in` using the configured OAuth client.
5. Open `http://localhost:3000/service-desk/settings` and confirm the mailbox row shows `august@capbumpy.in`, channel `gmail_sync`, and an active state.
6. The Chrome account currently observed in `Alex's Worksspace` is a different workspace and will correctly show no `Test T2` mailbox data.

## Production-like inbound test order

1. Send a uniquely titled email from a separate test sender to `august@capbumpy.in`; never send the first test from August back to August.
2. Run Gmail **Sync now** or wait for the `check-gmail-auto-sync` Temporal schedule.
3. Confirm one synchronized email appears in the CRM inbox and one Service Desk ticket is created.
4. Confirm the sender, subject, body, mailbox, partner, assigned KAM, request type, line of business, priority, severity, and source message identifier are persisted.
5. Run sync again without changing Gmail and confirm the same message does not create a duplicate ticket.
6. Reply inside the same Gmail thread and confirm it updates or reopens the existing ticket rather than creating an unrelated ticket.
7. Send a two-issue message and confirm separate issue records or linked tickets preserve one shared conversation context.
8. Send a message containing more than two issues and confirm the fallback creates a manual-review parent while retaining every detected issue in the audit data.
9. Test an unknown partner sender and confirm the message remains visible for manual mapping rather than disappearing or receiving a fabricated partner.
10. Test an attachment with a spreadsheet header plus three sample rows, confirming the classifier uses only the bounded preview rather than reading the entire workbook.
11. Confirm KAM users see only assigned tickets while Operations Lead and Operations Head users see the complete workspace view.
12. Confirm failed Gmail delivery falls back visibly, records the failure reason, and does not repeatedly email the Service Desk mailbox itself.

## Health and troubleshooting commands

```bash
curl http://localhost:8000/api/v1/health
curl http://localhost:8001/health
curl -I http://localhost:3000/service-desk/settings
open http://localhost:8025
open http://localhost:8080
docker logs --tail 200 aexy-backend
docker logs --tail 200 aexy-temporal-worker
```

Expected local ports are frontend `3000`, backend `8000`, mailagent `8001`, PostgreSQL `5432`, Mailpit SMTP `1025`, Mailpit UI `8025`, Temporal `7233`, and Temporal UI `8080`.

If Gmail synchronization still fails after the restart, check the worker log for `invalid_client`, `invalid_grant`, or missing-scope errors. `invalid_client` means the client ID or secret is wrong, `invalid_grant` usually means the stored refresh token belongs to another OAuth client or was revoked, and a missing-scope error means Google authorization must be repeated with all three Gmail scopes.
