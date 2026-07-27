# Aexy CRM Automations — End-to-End Test Guide

One realistic business scenario, run in order. Every step is something a real
B2B company actually does. Nothing here is a contrived "link two records to see
if linking works" test.

**The business:** a B2B software company running inbound lead handling. A
prospect fills in a form on the website. The company wants that lead scored,
attached to the right company, routed by deal size, owned by a person, followed
up by email and SMS, tracked for engagement, and pushed to their external
system. Junk gets removed.

Every capability you asked about falls naturally out of that one story.

---

## Phase 0 — Foundation data (do this first, once)

Nothing works without something to attach records to.

1. Open **Companies** and create one real-looking company:
   - Name: `Northwind Logistics`
   - Domain: `northwind-logistics.com`
   - *Why:* a contact with no company is not a lead, it's a name. Linking needs
     a real other end.

2. Confirm your **Person** object has these fields (it does):
   Name, Email, Phone, Title, LinkedIn, Stage. Confirm **Deal** has: Name,
   Value, Stage, Probability, Expected Close, Primary Contact.

3. Confirm you have a second workspace member. If not, invite one now — you
   need it for the ownership and permission steps in Phase 6.

4. Keep two tabs open the whole time: the app, and `localhost:8025` if you are
   on the local mail catcher. If you are on Brevo, keep your Gmail open instead.

---

## Phase 1 — Inbound capture (Forms) → tests (d)

*Business reason:* leads arrive from the website, not by hand.

5. Create a form with fields mapping to Person: name, email, phone, title.
   Link it to the **Person** object so a submission creates a record.
6. Build an automation: trigger **Form Submitted**, action **Send Email** to
   yourself, subject `New enquiry from {{record.values.name}}`.
7. Publish it. Submit the form as a visitor would.
8. **Expected:** a Person record appears with the submitted values, a run
   completes, and the email arrives with the real name in the subject.
9. **Failure case:** submit the form with the email field empty. Expected: the
   run either skips or fails with a readable reason — it must never send an
   email addressed to nothing.

*Status note: forms are wired end to end in code but have not been driven
live. Treat this phase as unverified until it is completed.*

---

## Phase 2 — Qualification (AI Agents) → tests (a), US-5.2, US-5.3

*Business reason:* a human should not read every inbound lead.

10. Build: trigger **Record Created** on Person → **AI Agent** node →
    **Send Email**.
11. On the agent node choose **Lead Scoring**. Note the **Output variable**,
    default `agent_result`.
12. In the email body put exactly:
    `{{variables.agent_result.output.content}}`
13. Publish. Create a Person with a *real-sounding* title such as
    `VP Manufacturing` and a real company email.
14. **Expected:** run completes in 12–16 seconds. The agent step's **View
    result** shows a score out of 100 and reasoning that explicitly references
    the title you typed. The email contains that analysis. **US-5.2 proven.**

### US-5.2 deeper — output actually flowing onward
15. Add a second agent, **Email Drafter**, after the first, output variable
    `draft`. Put both `{{variables.agent_result.output.content}}` and
    `{{variables.draft.output.content}}` in the email.
16. **Expected:** both appear. This proves agent output is available to
    *everything* downstream, not just the next node.

### US-5.3 — agent failures (all four)
17. **Missing agent:** add an AI Agent node, pick nothing, try to Publish.
    Expected: refused, red error on the node reading "An existing active agent
    must be selected".
18. **Deactivated agent:** deactivate an agent, then trigger an automation that
    uses it. Expected: run **failed** with the message
    `Agent <name> is not active` — not a generic wrapper message.
19. **Unresolvable input:** in Execution settings add input `contact_email` with
    context path `record.values.nonsense`. Expected: run fails naming the input
    it could not resolve.
20. **Timeout:** set Timeout to `5` seconds. The agent needs 12–16. Expected:
    the step fails on time rather than hanging or falsely succeeding.
21. **Dry run honesty:** press **Test** rather than Publish. Expected: it tells
    you the agent was not really executed rather than pretending it was.

---

## Phase 3 — Routing by deal size (Branch) → tests (e) partly

*Business reason:* a £250k deal and a £3k deal must not get the same treatment.

22. Create a Deal for Northwind with Value `250000`.
23. Build: trigger **Record Created** on Deal → **Branch**:
    - Rule 1: Value greater than `100000` → label "Enterprise"
    - Rule 2: Value greater than `10000` → label "Mid-market"
    - Final path: mark it **Else**
24. On the Enterprise path: **Assign Owner** to your senior rep, then
    **Create Task** titled `Call {{record.values.name}} within 2 hours`.
    On Mid-market: **Send Email** only. On Else: **Create Task** to nurture.
25. Publish. Create three Deals at `250000`, `45000`, `3000`.
26. **Expected:** three runs, each taking exactly one path. Each branch step
    names the rule index and path label. Enterprise deal gets an owner and an
    urgent task; the small deal gets neither.
27. **Failure case:** add a rule with a nonsense operator. Expected: refused, or
    the run fails loudly — never silently takes the Else path.

---

## Phase 4 — Relationships and ownership (assign / link / delete) → tests (e)

*Business reason:* this is the actual shape of inbound lead handling.

28. Build: trigger **Record Created** on Person →
    **Link Records** (Person → the Company matching their email domain) →
    **Assign Owner** → **Create Task** `Qualify {{record.values.name}}`.
29. Publish. Create a Person with email `priya@northwind-logistics.com`.
30. **Expected:** open that Person after a **page refresh**. The Company shows
    as linked, an owner is set, and the task exists. Refresh matters — a value
    on screen is not proof of persistence.
31. **Deletion, scoped properly:** build trigger **Record Updated** on Person
    with a **Condition** that Stage equals `Disqualified`, then
    **Delete Record**. Publish. Set a junk lead's stage to Disqualified.
32. **Expected:** that record is deleted, and only that one. Then trigger it
    again on the same record. Expected: no error storm, no second deletion.
    *This is why deletion belongs behind a condition, never on a bare trigger.*

---

## Phase 5 — Outreach (Email, SMS, Webhooks) → tests (b), (c), (f)

*Business reason:* reach the prospect and tell your other systems.

33. Extend the Phase 4 automation: after the task, add **Send Email** to
    `{{record.values.email}}`, then **Send SMS**, then **Webhook Call**.
34. SMS: set recipient to the record's **phone field**, message
    `Hi {{record.values.name}}, thanks for your enquiry - we will call shortly.`
35. Webhook: POST to your own endpoint with body containing
    `{{record.values.name}}`, `{{record.values.email}}`, `{{trigger.trigger_type}}`.
36. Set the automation's error handling to **Retry**.
37. Publish. Create a Person with a real E.164 phone (`+91…`) and a real email.
38. **Expected:** email arrives, SMS arrives on the handset, webhook receives a
    POST with rendered values and an `Idempotency-Key` header. The run history
    shows the recipient at the top of each step.
39. **SMS failure case:** create a Person whose phone is `7506985130` (no
    country code). Expected: run fails with
    `SMS recipient must be an E.164 number such as +14155552671`, and nothing is
    sent to the provider.
40. **Webhook failure case:** point the URL at a port with nothing listening.
    Expected: three recorded attempts, run failed, connection error visible on
    each attempt.
41. **Duplicate-prevention case — the important one:** with a working email step
    *before* the failing webhook, count how many emails you receive. Expected:
    **exactly one**, not three. A retry must never re-send a completed step.
42. **Secret safety:** put an `Authorization` header on the webhook. Expected:
    the receiver gets it, and it does **not** appear anywhere in run history.

---

## Phase 6 — Engagement tracking (Email Opened / Clicked)

*Business reason:* follow up with people who showed interest, not everyone.

43. Build: trigger **Email Opened** on Person → **Create Task**
    `They opened - call {{record.values.name}}`.
44. Publish. Trigger the Phase 5 automation so a tracked email is sent.
45. Open that email in your mail client with images enabled.
46. **Expected:** the open is recorded, and the Email Opened automation fires,
    creating the task with the person's real name.
47. **If nothing fires:** your mail client could not reach the tracking server.
    Opens are recorded by *your* server, so a mail client on the internet
    cannot reach `localhost`. Locally you can prove the logic by requesting the
    pixel URL directly. In deployment the tracking domain is public and this
    works naturally.
48. **Clicked:** put a link in the email body and click it. Expected: you land
    on the real destination, and a click is recorded.

---

## Phase 7 — Dynamic values, exhaustively → tests (g), (h), US-6.3, US-6.4

*Business reason:* one template, a thousand personalised messages.

The three namespaces, confirmed against the resolver implementation:

- `{{record.values.<field>}}` — from the record that triggered the run. This is
  90% of real usage.
- `{{trigger.<key>}}` — from the event itself, e.g. `{{trigger.trigger_type}}`
  or which field changed. Information that exists in the moment but is not
  stored on the record.
- `{{variables.<name>}}` — values produced earlier in the same run. This is how
  an AI agent's output reaches a later step, via
  `{{variables.<output_variable>.output.content}}`.
- A placeholder with **no recognised prefix falls back to the record**. Handy,
  but it hides typos — worth knowing.

49. In one email body, include: name (text), email, phone, title, the trigger
    type, and an agent output. Expected: all render; no `{{ }}` survives.
50. On a Deal, render Value (currency), Probability (number), Expected Close
    (date), Stage (status). Expected: each renders as something a human would
    want to read.
51. **Missing path:** use `{{record.values.does_not_exist}}`. Expected: run
    **fails** with an error naming that exact placeholder. It must never send an
    email with a silent gap. **This is US-6.4.**
52. **Wrong variable name:** rename an agent's output variable but leave the old
    name in the body. Expected: same loud failure.
53. **Subject line too:** put a placeholder in the subject. Expected: it renders
    there as well, not just in the body.

---

## Phase 8 — Retry and run limits → US-6.5, US-7.3

54. Set error handling to **Stop** and trigger a failing step. Expected: one
    attempt, run fails immediately.
55. Set to **Continue**, put a working step after a failing one. Expected: the
    later step still runs, the failing step is still recorded failed, and the
    **overall run is still reported failed** — a run containing a failure must
    never claim success.
56. Set to **Retry**. Expected: three bounded attempts on the failing step only,
    each recorded separately.
57. Set a monthly run limit, exceed it. Expected: further runs are refused with
    a clear reason rather than silently dropped.

---

## Phase 9 — Multi-user (admin vs member)

A clarification worth making: **US-5.2 and US-5.3 are about AI agent inputs,
outputs and failures** — Phases 2 above — not about multiple accounts. The
multi-account work is a separate set of admin-reporting checks. So do not
expect Phase 9 to close 5.2 or 5.3; Phase 2 does that.

58. As **admin**, create an automation and assign records to a **member**.
59. Log in as that member. Expected: they see records assigned to them and the
    tasks created for them.
60. Expected: a member cannot publish or delete an automation if your permission
    model reserves that for admins. Confirm which behaviour is intended before
    calling a result a bug.
61. Expected: runs and their history are visible per workspace, and one
    workspace's data never appears in another.

---

## What is already proven versus what you are proving

**Already verified by direct observation:** AI agent execution and output flow, all four
agent failure modes, webhooks with idempotency and secret redaction, task
creation with persistence, branch routing with correct rule selection, durable
waits surviving a worker restart, retry without duplication, real SMS delivery,
real email via Brevo, email-open tracking firing a downstream automation, and
five distinct validation refusals.

**Not yet driven live — these phases are new ground:** forms
(Phase 1), assign/link/delete as a connected journey (Phase 4), click tracking
(step 48), run limits (step 57), and the multi-user checks (Phase 9).

---

## Phase 10 — Manual run for one-off cases (US-2.6)

*Business reason:* a rep needs to fire an onboarding sequence for one customer
who slipped through, without waiting for a trigger or editing a record just to
provoke one.

**Current state:** the backend endpoint exists and works. There is **no button
for it in the interface yet**, so until that is built you exercise it directly.
This phase therefore proves the capability, not the user journey.

62. Open any published automation and copy its id from the address bar.
63. Pick a record the automation applies to and copy its id.
64. In a terminal, fire it manually (replace the three ids):

```bash
curl -X POST "http://localhost:8000/api/v1/workspaces/<WORKSPACE_ID>/automations/<AUTOMATION_ID>/trigger?record_id=<RECORD_ID>" -H "Authorization: Bearer <YOUR_TOKEN>"
```

65. **Expected:** a new run appears in that automation's history and completes
    exactly as if a real trigger had fired — same steps, same evidence.
66. **Expected:** the run is distinguishable as manual rather than silently
    looking like a genuine record event. If it is not, that is worth fixing —
    a manual run that masquerades as organic makes history misleading.
67. **Permission case:** repeat as a non-admin member. Expected: refused. The
    endpoint requires admin, so a member firing production automations by hand
    should be blocked.
68. **Nonexistent record case:** pass a record id that does not exist.
    Expected: a readable refusal, not a run that starts and then fails oddly.

*Verdict to record: US-2.6 is **implemented but not exposed**. It should be
described that way rather than as working, until the button exists.*

---

## Phase 11 — Sequences: manual enrollment (US-3.2)

*Business reason:* a rep meets someone at a conference and wants them in the
nurture sequence now, by hand, not via an automation rule.

69. Open **Sequences** and create a sequence on the **Person** object with two
    or three steps.
70. Open that sequence. **Expected:** a list of eligible Person records with a
    search box, and anyone already enrolled filtered out of it.
71. Enrol one person by hand. **Expected:** the active-enrollment count rises,
    they appear in the enrolled list, and they disappear from the eligible list
    so you cannot double-enrol them.
72. **Double-enrolment guard:** try to enrol the same person again. Expected:
    not possible — they are no longer offered.
73. Un-enrol them. Expected: the counts reverse and they return to the eligible
    list.
74. **Now the automation half:** build an automation with the action **Enrol in
    Sequence** pointing at that sequence, triggered by Record Created. Publish
    it, create a Person. Expected: that person is enrolled automatically, and
    appears in the same enrolled list as the manual one.
75. **Removal half:** build an automation with **Remove from Sequence** behind a
    Condition that Stage equals `Unsubscribed`. Set a person's stage. Expected:
    they are removed, and the counts reflect it.
76. **Expected overall:** manual and automated enrollment land in the same
    place and are indistinguishable afterwards. If they diverge, the sequence
    has two sources of truth and that is a real defect.

*Note on step execution: enrolling a record and advancing it through steps are
different things. Enrollment is proven. Whether each step then fires on schedule
is the sequence engine, which is a separate concern — do not read a successful
enrollment as proof the steps will run.*

---

## Phase 12 — Retry, expanded (US-6.5)

These extend Phase 8 rather than replace it.

77. **Retry that eventually succeeds:** point a webhook at a receiver you start
    only *after* the first attempt fails. Expected: an early attempt fails, a
    later one succeeds, and the run is marked **successful** — a run must not
    stay failed after a retry genuinely worked.
78. **Retry exhausted:** leave the receiver down. Expected: three attempts, run
    failed, each attempt recorded separately with its own error.
79. **No duplicate side effect across steps:** email step, then task step, then
    a failing webhook, with Retry on. Expected: exactly one email and exactly
    one task, not three of each.
80. **Retry an AI agent:** deactivate the agent mid-run configuration so the
    agent step fails. Expected: bounded attempts, and the failure names the
    agent rather than a generic wrapper message.
81. **Retry SMS:** use a recipient the provider refuses. Expected: attempts are
    recorded, the provider's own reason is visible, and no duplicate message is
    delivered on the attempts that reached the provider.
82. **Retry a task:** force a task step to fail after a successful one.
    Expected: the successful task is not created twice — check the task list,
    not just the run history.
