# RFC 0001 database security and privacy release review

Status: evidence assembled; public-beta and GA sign-off pending.

This is the release decision record for L-017. The implementation-linked
[threat model](./0001-database-threat-model.md) and
[resource limits](./0001-database-resource-and-abuse-limits.md) are required
inputs. L-017 remains open until the named release approver records both the
decision and date; passing automated tests alone is not a release approval.

## Data inventory and retention

| Data | Location | Retention/deletion | Disclosure boundary |
| --- | --- | --- | --- |
| Canonical manifests and records | `.ok/databases` and configured content folders | User/Git lifecycle; undo journal is local | Permission, sensitivity, Agent View projection |
| Permission/autonomy policies | owner-only `.ok/local` state | Replaced/revoked by owner | Never packed as record content |
| Connection credentials | owner-only `.ok/local` connection state | Owner deletion/rotation | Referenced only by opaque connection ID |
| Audit receipts | local durable transaction journal | Operator lifecycle | Content-free intent plus exact diff/verification metadata |
| Raw agent prompts | process memory only, explicit consent | 60 seconds–7 days; delete/restart clears | Same principal and read-audit permission |
| Public Form abuse ledger | local durable hashed identifiers | Bounded windows and retention workflow | No answers or raw remote addresses |
| Public Form answers/uploads | canonical record/assets | Declared keep/delete-after policy | Exact Form projection and database permission |
| Automation runs/outbox | owner-only local state | Newest 1,000 runs/events | Bounded safe errors and content-free receipts |
| External delivery | configured HTTPS/email endpoint | Recipient's policy after delivery | Reviewed fields/body, host/domain and byte policy |
| Offline record write queue | browser IndexedDB | Commit/convergence or explicit discard; max 100 entries | Same local browser profile; exact review before server commit |

## Required evidence

- [x] Threat surfaces, trust boundaries, residual risks, and owners documented.
- [x] Public, agent, import, expression, relation, automation, and upload limits
  documented and covered by focused negative tests.
- [x] Permission and sensitivity filtering occurs before search, ranking,
  formula-derived disclosure, evidence, body, and relation projection.
- [x] Exact plan/approval/revision/idempotency/audit controls cover canonical
  agent mutations and automation writes.
- [x] Secrets and raw prompts are excluded from canonical content, Git, Context
  Packs, and default audit storage.
- [x] Public bearer tokens are hash-only at rest and support rotation,
  revocation, expiry, and exact target scope.
- [x] Webhook SSRF, redirect, host/DNS, private-network, recipient, egress-byte,
  and idempotency controls have focused tests.
- [x] Dependency/security scan results attached for the release candidate. The
  2026-07-22 baseline is recorded in
  [0001-database-security-scan-2026-07-22.md](./0001-database-security-scan-2026-07-22.md);
  the latest focused rerun reports 58 advisories (14 high, 35 moderate, 9 low,
  zero critical). It is explicitly non-passing and does not close L-017.
- [ ] Public-beta exploratory abuse test completed against the packaged build.
- [ ] Privacy notice and user-facing deletion/export copy reviewed. Draft
  copy is now published in the [Databases guide](/docs/features/databases#privacy-retention-deletion-and-export)
  and the complete machine-local inventory remains in [What SynapseNote writes](/docs/reference/what-synapsenote-writes);
  a named reviewer still needs to approve the wording.
- [ ] All accepted residual risks have an owner and review date.
- [ ] Public-beta approver, decision, commit, and date recorded below.
- [ ] GA re-review approver, decision, commit, and date recorded below.

## Release decisions

| Gate | Decision | Approver | Commit/build | Date | Notes |
| --- | --- | --- | --- | --- | --- |
| Public beta | pending | — | — | — | Complete remaining checklist, packaged abuse test, privacy copy, and residual-risk disposition. |
| GA | pending | — | — | — | Re-run against the GA candidate and production deployment topology. |

An approval must use `approve`, `approve with named exceptions`, or `reject`.
Exceptions require a concrete owner, mitigation, deadline, and rollback or
feature-disable path. A code change affecting any trust boundary invalidates a
prior decision unless the approver explicitly scopes it as non-security-
relevant.
