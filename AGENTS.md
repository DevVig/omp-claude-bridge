# Repository agent guidance

## Independent PR review

- Follow [the approved review standard](docs/ops/pr-review-policy.md); use one final review of the exact candidate SHA. CodeRabbit is preferred, with a separate Codex review as the default recorded-error/cooldown fallback; Bugbot requires verified existing access/authorization.
- Run applicable tests/types/lint/build/security during implementation. Sensitive changes require an additional independent review and targeted tests. Preserve every existing acceptance and production approval gate.
- Retain reviewer/context, SHA, full path coverage, findings/dispositions and receipts. A skipped or rate-limited green check is not review. Any code change invalidates the candidate receipt.
- `scripts/review/review.py` prepares/runs/checks local evidence; success is not merge approval. No new hosted review credentials, permissions, app installation, spending or branch-protection changes are authorized by this standard.
