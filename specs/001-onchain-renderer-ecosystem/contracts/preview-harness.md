# Renderer Preview Harness Contract

## Purpose

`RendererPreviewHarness` allows the canonical RPC to execute the exact creation bytecode of an
undeployed renderer without publishing it. Its entrypoint is intentionally non-view because it uses
`CREATE` inside EVM execution; the browser invokes it only with `eth_call`, so the node discards the
transient contract and state.

## Proposed interface

```solidity
interface IRendererPreviewHarness {
    error CandidateDeploymentFailed();
    error CandidateCallFailed(bytes reason);
    error EmptyCreationCode();
    error EmptyCallData();

    function preview(bytes calldata creationCode, bytes calldata rendererCallData)
        external
        returns (bytes memory rendererResult);
}
```

## Required behavior

1. Reject empty creation code or renderer calldata.
2. Copy the supplied final initcode and create the candidate with zero value.
3. Call the candidate with the exact supplied renderer calldata and zero value.
4. Return the candidate's raw return data.
5. Bubble a bounded failure reason when creation or invocation fails.
6. Expose no owner, registry, persistent candidate map, withdrawal, or arbitrary value transfer.

## Browser call modes

### Undeployed candidate

- Encode `previewSVG(context)` or `previewTokenURI(context)` using the generated renderer ABI.
- Call `RendererPreviewHarness.preview(creationCode, rendererCallData)` with viem `client.call`.
- Decode the nested renderer result using the generated ABI.

### Deployed renderer

- Call the renderer address directly with the same encoded renderer method and context.
- Do not route deployed addresses through the harness.

## Safety and limits

- Browser calls use the existing two-request limiter and 15-second deadline.
- The canonical RPC's gas, request-size, and response-size failures are surfaced as failed examples.
- No wallet account is supplied to the preview call and no transaction is constructed.
- The harness address comes only from a promoted Foundry broadcast and generated wagmi bindings.
- The harness does not make a renderer acceptable; it only returns the same observable result the
  creator reviews.
