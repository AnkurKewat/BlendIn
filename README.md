# Blend In

A lightweight real-time social deduction game for 2–8 players. Players join the same room from their own browser using a room code. No external packages or account setup are required.

## Run it

1. Install Node.js 18 or newer.
2. Open a terminal in this folder and run `node server.js`.
3. On the host device, open `http://localhost:3000`.
4. For friends on the same Wi-Fi, share the host device's local network address with port `3000` (for example, `http://192.168.1.20:3000`). They can join with your room code.

## Group voice

After joining a room, tap **Turn mic on** to allow microphone access and talk with the group. Tap **Mute mic** whenever you want to stop sending audio. The mic indicator shows who is currently unmuted. Each player must allow microphone access on their own device. The live group text chat is available beside the game on wide screens and from the **Chat** button on phones.

Browsers only grant microphone access on secure pages. `http://localhost:3000` works on the host computer, but other devices need the game served over HTTPS. When players are on different networks, a TURN relay may also be needed for reliable voice connections.

The host's firewall may ask whether to allow local network access. Rooms are held in server memory and disappear when the server stops. For players joining from different networks, deploy the folder on a publicly reachable Node.js host and share its URL.

## How to play

- Before each round, every player privately sees their word. Only the imposter is explicitly told their role; the clue round begins after everyone confirms they are ready.
- Most players receive the same word. The imposter gets a different, related word. As soon as a player submits a clue, everyone can see it while the remaining players are still thinking.
- Choose one of six funny face avatars when entering a room. The avatar appears beside the player's name and messages.
- Submitted clues appear automatically in the shared chat with the sender's avatar and name, accompanied by a short notification chime.
- A cheerful tune plays when the group catches the imposter; a descending sad tune plays when the imposter wins.
- After everyone submits a clue, the group votes for who had the different word.
- **3–8 players:** finding the imposter gives each non-imposter 1 point. If the imposter escapes, including a tie, they earn 2 points. If caught, the imposter can guess the shared word for 2 bonus points.
- **2 players:** after both clues, the different-word player guesses the other player's word. A correct guess earns the imposter 2 points; a miss earns the other player 1 point.
- Play five rounds. The highest score wins.

Each device keeps its room session in browser storage so a refresh reconnects to the same player while the server is running.
