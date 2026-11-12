# Watergirl Teammate

A local macOS app that puts the real Fireboy and Watergirl: Forest Temple game and a Codex-powered Watergirl teammate in one window. You control Fireboy with the arrow keys. The AI controls only Watergirl, using bounded A/W/D actions.

## How it works

The app reads the currently loaded game's physics world: both players, complete terrain polygons and holes, slopes, entire water/fire/green pools, platforms, mechanisms, boxes, exits and collectibles. Codex receives JSON text, chooses one action, and gets a fresh complete observation after that action. The game continues while the model thinks; this is a decision loop, not a fixed-rate stream into an ongoing model response.

There is no screenshot input, image fallback, hardcoded level route or automatic replacement move. Missing or unsupported collision geometry pauses the attempt. The reader is level-independent, but live testing has covered level 1 only. A complete cooperative win is not verified, and weaker models can make poor route choices despite receiving the full map.

The app includes an editable system prompt, skills, instruction guardrails and runtime action checks. The master **Skills & guardrails** switch disables the saved extras without deleting them; the system prompt remains active. Changes apply to a new attempt. Resume keeps the attempt's frozen configuration.

## Run locally

Requirements:

- macOS; packaged builds currently target Apple silicon.
- Node.js 22.12 or newer and npm.
- An installed Codex CLI with your own ChatGPT subscription sign-in. The current isolation checks are pinned to `codex-cli 0.164.0-alpha.11.1`; another version requires updating and verifying the adapter. This repository does not include a Codex binary, account, credentials, or API-key fallback.
- An internet connection for the publisher's game and Codex.

```sh
git clone https://github.com/gabed457/fireboy-watergirl.git
cd fireboy-watergirl
npm ci
npm test
npm run build
npm start
```

Finish the publisher's normal Play flow and select an unlocked level. Click **Confirm level**, then **Start AI**. Click the game to play Fireboy with the arrow keys. The AI can also run while another app is focused; its keys are sent only to the verified game frame. Audio starts muted.

**Pause AI** releases Watergirl's keys while game physics continues. **Resume AI** reads fresh state. **Stop** ends the attempt. Pause before using game menus and confirm again after changing levels or resizing.

A fresh installation starts with a short baseline prompt and no skills or guardrails. The optional text in [`filming-profiles/live-state/profile.json`](filming-profiles/live-state/profile.json) provides general coaching to copy into the editors; it contains no level coordinates or routes and is not automatically installed.

The **Inspector** shows the current map and compiled instructions. Local attempt records contain observations, proposed actions and model timing.

## Build the Mac app

```sh
npm run package:mac
```

The app is created at `release/mac-arm64/Watergirl Teammate.app`. Builds are unsigned. Move it to your Applications folder if desired. The optional `Launch Watergirl.command` expects it in your personal `~/Applications` folder.

## Tests and privacy

```sh
npm test
npm run build
```

Unit tests use an authored synthetic world, not private game recordings, and do not require a signed-in Codex account. GitHub Actions runs the tests and build for pull requests.

App settings, profiles, runs and browser data stay under `~/Library/Application Support/Watergirl Teammate`. Codex authentication remains in your local Codex installation. Those files, recordings, logs, backups and build products are excluded from Git. Do not attach complete account files or raw session exports to issues or pull requests.

## Contributing

Anyone can fork this public repository and open a pull request. **Only @gabed457 can merge changes into this repository.** See [CONTRIBUTING.md](CONTRIBUTING.md).

The game is loaded from its normal publisher page. Its game code, art, audio and engine are not distributed here. See [PROVENANCE.md](PROVENANCE.md) for source and dependency notes.
