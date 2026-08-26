#!/usr/bin/env bash
set -euo pipefail

record="${1:?usage: check-readiness-record.sh READINESS_RECORD.json}"
jq empty "$record"

test "$(jq -r '."$schema"' "$record")" = "./readiness-schema-v1.json"
test "$(jq -r '.schemaVersion' "$record")" = "1"
jq -e '
  (.candidateId | type == "string" and length > 0) and
  (.deploymentManifest | type == "string" and length > 0) and
  (
    (.network == "robinhood-testnet" and .chainId == 46630) or
    (.network == "robinhood-mainnet" and .chainId == 4663)
  ) and
  (
    (.gates | keys | sort) == ([
      "canonicalToken",
      "publicPilot",
      "brandClearance",
      "artifactFreeze",
      "accountingReview",
      "securityAudit",
      "reproducibleBuild",
      "safeReadiness",
      "deploymentVerification",
      "monitoringReadiness",
      "humanAuthorization"
    ] | sort)
  )
' "$record" >/dev/null

status="$(jq -r '.status' "$record")"
case "$status" in
  blocked)
    jq -e '[.gates[].status] | any(. == "BLOCKED")' "$record" >/dev/null
    ;;
  superseded)
    jq -e '.supersededBy | type == "string" and length > 0' "$record" >/dev/null
    ;;
  ready)
    jq -e '
      def exactkeys($expected): (keys | sort) == ($expected | sort);
      def digest: type == "string" and test("^sha256:[0-9a-f]{64}$");
      def commit: type == "string" and test("^[0-9a-f]{40}$");
      def address: type == "string" and test("^0x[0-9a-fA-F]{40}$");
      def chainhash: type == "string" and test("^0x[0-9a-fA-F]{64}$");
      def nonempty: type == "string" and length > 0;
      def integer: type == "number" and floor == .;
      def review:
        exactkeys(["reportSha256", "scope", "artifactSha256", "finalDisposition"]) and
        (.reportSha256 | digest) and (.scope | nonempty) and
        (.artifactSha256 | digest) and (.finalDisposition | nonempty);
      ((exactkeys([
        "$schema", "schemaVersion", "candidateId", "status", "network", "chainId",
        "deploymentManifest", "deploymentManifestSha256", "sourceCommit",
        "sourceTreeSha256", "dependencyLockSha256", "standardJsonInputSha256",
        "standardJsonOutputSha256", "contractArtifactsSha256", "webArtifactSha256",
        "observedDeployment", "operations", "foundryVersion", "solcVersion",
        "evmVersion", "optimizerEnabled", "optimizerRuns", "bytecodeHash",
        "frozenAtUtc", "gates", "signatures"
      ])) or (exactkeys([
        "$schema", "schemaVersion", "candidateId", "status", "network", "chainId",
        "deploymentManifest", "deploymentManifestSha256", "sourceCommit",
        "sourceTreeSha256", "dependencyLockSha256", "standardJsonInputSha256",
        "standardJsonOutputSha256", "contractArtifactsSha256", "webArtifactSha256",
        "observedDeployment", "operations", "foundryVersion", "solcVersion",
        "evmVersion", "optimizerEnabled", "optimizerRuns", "bytecodeHash",
        "frozenAtUtc", "supersedes", "gates", "signatures"
      ]))) and
      (.deploymentManifestSha256 | digest) and
      (.sourceCommit | commit) and
      (.sourceTreeSha256 | digest) and
      (.dependencyLockSha256 | digest) and
      (.standardJsonInputSha256 | digest) and
      (.standardJsonOutputSha256 | digest) and
      (.contractArtifactsSha256 | digest) and
      (.webArtifactSha256 | digest) and
      (.observedDeployment | exactkeys([
        "capturedBlockNumber", "capturedBlockHash", "transactionHashes",
        "deploymentProvenance", "webPublicConfig",
        "constructorInputs", "constructorInputsSha256", "creationCodeHashes",
        "runtimeCodeHashes", "factoryRegistration", "usdG", "protocolControl",
        "multisig", "accountingReview", "securityAudit", "sourceVerificationUrls",
        "postDeploySmokeEvidence"
      ])) and
      (.observedDeployment.capturedBlockNumber | integer and . > 0) and
      (.observedDeployment.capturedBlockHash | chainhash) and
      (.observedDeployment.transactionHashes |
        type == "array" and length >= 2 and
        all(.[]; chainhash) and (unique | length) == length) and
      (.observedDeployment.deploymentProvenance |
        exactkeys([
          "factoryDeploymentTransactionHash", "factoryDeploymentInputHash",
          "validationTierCreationTransactionHash", "validationTierCreationInputHash",
          "verifiedAtBlock"
        ]) and
        (.factoryDeploymentTransactionHash | chainhash) and
        (.factoryDeploymentInputHash | chainhash) and
        (.validationTierCreationTransactionHash | chainhash) and
        (.validationTierCreationInputHash | chainhash) and
        (.verifiedAtBlock | integer and . > 0)) and
      (.observedDeployment.deploymentProvenance.factoryDeploymentTransactionHash as $factoryTx |
        .observedDeployment.transactionHashes | index($factoryTx) != null) and
      (.observedDeployment.deploymentProvenance.validationTierCreationTransactionHash as $tierTx |
        .observedDeployment.transactionHashes | index($tierTx) != null) and
      (.observedDeployment.deploymentProvenance.verifiedAtBlock
        == .observedDeployment.capturedBlockNumber) and
      (.observedDeployment.webPublicConfig |
        exactkeys([
          "chainId", "factoryAddress", "factoryRuntimeCodeHash",
          "rendererRuntimeCodeHash", "deployerRuntimeCodeHash",
          "usdGRuntimeCodeHash"
        ]) and
        (.chainId == 46630 or .chainId == 4663) and
        (.factoryAddress | address) and
        (.factoryRuntimeCodeHash | chainhash) and
        (.rendererRuntimeCodeHash | chainhash) and
        (.deployerRuntimeCodeHash | chainhash) and
        (.usdGRuntimeCodeHash | chainhash)) and
      (.observedDeployment.constructorInputs |
        exactkeys(["renderer", "factory", "deployer", "launchTier"])) and
      (.observedDeployment.constructorInputs.renderer |
        exactkeys(["arguments"]) and (.arguments == [])) and
      (.observedDeployment.constructorInputs.factory |
        exactkeys(["paymentToken", "renderer", "initialOwner", "initialFeeRecipient"]) and
        all(.[]; address)) and
      (.observedDeployment.constructorInputs.deployer |
        exactkeys(["factory", "renderer"]) and all(.[]; address)) and
      (.observedDeployment.constructorInputs.launchTier |
        exactkeys([
          "factory", "paymentToken", "renderer", "creator", "name", "symbol",
          "pricePerPeriod", "periodDuration", "rewardBps", "referralBps",
          "supplyCap", "maxPrepaidPeriods", "description", "imageURI", "externalURI"
        ]) and
        (.factory | address) and (.paymentToken | address) and (.renderer | address) and
        (.creator | address) and (.name | nonempty) and (.symbol | nonempty) and
        (.pricePerPeriod | integer and . >= 0) and
        (.periodDuration | integer and . > 0) and
        (.rewardBps | integer and . >= 0 and . <= 9900) and
        (.referralBps | integer and . >= 0 and . <= 9900) and
        (.rewardBps + .referralBps + 100 <= 10000) and
        (.supplyCap | integer and . >= 0) and
        (.maxPrepaidPeriods | integer and . >= 0) and
        (.description | type == "string") and (.imageURI | type == "string") and
        (.externalURI | type == "string")) and
      (.observedDeployment.constructorInputsSha256 | digest) and
      (.observedDeployment.creationCodeHashes |
        exactkeys(["renderer", "factory", "tier"]) and all(.[]; chainhash)) and
      (.observedDeployment.runtimeCodeHashes |
        exactkeys([
          "paymentToken", "renderer", "factory", "deployer", "creationCodeStoreA",
          "creationCodeStoreB", "launchTier"
        ]) and all(.[]; chainhash)) and
      (.observedDeployment.factoryRegistration |
        exactkeys(["factory", "tier", "tierIndex", "registered", "observedAtBlock"]) and
        (.factory | address) and (.tier | address) and
        (.tierIndex | integer and . >= 0) and (.registered == true) and
        (.observedAtBlock | integer and . > 0)) and
      (.observedDeployment.usdG |
        exactkeys([
          "proxy", "implementation", "authority", "decimals", "paused",
          "proxyCodeHash", "implementationCodeHash", "observedAtBlock",
          "observedBlockHash"
        ]) and
        (.proxy | address) and (.implementation | address) and (.authority | address) and
        (.decimals == 6) and (.paused | type == "boolean") and
        (.proxyCodeHash | chainhash) and (.implementationCodeHash | chainhash) and
        (.observedAtBlock | integer and . > 0) and (.observedBlockHash | chainhash)) and
      (.observedDeployment.protocolControl |
        exactkeys(["owner", "pendingOwner", "feeRecipient"]) and all(.[]; address) and
        (.pendingOwner == "0x0000000000000000000000000000000000000000")) and
      (.observedDeployment.multisig |
        exactkeys([
          "address", "runtimeCodeHash", "owners", "threshold", "modules", "guard",
          "fallbackHandler"
        ]) and
        (.address | address) and (.runtimeCodeHash | chainhash) and
        (.owners | type == "array" and length >= 2 and all(.[]; address) and
          (unique | length) == length) and
        (.threshold | integer and . >= 2) and (.threshold <= (.owners | length)) and
        (.modules | type == "array" and all(.[]; address) and (unique | length) == length) and
        (.guard | address) and (.fallbackHandler | address)) and
      (.observedDeployment.accountingReview | review) and
      (.observedDeployment.securityAudit | review) and
      (.observedDeployment.sourceVerificationUrls |
        type == "array" and length >= 7 and
        all(.[]; type == "string" and startswith("https://")) and
        (unique | length) == length) and
      (.observedDeployment.postDeploySmokeEvidence |
        type == "array" and length > 0 and all(.[]; nonempty)) and
      (.observedDeployment.constructorInputs.factory.paymentToken
        == .observedDeployment.constructorInputs.launchTier.paymentToken) and
      (.observedDeployment.constructorInputs.factory.renderer
        == .observedDeployment.constructorInputs.deployer.renderer) and
      (.observedDeployment.constructorInputs.factory.renderer
        == .observedDeployment.constructorInputs.launchTier.renderer) and
      (.observedDeployment.constructorInputs.deployer.factory
        == .observedDeployment.constructorInputs.launchTier.factory) and
      (.observedDeployment.constructorInputs.deployer.factory
        == .observedDeployment.factoryRegistration.factory) and
      (.observedDeployment.constructorInputs.factory.paymentToken
        == .observedDeployment.usdG.proxy) and
      (.observedDeployment.protocolControl.owner == .observedDeployment.multisig.address) and
      (.observedDeployment.webPublicConfig.chainId == .chainId) and
      (.observedDeployment.webPublicConfig.factoryAddress
        == .observedDeployment.factoryRegistration.factory) and
      (.observedDeployment.webPublicConfig.factoryRuntimeCodeHash
        == .observedDeployment.runtimeCodeHashes.factory) and
      (.observedDeployment.webPublicConfig.rendererRuntimeCodeHash
        == .observedDeployment.runtimeCodeHashes.renderer) and
      (.observedDeployment.webPublicConfig.deployerRuntimeCodeHash
        == .observedDeployment.runtimeCodeHashes.deployer) and
      (.observedDeployment.webPublicConfig.usdGRuntimeCodeHash
        == .observedDeployment.runtimeCodeHashes.paymentToken) and
      (
        .network != "robinhood-mainnet" or
        (.observedDeployment.usdG.proxy | ascii_downcase)
          == "0x5fc5360d0400a0fd4f2af552add042d716f1d168"
      ) and
      (.operations |
        exactkeys([
          "incidentContacts", "confirmationPolicy", "productionRpcProviders",
          "vercelProject", "productionHost", "launchCreator", "publicSupersessionWording"
        ]) and
        (.incidentContacts | type == "array" and length >= 2 and all(.[]; nonempty)) and
        (.confirmationPolicy | nonempty) and
        (.productionRpcProviders |
          type == "array" and length >= 2 and all(.[]; nonempty) and
          (unique | length) == length) and
        (.vercelProject | nonempty) and (.productionHost | nonempty) and
        (.launchCreator | nonempty) and (.publicSupersessionWording | nonempty)) and
      (.foundryVersion == "1.7.1") and
      (.solcVersion == "0.8.36") and
      (.evmVersion == "cancun") and
      (.optimizerEnabled == true) and
      (.optimizerRuns == 200) and
      (.bytecodeHash == "ipfs") and
      (.frozenAtUtc | type == "string" and length > 0) and
      (all(.gates[];
        ((. | exactkeys(["status", "evidence", "owner", "reviewedAtUtc"])) or
          (. | exactkeys(["status", "evidence", "owner", "reviewedAtUtc", "blocker"]))) and
        .status == "PASS" and
        (.evidence | type == "array" and length > 0 and all(.[]; nonempty)) and
        (.owner | nonempty) and (.reviewedAtUtc | nonempty))) and
      (.signatures | type == "array" and length >= 2) and
      ((.signatures | map(.role) | unique | length) == (.signatures | length)) and
      ((.signatures | map(.signer) | unique | length) == (.signatures | length)) and
      ([.signatures[] | select(
        (. | exactkeys(["role", "signer", "scheme", "digest", "signature", "signedAtUtc"])) and
        (.role | type == "string" and length > 0) and
        (.signer | type == "string" and length > 0) and
        (.scheme | type == "string" and length > 0) and
        (.digest | digest) and
        (.signature | type == "string" and length > 0) and
        (.signedAtUtc | type == "string" and length > 0)
      )] | length) == (.signatures | length)
    ' "$record" >/dev/null
    ;;
  *)
    echo "unsupported readiness status: $status" >&2
    exit 1
    ;;
esac

echo "Readiness record policy checks passed for status: $status"
