# Source and dependency notes

This repository contains the locally authored Electron app, Watergirl input broker, coordinate reader, React interface, tests and supported development tooling. The JSONL process transport was adapted from an existing local transport implementation.

The real game is loaded through its normal publisher page at https://www.coolmathgames.com/0-fireboy-and-water-girl-in-the-forest-temple. The publisher page and game run in an isolated native child view of the app window. No game bundle, graphics, soundtrack, engine, saved browser session or captured level map is included in this repository.

The game and its audiovisual assets remain their respective owners' property. The app does not block advertisements, bypass domain checks, disable browser security or create an offline port. The production player reads collision geometry from the running game and does not receive images.

`tests/fixtures/physics-world.ts` defines an original synthetic test world. Local diagnostic recordings, account information and historical experiments are excluded from publication.

Dependency versions are pinned by `package-lock.json`; their upstream licenses apply. `protocol/` contains only the generated Codex API types transitively referenced by the app. See its README for generation and upstream attribution.
