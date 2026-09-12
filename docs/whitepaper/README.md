# Whitepaper

Edit `whitepaper.md`, then generate the public PDF:

```sh
cd web
bun install
bunx playwright install chromium # Once per machine
bun run whitepaper:build
```

The command works from the repository's `web` directory and writes `web/public/backed-by-fans-whitepaper.pdf`. About links to that stable URL. Commit the generated PDF alongside changes to its source so deployment serves the latest version.

`print.css` controls the PDF layout. Fonts come from the web app's installed packages. Images are loaded locally; When contract sources are committed, references point to that Git revision. For uncommitted source, the PDF prints local source paths and a SHA-256 source snapshot with its base revision, so a draft never links new behavior to older code. The build fails if an image or Git revision is unavailable and replaces the public PDF only after rendering succeeds.

To rebuild the SVG figures, run `python3 docs/whitepaper/build_diagrams.py` from the repository root. See `assets/README.md` for figure details.
