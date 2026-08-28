## ADDED Requirements

### Requirement: External events are normalized before business routing

The system SHALL convert authenticated connector input into a versioned PerceptionEvent before evaluating trigger rules.

#### Scenario: Platform payload is accepted

- **WHEN** a configured connector authenticates an inbound event
- **THEN** the system persists an inbox reference and emits one normalized PerceptionEvent without placing the raw payload directly in an Agent prompt

### Requirement: Trigger execution is idempotent and authorized

The system SHALL deduplicate source events and authorize the configured target before creating an execution lease.

#### Scenario: A platform retries the same event

- **WHEN** the same connector and sourceEventId are delivered more than once
- **THEN** at most one active execution lease is created and every delivery remains auditable

#### Scenario: A target is not externally triggerable

- **WHEN** a rule points to a target without external-trigger permission
- **THEN** the event is rejected before Agent or Skill execution

### Requirement: Connectors fail independently

The system SHALL isolate connector health, retries and dead letters.

#### Scenario: One connector repeatedly fails

- **WHEN** an Email connector exceeds its retry budget
- **THEN** its event enters dead-letter and Feishu, DingTalk and WeCom connectors continue processing

### Requirement: Skill cognition ownership remains explicit

The system SHALL treat standalone skills as ephemeral event consumers and inherited skills as evidence producers for their caller.

#### Scenario: An event triggers a standalone skill

- **WHEN** the skill completes
- **THEN** no persistent Knowledge, Pattern or cognition bank is created under the skill directory

