# Security Policy

## Reporting a vulnerability

Email **security@aexy.io**. Please do not open a public issue, and please do
not post it in a discussion thread.

Include enough to reproduce it: the affected endpoint or page, the version or
commit, what an attacker gets, and the request that demonstrates it. If you
have a patch, send it — but send the report first.

You will get an acknowledgement, an assessment of severity, and a fix or an
explanation of why we disagree. Once a fix ships, the changelog entry says what
was wrong; tell us if you want to be credited by name and we will.

## Supported versions

Aexy is developed on `main` and released continuously — see
[CHANGELOG.md](CHANGELOG.md). Fixes land on `main`, and there are no backports
to older tags. If you self-host, staying close to `main` is the security
posture.

## Self-hosting: the settings that matter

If you run your own instance, these are the ones that turn a working install
into an exposed one.

- **`SECRET_KEY`** signs every JWT. The default is
  `dev-secret-key-change-in-production`, and anyone who knows it can mint a
  token for any user. Generate one with `openssl rand -hex 32`.
  `docker-compose.prod.yml` refuses to start without it set.
- **`AEXY_DEMO_LOGIN`** publishes one shared account whose password is in the
  environment. It is off by default and on in `docker-compose.yml` for local
  development. Do not enable it on a deployment holding real data; for a
  deliberately public demo, set your own `AEXY_DEMO_PASSWORD`. While it is on,
  outbound email is refused at both send paths and the demo workspace keeps AI
  and the email-marketing module switched off — so a visitor cannot mail
  strangers from your domain or spend your token budget.
  `AEXY_DEMO_ALLOW_OUTBOUND_EMAIL=true` lifts the email block; only set it for a
  box whose provider is a local catcher such as the bundled Mailpit.
- **Database and Redis** should not be reachable from the internet. The
  development compose file publishes their ports for convenience;
  `docker-compose.prod.yml` is the one to deploy.
- **`OAUTH_EXTRA_REDIRECT_HOSTS`** widens the allowlist that post-OAuth tokens
  can be delivered to. Add only origins you control — the allowlist is what
  stops a crafted `redirect_url` from exfiltrating a freshly minted JWT.
- **Object storage** holds uploaded attachments and is served through presigned
  URLs. A bucket left publicly listable exposes every attachment in every
  workspace.

## What is in scope

The code in this repository, and `aexy.io` / the hosted product.

Out of scope: findings that require a compromised host or database, reports
against a fork or a modified deployment, missing headers with no demonstrated
impact, and automated scanner output with no proof of exploitability.
