# Guess the Rank

A real-time multiplayer party game where players rank each other on "Who is most likely to…" prompts — then everyone guesses how a random player was ranked. Questions are generated dynamically using AI (via Groq API), with a fallback to a predefined pool in `questions.json`.

Built with Node.js, Express, Socket.io, and React.

## Live Demo

Play at: [https://guesstherank.xavierrao.com/](https://guesstherank.xavierrao.com/)

*Hosted on Render.com's free tier — occasional cold starts (30–60s delay on first load) are expected.*

## How It Works

Each round, every player receives a unique "Who is most likely to…" question and secretly ranks all players from most to least likely. Then, for each player's ranking, a random target is chosen and everyone else guesses what position that player was ranked. Points are awarded and the full ranking is revealed before moving to the next player.

## Features

- **Multiplayer**: Create or join games with a shareable Game ID or URL
- **AI-generated questions**: Fresh prompts via the Groq API (`llama-3.3-70b-versatile`), with similarity checking to avoid repeats. Falls back to `questions.json` if the API is unavailable
- **Real-time gameplay**: Rankings, guesses, and score updates via WebSockets
- **Scoring**:
  - Guessers earn **1 point** for correctly identifying the exact rank position
  - The ranker earns **1 point per correct guesser**, capped at **3 points per reveal**
- **Reconnection grace period**: Disconnected players have 15 seconds to rejoin before being removed
- **Persistent game URLs**: Each game lives at `/game/<id>` — shareable and rejoindable
- **Spectator mode**: Players who join mid-round watch until the next round starts, then are promoted automatically
- **Owner reassignment**: If the host leaves, the next player becomes the new host
- **Automatic cleanup**: Games are deleted after 1 hour of inactivity

## Prerequisites

- Node.js v14+
- A [Groq API key](https://console.groq.com/keys) (optional — game falls back to `questions.json` without one)

## Installation

1. Clone the repo:
   ```bash
   git clone <your-repo-url>
   cd mostLikelyTo
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   # .env
   GROQ_API_KEY=your_groq_api_key_here
   ```

4. Start the server:
   ```bash
   node server.js
   ```

5. Open [http://localhost:3000](http://localhost:3000)

> **Note**: Open the app via `http://localhost:3000`, not by opening `index.html` directly — it must be served over HTTP.

## Usage

1. **Create a game**: Enter your name and click "Create Game". Tap the Game ID badge to copy it or share the full URL
2. **Join a game**: Enter your name and the Game ID, or open the shared link directly
3. **Play a round**:
   - Each player secretly ranks all players on their unique question
   - For each player's reveal, everyone else guesses the rank of a randomly chosen target
   - Scores are awarded and the full ranking is shown
4. **Continue**: The host clicks "Next" to move through reveals and start new rounds
5. **Leaving**: Closing the tab or navigating away gives you a 15-second window to rejoin via the game URL or Game ID. Your name is saved in `localStorage`

*Best with 3 or more players.*

## Project Structure

```
├── server.js          # Express server, Socket.io events, game logic, question generation
├── public/
│   ├── index.html     # Frontend entry point
│   ├── faq.html       # FAQ & How to Play (served at /faq)
│   ├── app.js         # React UI
│   └── styles.css     # Styles
├── questions.json     # Fallback question pool
└── package.json
```

## Dependencies

- **express** — web server
- **socket.io** — real-time communication
- **axios** — Groq API requests
- **string-similarity** — duplicate question detection

React and React DOM are loaded via CDN.

## Deployment (Render.com)

1. New → Web Service → connect your Git repo
2. Build command: `npm install`
3. Start command: `node server.js`
4. Add environment variable: `GROQ_API_KEY`

Free tier notes: spins down after 15 minutes of inactivity, takes 30–60 seconds to wake.

## Troubleshooting

- **Questions not loading**: Check that `questions.json` is valid JSON. If using AI, verify your Groq API key and quota
- **Can't connect**: Make sure the server is running and you're accessing via `http://localhost:3000`
- **Styles missing**: Don't open `index.html` directly — serve it with `node server.js`
- **Can't rejoin**: Your name is saved in `localStorage` in your browser. If the game expired (1 hour of inactivity) you'll be sent back to the home screen

## Contributing

PRs welcome. Ideas: more fallback questions, improved AI prompts, an end-game summary screen, or custom question sets.

## License

ISC — see `package.json`.