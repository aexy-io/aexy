# Reports

The custom report builder. Distinct from `analytics.md`, which documents
Insights — pre-built engineering dashboards over a fixed model. Reports is the
one where the *user* defines the question.

Routes: `/reports`, `/reports/[id]`, `/reports/monthly`, and `/exports` — which
is the `exports` module of this app living at a top-level path.
`api/reports.py` (15 endpoints), `api/exports.py`.

## Mental model

- **Report** — a saved definition: a source, filters, groupings, columns and a
  visualisation. Stored, versioned by edit, and owned by a workspace.
- **Running** a report is a separate act from saving one. `POST
  /{report_id}/data` executes the definition and returns rows; the definition
  itself is immutable during the run.
- **Template** — a starting definition shipped with the product.
  `GET /templates/list`, then `POST /templates/{id}/create` to fork one into a
  report you own. Templates are read-only; the fork is yours.
- **Schedule** — a report plus a cadence plus recipients. Runs on Temporal, and
  delivers whether or not anyone opens the app.

## API

    GET    /                          list reports
    POST   /                          create
    GET    /{id}                      read the definition
    PUT    /{id}                      replace it
    DELETE /{id}
    POST   /{id}/clone                copy, including filters
    POST   /{id}/data                 run it, return rows
    GET    /templates/list
    POST   /templates/{id}/create     fork a template
    GET    /schedules/list
    POST   /{id}/schedules            schedule this report
    PUT    /schedules/{schedule_id}
    DELETE /schedules/{schedule_id}
    GET    /engineering/monthly       the fixed monthly engineering report

`POST` for running a report rather than `GET` because the filter payload is a
body, not a query string — filter sets get large enough to hit URL limits, and
putting them in the URL would also put them in every access log.

## The monthly engineering report

`GET /engineering/monthly` is not a custom report — it is a fixed one, rendered
at `/reports/monthly`. It exists because the same numbers were being rebuilt by
hand every month.

## Exports

`api/exports.py` covers the bulk-extract path: a report, or a raw entity list,
as a file. Long-running exports go through Temporal and land in object storage
rather than streaming from the request, so a large export survives a deploy.
See `guides/file-uploads.md` for how the storage layer works.

## Common pitfalls

- **A cloned report does not follow its source.** `POST /{id}/clone` copies the
  definition once. Editing the original afterwards changes nothing downstream.
- **Schedules outlive their report's permissions.** A schedule keeps delivering
  to its recipient list; it is not re-checked against what those recipients can
  see in the app. Treat the recipient list as the access-control decision.
- **`/exports` is part of Reports.** It is mapped in `SIDEBAR_TO_APP_MAP` to
  the `reports` app, so hiding Reports hides it. It does not look like it from
  the URL.
