# onchain-render-skill

An MIT-licensed agent skill and toolchain for creating, testing, previewing, and deploying Backed By Fans-compatible onchain membership renderers.

The mechanical tooling checks that a renderer implements the expected interface and returns displayable results for representative inputs. The creator—not the tooling—decides whether the design is good.

## Give this to an agent

Point an agent at the public skill page or this repository:

> Read the onchain renderer skill and help me create an onchain membership design. Show me the representative previews before deployment, then give me the renderer contract address.

An agent should begin with:

```sh
./scripts/check-dependencies.sh
```

If tools are missing, the agent should explain the installation and ask before running:

```sh
./scripts/bootstrap.sh --install
```

Then create and test a renderer:

```sh
./scripts/new-renderer.sh ./my-renderer
./scripts/test-renderer.sh ./my-renderer
```

The second command writes `renderer-package.json` and a compact gallery under `renderer-gallery/`.

The skill itself asks about the creator, visual direction, and whether the renderer should use an image. If an image is requested, the agent loads it into the browser preview directly through the optional loopback helper or returns the package for upload at `/render` from the creator's own browser.

## Repository contents

- `SKILL.md` — primary agent instructions.
- `llms.txt` — compact public agent handoff.
- `template/` — self-contained Foundry renderer starter.
- `scripts/` — dependency checks, project creation, tests, package creation, local gallery, and optional loopback handoff.
- `references/` — interface, local testing, and browser-wallet deployment details.
- `tests/docker/` — clean and provisioned environment checks.

## Requirements

- POSIX shell
- Git
- Bun
- Foundry (`forge`, `cast`, and `anvil`)
- Docker is optional and used only for clean-environment validation.

## Preview and deployment

Renderer evaluation belongs in the standalone public renderer preview page. The membership Creator Studio only needs a Custom renderer option and a contract-address field.

Deployment is submitted by the creator through the established browser-wallet flow on Robinhood testnet (chain ID 46630). This repository never needs or accepts a creator private key.

## Development

Run the repository checks:

```sh
bun test
./tests/dependency-tools.test.sh
./tests/e2e-local.sh
```

Run Docker coverage when Docker is available:

```sh
./tests/docker/run.sh
```

## License

MIT. See [LICENSE](LICENSE).
