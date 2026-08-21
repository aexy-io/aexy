-- Put the ticket link into service desk email copy that Ops has already edited.
--
-- The receipt, closure and digest carry a link now (`{{ticket_url}}` for the
-- requester's read-only view, `{{desk_url}}` for the desk queue). That lives in
-- the built-in default copy, which is what a workspace renders until somebody
-- customises a template — at which point an `email_templates` row exists and the
-- default is never consulted again.
--
-- So without this, the desks that have taken the trouble to write their own copy
-- are exactly the ones whose mail stays a dead end. Nothing else in the change
-- needs a backfill: every other new setting resolves from an absent key.
--
-- This does NOT start publishing anything. The requester-facing link is behind
-- `service_desk.public_ticket_links_enabled`, which is off until a workspace
-- turns it on; with it off `{{ticket_url}}` renders empty and the `{% if %}`
-- around it drops the sentence, so every row this touches keeps sending exactly
-- what it sends today. The block is put in place now so that switching the
-- setting on is all it takes — a customised template would otherwise have to be
-- hand-edited before the setting did anything, which is a trap.
--
-- Two deliberate choices:
--
--   * The block is APPENDED, never spliced. Ops copy has no structure this can
--     rely on — there may be no "Regards," to insert above, and guessing at a
--     position would rewrite somebody's message in a way they did not ask for.
--     It reads as a footer, and it can be moved from the settings page.
--   * The whole sentence is inside `{% if %}`, matching the default copy. A
--     ticket whose share link was revoked, or a deployment that could not mint
--     one, must not send a label with nothing after it.
--
-- Re-running is a no-op: each statement skips rows that already name the
-- variable. Idempotent on purpose — the runner tracks checksums, but a desk
-- restored from a backup taken mid-upgrade should not end up with the block
-- twice.

-- ---------------------------------------------------------------- receipt

UPDATE email_templates
   SET body_text = COALESCE(body_text, body_html) || $link$

{% if ticket_url %}You can track this request here:
{{ticket_url}}
{% endif %}$link$,
       body_html = body_html || $link$

{% if ticket_url %}You can track this request here:
{{ticket_url}}
{% endif %}$link$
 WHERE slug = 'service_desk_receipt'
   AND COALESCE(body_text, body_html) NOT LIKE '%ticket_url%'
   AND body_html NOT LIKE '%ticket_url%';

-- ---------------------------------------------------------------- closure

UPDATE email_templates
   SET body_text = COALESCE(body_text, body_html) || $link$

{% if ticket_url %}The full history of this ticket is here:
{{ticket_url}}
{% endif %}$link$,
       body_html = body_html || $link$

{% if ticket_url %}The full history of this ticket is here:
{{ticket_url}}
{% endif %}$link$
 WHERE slug = 'service_desk_closure'
   AND COALESCE(body_text, body_html) NOT LIKE '%ticket_url%'
   AND body_html NOT LIKE '%ticket_url%';

-- ----------------------------------------------------------------- digest
-- The queue, not a link per row: fifteen URLs in a fifteen-row digest is a
-- wall, and the reader is a colleague who wants the board.

UPDATE email_templates
   SET body_text = COALESCE(body_text, body_html) || $link$

{% if desk_url %}Open the desk: {{desk_url}}
{% endif %}$link$,
       body_html = body_html || $link$

{% if desk_url %}Open the desk: {{desk_url}}
{% endif %}$link$
 WHERE slug = 'service_desk_digest'
   AND COALESCE(body_text, body_html) NOT LIKE '%desk_url%'
   AND body_html NOT LIKE '%desk_url%';

-- ------------------------------------------------------------- variables
-- The settings page lists tokens from the code definition, so it already offers
-- the new one. The row's own list is what `render_template` reads for defaults,
-- and a row that does not declare the variable falls back to Jinja's undefined
-- rather than "". Both are falsy for the `{% if %}` above, so this is tidiness
-- rather than a fix — but a row whose declared variables disagree with the copy
-- it holds is a trap for whoever edits it next.

UPDATE email_templates
   SET variables = variables || '[{"name": "ticket_url", "default": ""}]'::jsonb
 WHERE slug IN ('service_desk_receipt', 'service_desk_closure')
   AND NOT (variables @> '[{"name": "ticket_url"}]'::jsonb);

UPDATE email_templates
   SET variables = variables || '[{"name": "desk_url", "default": ""}]'::jsonb
 WHERE slug = 'service_desk_digest'
   AND NOT (variables @> '[{"name": "desk_url"}]'::jsonb);
