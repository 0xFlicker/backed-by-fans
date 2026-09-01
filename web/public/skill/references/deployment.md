# Browser-wallet deployment

Read this only after the creator approves the renderer design or when deployment is blocked.

## Authority boundary

The agent prepares the renderer and package. The public renderer page prepares the deployment request. Only the creator's connected browser wallet may authorize and submit it.

Never ask for or use a private key, mnemonic, keystore, wallet password, backend signer, or agent-controlled deployment account.

## Before showing Deploy

Mechanical deployment checks may confirm:

- the package targets Robinhood testnet, chain ID 46630;
- the final initcode and constructor arguments fit the configured chain limits;
- the predicted address is derived from the selected salt and initcode;
- the configured deployer can be called and the predicted address is not already occupied;
- the creator is looking at the package and representative results they chose to approve.

These checks are interface and transaction preparation, not a safety certification or artistic judgment.

## Deployment

After the creator clicks Deploy, the existing wagmi/viem browser-wallet lifecycle owns simulation, chain selection, signature prompts, submission, pending state, replacement, cancellation, receipts, and errors.

Do not recreate that lifecycle in this repository.

On success, lead with:

> Renderer deployed on Robinhood testnet: `0x…`
>
> Copy this address to use or share the renderer.

On failure, state the immediate wallet or chain error and that no renderer address was published by that attempt. Do not burden the creator with journals, source-verification records, proof language, or receipt interpretation.

## Protocol deployment is separate

Changing the Backed By Fans renderer interface or immutable protocol contracts may require a new operator-approved testnet protocol deployment. That is outside an ordinary creator renderer deployment.

If a protocol deployment becomes necessary, stop after local validation and tell the operator exactly what must be deployed. Separate operator approval and interactive password entry are required before broadcast.
