# Karaoke Transposer

A personal web app to track your karaoke songs, learn your vocal range, and get transposition recommendations.

## Features

- **PIN-protected access** - Set a PIN on first visit; stored securely (hashed with bcrypt), not in source code
- **Song registry** - Track songs with original key, vocal range, and your comfortable semitone shift
- **Vocal range estimation** - Automatically calculates your comfortable range from registered songs
- **Transposition recommendations** - Enter a new song's range and get an optimal semitone adjustment
- **Visual piano display** - See your vocal range mapped on a piano keyboard
- **Modern dark UI** - Elegant dark theme with warm golden accents

## Setup

```bash
npm install
npm start
```

The app runs on `http://localhost:3000` by default (configurable via `PORT` env variable).

## Data

All data is stored in a local SQLite database (`data.db`) which is gitignored. The PIN is hashed with bcrypt and never stored in plaintext.

## Tech Stack

- Node.js + Express
- SQLite (via better-sqlite3)
- Vanilla HTML/CSS/JS frontend
