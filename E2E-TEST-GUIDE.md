# CRM Automations — validation runbook

A maintainer's script for validating CRM automations against a running
deployment. It follows one continuous scenario — inbound lead handling — so the
capabilities are exercised in the order a real deployment uses them rather than
in isolation.

**This is a plan, not a record of results.** Phases marked *Evidence exists*
have already been exercised and are recorded in `RELEASE-EVIDENCE-2026-07-27.md`;
re-running them is regression checking. Phases marked *Not yet exercised* have
never been driven end to end and should be treated as unproven until someone
completes them and records the outcome.

**Scenario.** A prospect submits a website form. The lead is scored, attached to
the correct company, routed by deal value, given an owner, followed up by email
and SMS, tracked for engagement, and pushed to an external system.
Disqualified records are removed.

**Prerequisites.** A running application; a configured SMTP provider; a
configured SMS provider; a configured language-model provider; two workspace
members at different privilege levels; and a reachable inbox for the sending
address. Where a step needs a destination address or phone number, supply one
controlled by the person running the test — this document deliberately contains
no real contact details.

---

## Phase 0 — Reference data

*Not yet exercised as part of a full pass.*

1. Create a company record with a name and a domain. A contact with no company
   cannot be linked, so relationship steps need a real other end.
2. Confirm the Person object exposes name, email, phone, title and stage, and
   that the Deal object exposes name, value, stage, probability and expected
   close date.
3. Confirm a second workspace member exists at a lower privilege level; the
   permission phase requires one.
4. Keep the destination inbox open alongside the application for the duration.

---

## Phase 1 — Inbound capture through forms

*Not yet exercised. The trigger is selectable and the event bridge exists, but
no real submission has been driven through.*

5. Create a form whose fields map to Person: name, email, phone, title. Bind it
   to the Person object so a submission creates a record.
6. Build an automation with the Form Submitted trigger and a Send Email action,
   using the submitted name in the subject.
7. Publish, then submit the form as an external visitor would.
8. **Expected:** a Person record appears carrying the submitted values, a run
   reaches completed, and the message arrives with the name resolved.
9. **Failure case:** submit with the email field empty. The run must skip or
   fail with a readable reason. It must never send to an empty address.

---

## Phase 2 — Qualification with an AI agent

*Evidence exists for steps 10 to 16 and for all four failure modes.*

10. Build: Record Created on Person, then an AI Agent step, then Send Email.
11. Select an active agent on the node and note its output variable name.
12. Reference the agent's output content in the email body through that
    variable.
13. Publish, then create a Person with a realistic job title and address.
14. **Expected:** the run completes, the agent step's stored result contains
    reasoning that references the values on the record, and the delivered
    message carries that analysis. Generation time depends on the configured
    provider and model; treat any bounded completion as a pass.

### Output reaching more than the next step

15. Add a second agent after the first with its own output variable, and
    reference both variables in the email body.
16. **Expected:** both render, establishing that agent output is available to
    every later step rather than only the adjacent one.

### Agent failure modes

17. **No agent selected:** add an agent node, select nothing, attempt to
    publish. Expected: refused, with an error on the node stating that an
    active agent must be selected.
18. **Deactivated agent:** deactivate an agent, then trigger an automation that
    uses it. Expected: the run fails with a message naming the agent and its
    inactive state, not a generic workflow wrapper message.
19. **Unresolvable input:** configure an execution input whose context path does
    not exist. Expected: the run fails naming the input it could not resolve.
20. **Timeout:** set a timeout shorter than the provider's typical response
    time. Expected: the step fails on time rather than hanging or reporting a
    false success.
21. **Dry run honesty:** use Test rather than Publish. Expected: the result
    states the agent was not actually executed.

---

## Phase 3 — Routing by deal value

*Evidence exists.*

22. Create a deal against the company from Phase 0.
23. Build: Record Created on Deal, then a Branch with two value thresholds and a
    final path marked as the Else fallback.
24. Give each path different work: an owner assignment and an urgent task on the
    highest band, a message on the middle band, a nurture task on the fallback.
25. Publish, then create three deals whose values fall into the three bands.
26. **Expected:** three runs, each taking exactly one path, each branch step
    recording its rule index and path label. Only the highest-band deal receives
    an owner and an urgent task.
27. **Failure case:** add a rule with an unrecognised operator. Expected:
    refused at save, or the run fails loudly. It must never silently fall
    through to the Else path.

---

## Phase 4 — Relationships and ownership

*Not yet exercised as a connected journey. The individual handlers are shared
with the inline execution path and are covered by automated tests.*

28. Build: Record Created on Person, then Link Records to the company matching
    the address domain, then Assign Owner, then Create Task.
29. Publish, then create a Person whose address domain matches the company.
30. **Expected:** after a full page refresh, the Person shows the linked
    company, an owner and the task. The refresh matters — a value rendered on
    screen is not evidence of persistence.
31. **Scoped deletion:** build Record Updated on Person with a condition that
    stage equals a disqualified value, then Delete Record. Publish, then set a
    record to that stage.
32. **Expected:** that record is deleted and no other. Trigger the same
    automation again against the same record. Expected: a readable outcome, no
    error storm and no second deletion. Deletion belongs behind a condition
    rather than on a bare trigger for exactly this reason.

---

## Phase 5 — Outreach and external systems

*Evidence exists for the email, SMS, webhook and retry behaviour below.*

33. Extend the Phase 4 automation with Send Email, then Send SMS, then Webhook
    Call.
34. Address the SMS to the record's phone field with a short templated message.
35. Point the webhook at a receiver under the tester's control, with a body
    containing record values and the trigger type.
36. Set the automation's error handling to Retry.
37. Publish, then create a Person carrying a valid international phone number
    and a reachable address.
38. **Expected:** the message arrives, the SMS arrives, and the receiver logs a
    POST with rendered values and an `Idempotency-Key` header. Run history shows
    the delivery target on each step.
39. **SMS failure case:** create a Person whose phone number omits its country
    code. Expected: the run fails stating the required international format, and
    nothing reaches the provider.
40. **Webhook failure case:** point the URL at a port with no listener.
    Expected: three recorded attempts, run failed, and the connection error
    visible on each attempt.
41. **No replay of a completed step:** with a working email step before the
    failing webhook, count delivered messages. Expected: exactly one, not three.
    A retry must re-enter only the failed step.
42. **Secret safety:** set an Authorization header on the webhook. Expected: the
    receiver sees it and it appears nowhere in stored run history.

---

## Phase 6 — Engagement tracking

*Evidence exists for the open path. The click path is not yet exercised.*

43. Build: Email Opened on Person, then Create Task naming the record.
44. Publish, then trigger the Phase 5 automation so a tracked message is sent.
45. Open the message in a mail client with images enabled.
46. **Expected:** the open is recorded and the Email Opened automation fires,
    creating the task with the record's name resolved.
47. **If nothing fires:** the mail client could not reach the tracking host.
    Opens are recorded by the application server, so a client on the public
    internet cannot reach a private address. Against a private deployment the
    logic can be proven by requesting the tracking URL directly; a public
    tracking host is a deployment prerequisite.
48. **Click path:** include a link in the body and follow it. Expected: the real
    destination loads and a click is recorded.

---

## Phase 7 — Dynamic values

*Evidence exists for steps 49 to 53.*

Three namespaces are available, confirmed against the resolver:

- `{{record.values.<field>}}` — from the record that triggered the run, which
  covers most usage.
- `{{trigger.<key>}}` — from the event itself, such as the trigger type or which
  field changed; information that exists at the moment of the event but is not
  stored on the record.
- `{{variables.<name>}}` — values produced earlier in the same run, including an
  agent's output.
- A placeholder with no recognised prefix falls back to the record. This is
  convenient but conceals typos, and is worth knowing when diagnosing.

49. In one message body include a text field, an address, a phone number, a
    title, the trigger type and an agent output. Expected: all resolve and no
    unrendered placeholder survives.
50. On a Deal, render the value, probability, expected close date and stage.
    Expected: each renders in a form a reader would expect.
51. **Missing path:** reference a field that does not exist. Expected: the run
    fails naming that exact placeholder. It must never deliver a message with a
    silent gap.
52. **Wrong variable name:** rename an agent's output variable but leave the old
    name in the body. Expected: the same explicit failure.
53. **Subject line:** place a placeholder in the subject. Expected: it resolves
    there as well.

---

## Phase 8 — Error handling and run limits

*Evidence exists for the three error-handling modes. Run limits are not yet
exercised, and a known defect affects them — see below.*

54. Set error handling to Stop and trigger a failing step. Expected: one
    attempt, run fails immediately.
55. Set to Continue with a working step after a failing one. Expected: the later
    step runs, the failing step is recorded failed, and the overall run is still
    reported failed. A run containing a failure must never claim success.
56. Set to Retry. Expected: three bounded attempts against the failing step
    only, each recorded separately.
57. Set a monthly run limit and exceed it. Expected: further runs are refused
    with a clear reason rather than silently dropped. **Known defect:** runs
    that take the durable execution path do not advance the counter, so this
    check will not behave correctly for automations containing a wait,
    condition, branch or agent step.

---

## Phase 9 — Privilege separation

*Not yet exercised. Requires two concurrent sessions.*

58. As an administrator, create an automation and assign records to a
    lower-privilege member.
59. Sign in as that member. Expected: they see records assigned to them and the
    tasks created for them.
60. Expected: a member cannot publish or delete an automation where the
    permission model reserves that for administrators. Confirm the intended
    behaviour before recording a result as a defect.
61. Expected: runs and their history are scoped per workspace, and one
    workspace's data never appears in another.

---

## Phase 10 — Manual run

*Not exposed in the interface. The endpoint exists and functions; this phase
proves the capability, not the user journey.*

62. Open a published automation and take its identifier from the address bar.
63. Take the identifier of a record the automation applies to.
64. Invoke the trigger endpoint directly, substituting the workspace,
    automation and record identifiers and an administrator token:

```bash
curl -X POST "http://localhost:8000/api/v1/workspaces/<WORKSPACE_ID>/automations/<AUTOMATION_ID>/trigger?record_id=<RECORD_ID>" -H "Authorization: Bearer <TOKEN>"
```

65. **Expected:** a run appears in that automation's history and completes as it
    would for a real trigger, with the same steps and the same evidence.
66. **Expected:** the run is distinguishable as manual. A manual run that is
    indistinguishable from an organic one makes history misleading.
67. **Permission case:** repeat as a lower-privilege member. Expected: refused.
68. **Missing record case:** pass an identifier that does not exist. Expected: a
    readable refusal rather than a run that starts and then fails obscurely.

Record the outcome as *implemented but not exposed* rather than as working,
until an interface control exists.

---

## Phase 11 — Sequence membership

*Enrollment is exercised. Step advancement does not exist — see the note.*

69. Create a sequence on the Person object with two or three steps.
70. Open it. Expected: a searchable list of eligible records, with anyone
    already enrolled filtered out.
71. Enrol one record by hand. Expected: the active count rises, the record
    appears in the enrolled list, and it leaves the eligible list.
72. **Double-enrolment guard:** attempt to enrol the same record again.
    Expected: not offered.
73. Remove the enrollment. Expected: the counts reverse and the record returns
    to the eligible list.
74. **Automated half:** build an automation with an Enrol in Sequence action
    triggered by Record Created. Publish and create a Person. Expected: the
    record is enrolled and appears in the same list as the manual enrollment.
75. **Removal half:** build an automation with Remove from Sequence behind a
    condition on stage. Set a record to that stage. Expected: removal, with the
    counts reflecting it.
76. **Expected overall:** manual and automated enrollment reach the same place
    and are indistinguishable afterwards. Divergence would mean the sequence has
    two sources of truth.

Enrolling a record and advancing it through the sequence steps are different
things. Enrollment works. The engine that advances a record through the steps
has not been built, so a successful enrollment is not evidence that the steps
will fire.

---

## Phase 12 — Retry behaviour in depth

*Evidence exists for steps 78, 79 and 80. Steps 77, 81 and 82 are not yet
exercised.*

77. **Retry that eventually succeeds:** point a webhook at a receiver started
    only after the first attempt fails. Expected: an early attempt fails, a
    later attempt succeeds, and the run is marked successful. A run must not
    remain failed after a retry genuinely worked.
78. **Retry exhausted:** leave the receiver down. Expected: three attempts, run
    failed, each attempt recorded separately with its own error.
79. **No duplicate side effect across steps:** an email step, then a task step,
    then a failing webhook, with Retry enabled. Expected: exactly one message
    and exactly one task.
80. **Agent retry:** cause an agent step to fail. Expected: bounded attempts,
    with the failure naming the agent rather than a generic wrapper message.
81. **SMS retry:** use a recipient the provider refuses. Expected: attempts are
    recorded and the provider's own reason is visible. **Known defect:** if the
    provider accepts a message and the local write immediately afterwards
    fails, the retry will send again and the recipient receives a duplicate.
82. **Task retry:** force a task step to fail after a successful one. Expected:
    the successful task is not created twice. Verify against the task list, not
    only the run history.
