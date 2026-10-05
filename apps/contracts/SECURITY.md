# Contract security notes

## Dependency audit scope

The deployed contract has one runtime package dependency:
`@openzeppelin/contracts@5.6.1`. The production-only audit completed for issue
#7 reported no high or critical advisories for that dependency.

The repository-wide lockfile also reports pre-existing high or critical
advisories in development tooling and web-application dependency trees. Those
packages are not linked into the escrow bytecode. They are accepted for this
contract-only change and remain outside issue #7; they should be remediated in
the owning workspace before a production release.

The audit could not be refreshed during the final review because network access
to the public advisory service was not authorized. This note records the last
successful audit result from the issue handoff rather than claiming a newer
scan.

## Production trust assumptions

- Base Sepolia USDC can be paused, frozen, or upgraded by its issuer.
- Base sequencing and RPC availability can delay transactions and timeouts.
- The owner, arbiter, and fee recipient are distinct 2-of-3 Safe accounts with
  disjoint signer sets. Deployment checks pin the Safe version and official
  singleton, and reject enabled modules, guards, or unapproved fallback
  handlers.
- Escrow identifiers, participant addresses, amounts, timestamps, and evidence
  hashes are public. Evidence contents must remain offchain.
- Administrative pause affects deposits only. Existing escrows retain their
  release, refund, dispute, timeout, and pull-claim paths.
