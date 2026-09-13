# Retire completed A/B candidate before feature 005

The old schema-8 candidate referenced a missing active `run-latest.json`. Compared every retained deployment-plan field and all seven components against `broadcast/DeployDirectProtocol.s.sol/46630/run-1789107837.json`, source `d792d793d35755f95c5d2290e0aaccc4b44afa95`. All components are deployed and source-verified, all recorded receipts succeeded, and their transaction hashes appear in the retained broadcast receipts.

Archived the candidate byte-for-byte as `candidate-d792d793d357-promoted.json` (SHA-256 `1aab7dc888c7a686ba4f8e3b98102584999495b25f7f1181312b28a418d2d439`). No pending transaction was removed and no old active pointer was restored. The historical broadcast and previous manifests remain available in Git/history. The next authorized release can create a new candidate journal for its six-component clone deployment. This cleanup signs or submits no transaction.
