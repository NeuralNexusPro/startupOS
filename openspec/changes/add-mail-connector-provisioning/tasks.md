## 1. Story and contracts

- [x] 1.1 Create SENSE.10 six-document Story specification and test cases
- [x] 1.2 Define Mail profile, credential port, test receipt and safe error contracts

## 2. Desktop provisioning

- [x] 2.1 Implement safeStorage credential adapter and restricted IPC
- [x] 2.2 Implement imapflow adapter and bounded connection test
- [x] 2.3 Implement MailConnectorSupervisor lifecycle and scheduler integration
- [x] 2.4 Connect EmailPoller output to existing perception routing
- [x] 2.5 Establish the current mailbox head as the first-poll UID baseline instead of replaying historical mail

## 3. Product flow

- [x] 3.1 Extend Sense Center with complete Electron Mail form
- [x] 3.2 Implement save-and-test, verified enable, rebind and Web-only fail-closed states
- [x] 3.3 Reject credential-shaped fields in Web management routes

## 4. Verification

- [x] 4.1 Run Core/Desktop/Web unit and integration tests
- [x] 4.2 Run lifecycle, failure-isolation and secret-leak scans
- [x] 4.3 Run three-package typecheck and lint; document real-provider manual verification

## 5. Production feedback fixes

- [x] 5.1 Fetch and decode complete MIME bodies and pass readable text through the normalized event to targets
- [x] 5.2 Emit exactly one best-effort native system notification for an explicit target human-escalation result
- [x] 5.3 Run MIME, downstream prompt, notification dedupe, typecheck and lint regression verification
