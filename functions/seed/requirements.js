/**
 * Seed corpus for the AmbiVerify study.
 *
 * Each item pairs a requirement excerpt with Gherkin acceptance criteria and
 * two lists of machine-extracted findings:
 *
 *   ambiguities    phrases claimed to admit two incompatible readings
 *   clarifications rewrites claimed to pick one reading without changing intent
 *
 * The lists are deliberately imperfect. Some findings are genuine, some are
 * pedantic non-issues, and some clarifications quietly change behaviour the
 * acceptance criteria already pin down. Reviewers are asked to tell them apart,
 * so nothing in this file records which is which — ground truth, where it
 * exists at all, is what the study is trying to measure.
 */

export const requirements = [
  {
    id: 1,
    description: `## FR-14 · Session expiry

The system **shall** sign the user out after a period of inactivity. Session
tokens are refreshed on each authenticated request.

> Inactive sessions must be terminated promptly. A user who returns to the
> application after being signed out is returned to the login screen with their
> previous destination preserved.

*Source: internal SRS, Access Control chapter, rev. 7.*`,
    spec: `Feature: Session expiry

  Scenario: A user returns after a long absence
    Given a signed-in user with a valid session
    When the user makes no authenticated request for a long period
    Then the session is terminated
    And the next request is redirected to the login screen
    And the originally requested path is preserved

  Scenario: Activity refreshes the session
    Given a signed-in user with a valid session
    When the user makes an authenticated request
    Then the inactivity timer restarts`,
    ambiguities: [
      `Phrase: "a period of inactivity"
Reading A: a fixed idle timeout measured from the last authenticated request.
Reading B: a fixed absolute lifetime from sign-in, regardless of activity.
No duration is given anywhere in the requirement or the criteria.`,
      `Phrase: "promptly"
Reading A: the session is invalidated server-side at the moment it expires.
Reading B: the session is invalidated lazily, on the next request that uses it.
The two differ observably for a token replayed from another device.`,
      `Phrase: "authenticated request"
Reading A: any request carrying a valid session token.
Reading B: only requests that required authorization to succeed.
Background polling would refresh the timer under A but not under B.`,
      `Phrase: "the previous destination"
Reading A: the path the user last successfully loaded.
Reading B: the path the user was attempting when the redirect fired.
These differ whenever expiry is discovered mid-navigation.`,
      `Phrase: "signed out"
Reading A: the session is destroyed and cannot be resumed.
Reading B: the UI returns to the login screen but the session may be resumed.`,
    ],
    clarifications: [
      `Rewrite: "The system shall terminate a session after 30 minutes with no
authenticated request."
Removes: the unbounded duration and fixes Reading A of "a period of inactivity".`,
      `Rewrite: "An expired session shall be rejected on the first request that
presents it, and its token shall be revoked server-side within 60 seconds of
expiry."
Removes: the eager/lazy split in "promptly" by requiring both.`,
      `Rewrite: "The inactivity timer shall restart on any request that presents a
valid session token, including unauthenticated polling endpoints."
Removes: the scope question in "authenticated request".`,
      `Rewrite: "On redirect, the system shall preserve the path of the request that
triggered the expiry check."
Removes: the ambiguity in "the previous destination".`,
      `Rewrite: "The system shall sign the user out after 30 minutes and shall not
allow the session to be resumed."
Removes: the resumability question in "signed out".`,
    ],
  },
  {
    id: 2,
    description: `## US-231 · Bulk export

> As an account administrator, I want to export all of my organization's
> records so that I can archive them outside the product.

**Acceptance notes from the product owner:**

- The export includes all records the administrator can see.
- Large exports are delivered by email rather than in the browser.
- The user is notified when the export is ready.`,
    spec: `Feature: Bulk export

  Scenario: Administrator exports a small account
    Given an administrator of an organization with few records
    When the administrator requests an export
    Then the file downloads in the browser

  Scenario: Administrator exports a large account
    Given an administrator of an organization with many records
    When the administrator requests an export
    Then the export is prepared in the background
    And the administrator is notified when it is ready`,
    ambiguities: [
      `Phrase: "all of my organization's records"
Reading A: every record owned by the organization.
Reading B: every record the requesting administrator is authorized to read.
The two diverge whenever per-team access restrictions are in force, and the
description asserts both readings in different sentences.`,
      `Phrase: "large exports"
Reading A: exports over a row-count threshold.
Reading B: exports over a file-size threshold.
Reading C: exports whose generation exceeds a request timeout.
No threshold of any kind is stated.`,
      `Phrase: "notified"
Reading A: an email is sent.
Reading B: an in-product notification appears.
The second bullet fixes the delivery channel for the file but not for the notice.`,
      `Phrase: "records"
Reading A: only first-class business records.
Reading B: business records plus their audit history and attachments.`,
      `Phrase: "archive them outside the product"
Reading A: the export format must be readable without the product.
Reading B: no format constraint; this is only user motivation.`,
    ],
    clarifications: [
      `Rewrite: "The export shall include every record the requesting administrator
is authorized to read at the moment the export begins."
Removes: the owned-vs-visible split, and pins the snapshot point.`,
      `Rewrite: "An export of more than 10,000 rows shall be prepared in the
background and delivered by email; smaller exports shall download in the
browser."
Removes: the undefined "large" by fixing a row-count threshold.`,
      `Rewrite: "The administrator shall be notified by email and by an in-product
notification when the export is ready."
Removes: the channel ambiguity in "notified".`,
      `Rewrite: "The export shall contain business records only, excluding audit
history and attachments."
Removes: the scope question in "records".`,
      `Rewrite: "The export shall be delivered as CSV."
Removes: the format question raised by "archive them outside the product".`,
    ],
  },
  {
    id: 3,
    description: `## RFC-08 §4.2 · Rate limiting

Clients that exceed their quota **must** receive a \`429 Too Many Requests\`
response. The quota is applied per API key.

Servers *should* include a \`Retry-After\` header. Clients that repeatedly
ignore \`Retry-After\` may have their key suspended.`,
    spec: `Feature: Rate limiting

  Scenario: A client exceeds its quota
    Given a client with an API key that has exhausted its quota
    When the client sends another request
    Then the response status is 429

  Scenario: A client respects Retry-After
    Given a client that received a 429 with a Retry-After header
    When the client waits for the indicated interval before retrying
    Then the request is served normally`,
    ambiguities: [
      `Phrase: "exceed their quota"
Reading A: the request that crosses the limit is itself rejected.
Reading B: the crossing request succeeds and subsequent ones are rejected.
Off-by-one behaviour at the boundary is unspecified.`,
      `Phrase: "per API key"
Reading A: one shared counter per key across all endpoints.
Reading B: an independent counter per key per endpoint.`,
      `Phrase: "repeatedly ignore Retry-After"
Reading A: a fixed number of violations within a window.
Reading B: any pattern a human operator judges abusive.
"Repeatedly" is quantified nowhere.`,
      `Phrase: "may have their key suspended"
Reading A: suspension is automatic once the condition is met.
Reading B: suspension is discretionary and requires operator action.`,
      `Phrase: "429 Too Many Requests"
Reading A: the status code alone.
Reading B: the status code plus a machine-readable error body.`,
    ],
    clarifications: [
      `Rewrite: "The request that would take the client above its quota shall itself
be rejected with 429."
Removes: the boundary ambiguity in "exceed their quota".`,
      `Rewrite: "Quota shall be counted per API key across all endpoints, using a
single shared counter."
Removes: the per-endpoint reading.`,
      `Rewrite: "A key that receives more than 10 rate-limited responses within any
60-second window after a Retry-After header was issued shall be suspended
automatically."
Removes: both the unquantified "repeatedly" and the discretionary reading of
"may have their key suspended".`,
      `Rewrite: "Servers shall include a Retry-After header on every 429 response."
Removes: the optionality of "should", making the second scenario reachable in
every case.`,
      `Rewrite: "A 429 response shall carry no body."
Removes: the body question in "429 Too Many Requests".`,
    ],
  },
  {
    id: 4,
    description: `## FR-52 · Duplicate detection

Before creating a contact, the system **shall** check for duplicates and warn
the user if a similar contact already exists. The user may proceed anyway.

Matching considers name and email address. Contacts marked as *merged* are not
considered.`,
    spec: `Feature: Duplicate detection

  Scenario: A similar contact exists
    Given a contact "Jane Smith <jane@example.com>" exists
    When the user creates a contact with a similar name and email
    Then a warning is shown before the contact is created
    And the user can choose to create the contact anyway

  Scenario: No similar contact exists
    Given no similar contact exists
    When the user creates a contact
    Then no warning is shown`,
    ambiguities: [
      `Phrase: "similar"
Reading A: exact match on email, ignoring name.
Reading B: fuzzy match on name above some threshold, with email as a tiebreak.
The criteria use "similar" without defining a comparison or a threshold.`,
      `Phrase: "considers name and email address"
Reading A: a match requires both fields to agree.
Reading B: a match requires either field to agree.
This is the difference between an AND and an OR, and it is not stated.`,
      `Phrase: "warn the user"
Reading A: a blocking dialog the user must dismiss.
Reading B: a non-blocking inline notice.
The criteria say "before the contact is created", which constrains ordering but
not modality.`,
      `Phrase: "marked as merged"
Reading A: the contact that was absorbed into another.
Reading B: the surviving contact that absorbed others.`,
      `Phrase: "Before creating a contact"
Reading A: on form submission.
Reading B: as the user types.`,
    ],
    clarifications: [
      `Rewrite: "Two contacts are similar when their email addresses are equal after
case folding, or when their normalized names have a Levenshtein distance of 2
or less."
Removes: both the undefined "similar" and the AND/OR question, by stating the
predicate outright.`,
      `Rewrite: "The warning shall be a non-blocking inline notice that does not
prevent submission."
Removes: the modality question in "warn the user".`,
      `Rewrite: "A contact whose merged_into field is set shall be excluded from
matching."
Removes: the direction ambiguity in "marked as merged".`,
      `Rewrite: "Duplicate detection shall run on form submission only."
Removes: the timing ambiguity in "Before creating a contact".`,
      `Rewrite: "If a duplicate is detected, the system shall merge the two contacts
automatically."
Removes: the need for a warning entirely.`,
    ],
  },
  {
    id: 5,
    description: `## NFR-03 · Availability

The service **shall** be available 99.9% of the time, measured monthly.
Scheduled maintenance is excluded from the calculation.

Availability is measured from the perspective of the client.`,
    spec: `Feature: Availability

  Scenario: Monthly availability is reported
    Given a calendar month has ended
    When the availability report is generated
    Then the reported availability excludes scheduled maintenance windows
    And the measurement reflects client-observed success`,
    ambiguities: [
      `Phrase: "available"
Reading A: the service returns a non-5xx response.
Reading B: the service returns a correct response within its latency target.
A service returning 200 responses in 40 seconds is available under A, not B.`,
      `Phrase: "measured monthly"
Reading A: calendar month.
Reading B: rolling 30-day window.
The criteria say "a calendar month has ended", which resolves this — the flag
may be redundant.`,
      `Phrase: "Scheduled maintenance"
Reading A: any window announced in advance, with no cap.
Reading B: windows within a pre-agreed maintenance allowance.
Under A the 99.9% target can be met with unlimited planned downtime.`,
      `Phrase: "from the perspective of the client"
Reading A: measured by synthetic probes outside the service's network.
Reading B: measured from real client telemetry.
These disagree when a client's own network is at fault.`,
      `Phrase: "99.9%"
Reading A: of wall-clock time.
Reading B: of requests.
43 minutes of downtime and 0.1% of requests failing are very different targets.`,
    ],
    clarifications: [
      `Rewrite: "The service is available in a given minute when at least 95% of
synthetic probe requests from outside the service network complete with a
non-5xx status within 2 seconds."
Removes: the correctness/latency question in "available" and fixes the
measurement vantage point.`,
      `Rewrite: "Availability shall be the fraction of measured minutes in the
calendar month in which the service was available."
Removes: the time-vs-requests reading of "99.9%".`,
      `Rewrite: "Scheduled maintenance may be excluded for at most 4 hours per
calendar month, announced at least 72 hours in advance."
Removes: the uncapped exclusion.`,
      `Rewrite: "Availability shall be measured over a rolling 30-day window."
Removes: the calendar-vs-rolling ambiguity.`,
      `Rewrite: "Availability shall be measured from real client telemetry."
Removes: the vantage-point ambiguity in "from the perspective of the client".`,
    ],
  },
  {
    id: 6,
    description: `## FR-71 · Password reset

A user who has forgotten their password **shall** be able to request a reset
link by email. The link expires after a short time and can be used once.

If the email address is not registered, the system must not reveal this.`,
    spec: `Feature: Password reset

  Scenario: A registered user requests a reset
    Given a registered email address
    When a reset is requested for that address
    Then a reset link is sent to that address
    And the confirmation message does not indicate whether the address exists

  Scenario: An unregistered address requests a reset
    Given an unregistered email address
    When a reset is requested for that address
    Then no email is sent
    And the confirmation message does not indicate whether the address exists`,
    ambiguities: [
      `Phrase: "a short time"
Reading A: minutes.
Reading B: hours.
No bound is given, and the security posture differs substantially between them.`,
      `Phrase: "can be used once"
Reading A: the link is consumed when the reset form is submitted.
Reading B: the link is consumed when the reset form is first opened.
Under B, an email scanner that prefetches links breaks the flow.`,
      `Phrase: "must not reveal this"
Reading A: the response body and status must be identical in both cases.
Reading B: the response body must be identical, timing may differ.
A timing side channel reveals registration under B.`,
      `Phrase: "request a reset link"
Reading A: unauthenticated users only.
Reading B: any user, including one already signed in.`,
      `Phrase: "by email"
Reading A: to the address supplied in the request.
Reading B: to the address currently on the account.
These differ if the account's address was changed after the request was typed.`,
    ],
    clarifications: [
      `Rewrite: "The reset link shall expire 15 minutes after it is issued."
Removes: the unbounded "a short time".`,
      `Rewrite: "The reset link shall be invalidated when the new password is
successfully set, and not before."
Removes: the prefetch hazard in "can be used once".`,
      `Rewrite: "The response status, body and observable latency shall be identical
for registered and unregistered addresses."
Removes: the timing side channel left open by "must not reveal this".`,
      `Rewrite: "The reset email shall be sent to the address currently registered on
the account, not to the address supplied in the request."
Removes: the ambiguity in "by email".`,
      `Rewrite: "Only unauthenticated users may request a reset link."
Removes: the audience question in "request a reset link".`,
    ],
  },
  {
    id: 7,
    description: `## FR-29 · Search results

Search **shall** return the most relevant results first. Results are paginated,
25 per page.

Users can filter results by date. Filters apply to the current search only.`,
    spec: `Feature: Search results

  Scenario: A user searches
    Given a user with a search query
    When the search is run
    Then results are ordered by relevance
    And at most 25 results are shown per page

  Scenario: A user applies a date filter
    Given a set of search results
    When the user applies a date filter
    Then only results within the date range are shown
    And the filter is discarded when a new search is run`,
    ambiguities: [
      `Phrase: "most relevant"
Reading A: a documented scoring function.
Reading B: whatever the underlying search engine returns.
Relevance is never defined, so the first criterion cannot be tested.`,
      `Phrase: "filter by date"
Reading A: the date the record was created.
Reading B: the date the record was last modified.`,
      `Phrase: "the current search only"
Reading A: filters reset when the query text changes.
Reading B: filters reset when the user navigates away from search.
The criteria say "when a new search is run", which resolves this toward A.`,
      `Phrase: "25 per page"
Reading A: exactly 25 except on the final page.
Reading B: at most 25, with fewer allowed if results are suppressed.`,
      `Phrase: "paginated"
Reading A: numbered pages.
Reading B: infinite scroll.`,
    ],
    clarifications: [
      `Rewrite: "Results shall be ordered by descending BM25 score over the title and
body fields, with ties broken by descending creation date."
Removes: the undefined "most relevant" by naming the scoring function and the
tiebreak.`,
      `Rewrite: "The date filter shall apply to the record's creation date."
Removes: the created-vs-modified ambiguity.`,
      `Rewrite: "Date filters shall be cleared whenever the query text changes."
Removes: the reset-trigger ambiguity in "the current search only".`,
      `Rewrite: "Each page shall contain exactly 25 results, except the final page,
which may contain fewer."
Removes: the exactly-vs-at-most reading.`,
      `Rewrite: "Results shall be presented with numbered pages."
Removes: the presentation ambiguity in "paginated".`,
    ],
  },
  {
    id: 8,
    description: `## FR-88 · Refunds

An order **may** be refunded within 30 days of purchase. Partial refunds are
supported.

A refunded order cannot be refunded again. Shipping costs are refunded only if
the entire order is returned.`,
    spec: `Feature: Refunds

  Scenario: A full refund within the window
    Given an order placed 10 days ago
    When the whole order is refunded
    Then the order total including shipping is returned to the customer
    And the order cannot be refunded again

  Scenario: A partial refund
    Given an order placed 10 days ago
    When one item is refunded
    Then the price of that item is returned to the customer`,
    ambiguities: [
      `Phrase: "within 30 days of purchase"
Reading A: 30 days from when the order was placed.
Reading B: 30 days from when the order was delivered.
For a slow shipment these differ by weeks.`,
      `Phrase: "A refunded order cannot be refunded again"
Reading A: any refund, partial or full, closes the order to further refunds.
Reading B: only a full refund closes it.
Reading A contradicts the partial-refund scenario for multi-item orders, and
the criteria do not say which holds.`,
      `Phrase: "the entire order is returned"
Reading A: every item is refunded, whether in one action or several.
Reading B: every item is refunded in a single action.`,
      `Phrase: "may be refunded"
Reading A: the customer is entitled to a refund on request.
Reading B: a refund is at the merchant's discretion.`,
      `Phrase: "Partial refunds are supported"
Reading A: refunds at item granularity.
Reading B: refunds of an arbitrary amount.`,
    ],
    clarifications: [
      `Rewrite: "An order may be refunded within 30 days of delivery."
Removes: the purchase-vs-delivery ambiguity.`,
      `Rewrite: "An order may be refunded repeatedly, item by item, until every item
has been refunded; once every item is refunded no further refund is possible."
Removes: the contradiction between "cannot be refunded again" and partial
refunds.`,
      `Rewrite: "Shipping costs shall be refunded once every item on the order has
been refunded, regardless of how many refund actions were used."
Removes: the single-action reading of "the entire order is returned".`,
      `Rewrite: "Partial refunds shall be issued at item granularity; arbitrary
amounts are not supported."
Removes: the granularity question.`,
      `Rewrite: "Refunds within the window shall be granted automatically on customer
request."
Removes: the discretionary reading of "may be refunded".`,
    ],
  },
  {
    id: 9,
    description: `## FR-40 · Audit log

All changes to customer data **shall** be recorded in the audit log. Entries
record who made the change, what changed, and when.

Audit entries are immutable and retained for seven years.`,
    spec: `Feature: Audit log

  Scenario: A change is recorded
    Given a signed-in operator
    When the operator changes a customer record
    Then an audit entry is written identifying the operator, the change and the time
    And the entry cannot subsequently be altered`,
    ambiguities: [
      `Phrase: "All changes to customer data"
Reading A: changes made through the product UI.
Reading B: every write, including background jobs, migrations and direct
database access.
Under B the log must capture actors that have no session at all, which the
criterion's "signed-in operator" does not cover.`,
      `Phrase: "who made the change"
Reading A: the authenticated principal.
Reading B: the human ultimately responsible, where a job acts on their behalf.`,
      `Phrase: "what changed"
Reading A: the names of the changed fields.
Reading B: the before and after values.
Reading B has data-retention consequences that Reading A does not.`,
      `Phrase: "immutable"
Reading A: no update or delete is possible through any interface.
Reading B: no update is possible through the product, but retention policy may
delete entries.
The seven-year retention clause implies deletion eventually happens.`,
      `Phrase: "when"
Reading A: the time the change was committed.
Reading B: the time the audit entry was written.`,
    ],
    clarifications: [
      `Rewrite: "Every write to customer data, including writes performed by
background jobs and migrations, shall produce an audit entry."
Removes: the UI-only reading, and forces the actor model to cover non-session
actors.`,
      `Rewrite: "The actor field shall record the authenticated principal, and where
that principal is a job acting on behalf of a user, the on-behalf-of user as
well."
Removes: the ambiguity in "who made the change".`,
      `Rewrite: "The entry shall record the changed field names and their before and
after values."
Removes: the field-names-only reading of "what changed".`,
      `Rewrite: "Audit entries shall be append-only and shall be deleted only by the
seven-year retention job."
Removes: the conflict between "immutable" and retention.`,
      `Rewrite: "The timestamp shall be the time the change was committed."
Removes: the ambiguity in "when".`,
    ],
  },
  {
    id: 10,
    description: `## FR-12 · Notification preferences

Users **shall** be able to opt out of non-essential notifications. Essential
notifications cannot be disabled.

Preferences take effect immediately.`,
    spec: `Feature: Notification preferences

  Scenario: A user opts out
    Given a user receiving non-essential notifications
    When the user opts out
    Then no further non-essential notifications are sent to that user
    And essential notifications continue to be sent

  Scenario: Essential notifications cannot be disabled
    Given a user viewing their notification preferences
    Then essential notifications are not presented as an option`,
    ambiguities: [
      `Phrase: "non-essential"
Reading A: a fixed category assigned to each notification type.
Reading B: a per-user judgement about relevance.
The requirement gives no classification, so neither scenario can be executed.`,
      `Phrase: "take effect immediately"
Reading A: notifications already queued are cancelled.
Reading B: the preference applies only to notifications generated after the
change.
"No further non-essential notifications are sent" leans toward A, but a queued
message is arguably already sent.`,
      `Phrase: "opt out of non-essential notifications"
Reading A: all-or-nothing for the whole non-essential category.
Reading B: per-notification-type opt-out.`,
      `Phrase: "sent to that user"
Reading A: across every channel.
Reading B: only the channel the preference was set on.`,
      `Phrase: "cannot be disabled"
Reading A: the option is absent from the UI.
Reading B: the option is present but always on.
The second criterion resolves this toward A.`,
    ],
    clarifications: [
      `Rewrite: "Each notification type shall carry a fixed essential or
non-essential classification, published in the notification catalogue."
Removes: the undefined "non-essential" by locating the classification.`,
      `Rewrite: "A preference change shall apply to notifications generated after the
change; already-queued notifications shall still be delivered."
Removes: the queue ambiguity, choosing Reading B of "take effect immediately".`,
      `Rewrite: "Users shall be able to opt out per notification type."
Removes: the all-or-nothing reading.`,
      `Rewrite: "An opt-out shall apply to every delivery channel for that
notification type."
Removes: the channel ambiguity in "sent to that user".`,
      `Rewrite: "Essential notification types shall not appear in the preferences UI."
Removes: the presentation ambiguity in "cannot be disabled".`,
    ],
  },
];

export default requirements;
