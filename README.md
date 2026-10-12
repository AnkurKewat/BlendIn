# Blend In

Blend In is a real-time social deduction party game for 2–8 people. Players join from separate devices with a room code, receive a private word, trade clues, discuss in voice or text chat, and vote for the imposter.

## Run locally

1. Install Node.js 20 or newer.
2. Open this folder in a terminal and run `npm start`.
3. Open `http://localhost:3000` on the host device.
4. To play on the same Wi-Fi, share the host computer's local network address and room code. The host firewall may ask to allow Node.js.

Use `npm test` to run the built-in game-rule checks. The app has no third-party npm dependencies.

## How to play

- Each round, everyone privately checks their word. Most players get the same word; the imposter gets a different, related word. Only the imposter sees that role.
- Players submit one short clue without saying their word. Each clue appears in the group chat as soon as it is sent.
- Talk over voice or text, then vote for the player with the different word.
- **3–8 players:** catching the imposter gives each non-imposter 1 point. Escaping or tying gives the imposter 2 points. If caught, the imposter can guess the shared word for 2 bonus points.
- **2 players:** after both clues, the imposter guesses the other player's word. A correct guess earns 2 points; a miss gives the other player 1 point.
- Play five rounds. The highest score wins.

## Voice and deployment

Microphone access requires a secure browser context. `http://localhost:3000` works on the host computer. Other devices need an HTTPS deployment. STUN is configured by default; voice across restrictive networks often needs a TURN relay.

For a coturn server configured with the REST shared-secret authentication mechanism, set these environment variables on the game host:

- `BLEND_IN_TURN_URLS`: comma-separated TURN URLs, for example `turn:turn.example.com:3478?transport=udp,turns:turn.example.com:5349?transport=tcp`.
- `BLEND_IN_TURN_SECRET`: the shared secret configured on coturn. Keep it in the hosting provider's secret settings; never commit it to Git.

The server issues one-hour, player-specific TURN credentials. If these variables are not set, the game falls back to STUN, which may not connect every pair of networks.

Room and chat state is saved to `data/rooms.json`. Set `BLEND_IN_DATA_DIR` to a persistent mounted disk on the hosting provider; otherwise a redeploy or machine replacement may erase active rooms. This version is designed for a **single server instance**. Its room state and live event streams are held by that process. To scale to multiple instances, move room state to a shared database and broadcast events through a shared service such as Redis.

Use the provider's HTTPS and `PORT` settings. The health check is `GET /health`. In production, configure a persistent disk and TURN service before advertising voice as reliable across the public internet.

## Data and privacy

The server stores room names, scores, clues, and chat messages in the room file for reconnects. Rooms expire after 48 hours without activity. Player session IDs are stored in the browser's local storage; anyone with access to a player's device can rejoin as that player. Avoid sharing private or sensitive information in game chat.
## Render deployment

This repository includes `render.yaml` for a single-instance Render web service. It enables HTTPS, configures `/health`, and mounts persistent room storage at `/var/data`. It uses a paid compute plan because Render Free web services do not support persistent disks. For a temporary free preview, remove the `disk` section and the persistent data setting; room state may be lost when the service restarts.

In Render, create a Blueprint from this repository and provide `BLEND_IN_TURN_URLS` and `BLEND_IN_TURN_SECRET` as secret environment values from your TURN provider. Keep the service at one instance. The bundled file-based room store and Server-Sent Events connections are process-local and cannot coordinate multiple instances. The app can serve a private HTTPS trial without TURN, but voice reliability across different networks is not assured until TURN is configured.

Before inviting players publicly, test the deployed HTTPS URL on current iOS and Android phones using separate Wi-Fi and mobile-data connections. Verify room creation/joining, reconnects, microphone permission, two-way audio, chat/clues, voting, scoring, and restart recovery. The repository does not configure your hosting account, buy a TURN relay, or perform those real-device checks.
