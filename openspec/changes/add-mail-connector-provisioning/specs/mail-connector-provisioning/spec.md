## ADDED Requirements

### Requirement: Mail credentials remain inside the Desktop security boundary

The system SHALL bind Mail credentials through Electron safeStorage and SHALL expose only a secret reference outside Desktop main.

#### Scenario: A user saves an application password

- **WHEN** the Electron Mail form submits valid profile and credential data
- **THEN** only encrypted credential material and a secret reference are persisted, and no Web request, log, audit entry or response contains the credential

#### Scenario: Secure storage is unavailable

- **WHEN** Electron safeStorage cannot provide encryption
- **THEN** the binding fails closed without a plaintext fallback

### Requirement: A Mail connection is verified before activation

The system SHALL verify TLS, authentication and mailbox selection within a bounded timeout before allowing a Mail connector to become enabled.

#### Scenario: Authentication fails

- **WHEN** the IMAP server rejects the credential
- **THEN** the system returns `AUTH_FAILED`, keeps the connector disabled and does not expose the server exception

### Requirement: Enabled Mail connectors poll incrementally and independently

The Desktop supervisor SHALL restore enabled Mail connectors and process only messages after their persisted cursor.

#### Scenario: First activation establishes a mailbox-head baseline

- **WHEN** an enabled Mail connector polls a mailbox without a persisted cursor
- **THEN** it persists the current `UIDNEXT - 1` as its baseline and does not emit historical messages as new perception events

#### Scenario: One mailbox is unavailable

- **WHEN** one Mail connector repeatedly times out
- **THEN** its health and retry state degrade independently while other Mail and IM connectors continue processing

#### Scenario: Desktop restarts

- **WHEN** the supervisor starts after a previous successful cursor advance
- **THEN** polling resumes from the persisted UIDVALIDITY/UID without duplicating trigger execution

### Requirement: New mail body is delivered intact to the perception target

The Desktop Mail adapter SHALL fetch and decode the complete MIME message body and SHALL place readable body text in the normalized perception event passed to the target.

#### Scenario: A multipart or encoded mail arrives

- **WHEN** a new message contains encoded UTF-8 or GB18030 text, multipart alternatives, or an HTML-only body
- **THEN** the target receives the complete readable body text, preferring text/plain and falling back to HTML-to-text, without MIME headers or attachment bytes

### Requirement: Human escalation emits one native notification

The perception execution adapter SHALL emit at most one native system notification when the target explicitly marks its final result with `[PERCEPTION_ESCALATE]`.

#### Scenario: A target escalates a mail

- **WHEN** the target completes with an explicit escalation marker
- **THEN** Desktop shows one native notification referencing the event and target, and notification failure does not retry or fail the completed target execution
