# Local development and creator preview

Use this workflow while creating or revising a renderer. It requires no production credential or public-chain write.

## 1. Check tools

From this repository:

```sh
./scripts/check-dependencies.sh
```

Required: Git, Bun, Forge, Cast, and Anvil. Docker is optional.

If required tools are missing, explain the changes to the user and ask before running:

```sh
./scripts/bootstrap.sh --install
```

The bootstrap installs only missing Bun or Foundry tooling through their official installers. It does not install a wallet, create a key, or modify the renderer.

## 2. Create a renderer project

```sh
./scripts/new-renderer.sh ./my-renderer
```

The command copies the self-contained Foundry template and refuses to overwrite an existing nonempty directory.

Edit `my-renderer/src/CustomRenderer.sol` to implement the art brief. Keep the interface and types unless the Backed By Fans protocol itself changes.

## 3. Run the local workflow

```sh
./scripts/test-renderer.sh ./my-renderer --membership-name "Example Membership"
```

This wrapper:

1. checks dependencies;
2. runs Forge formatting, compilation, and contract tests;
3. packages the final artifact with the illustrative membership name used by the previews;
4. evaluates six representative calls using disposable local Anvil state;
5. writes a compact HTML gallery.

The packaging and gallery helpers start their own loopback-only Anvil instance with a
100,000,000-gas block limit and estimate each local deployment before submitting it. Do not add a
larger hardcoded transaction gas limit or patch a downloaded renderer project to work around an
Anvil block-limit rejection; update the skill toolkit if this managed rehearsal fails.

The six cases are token IDs 1, 7, and 42 across active and expired states, with generated and browser-image slots represented.

The package contains final initcode for the public browser to pass to the renderer registry. It does not contain a deployment salt or predicted address; the registry returns the actual address after the creator signs the deployment transaction.

A failed call should appear as a failed example and should be fixed before asking the creator to accept the design. A successful call means only that the tested interface call returned a displayable result.

## 4. Ask the creator

Open the generated gallery and let the creator inspect the artwork. The local gallery is a mechanical rehearsal. When the creator requested an image, the approval pass must also load that actual image in the public browser preview so the creator can judge its treatment. One selected result may be viewed large; the remaining cases should be compact labeled thumbnails.

The creator may:

- approve the design and continue to browser preview or deployment;
- reject it and request changes;
- stop without deploying.

Do not turn this decision into proof, certification, safety scoring, receipt review, or byte-preservation claims.

## 5. Hand off to the browser

The package can be imported directly into the public renderer preview page.

When local browser access is allowed, the optional helper can hand off the same package:

```sh
bun ./scripts/session-helper.ts \
  --package ./my-renderer/renderer-package.json \
  --image /path/to/creator-image.jpg \
  --page-url https://HOST/render
```

Open the printed URL in the creator's regular browser first so their wallet extensions are available. Fall back to an agentic browser only if opening the external browser does not work.

If the agent runs in a cloud, sandbox, or VM—or loopback is blocked—return `renderer-package.json` to the creator as a downloadable file. Instruct them to open `https://HOST/render` in their own browser, upload the package, and choose the source JPEG or PNG there. Do not rebuild the package, upload either file to a storage service, or request wallet secrets.
