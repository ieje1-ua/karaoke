# Karaoke Transposer

A personal web app to track your karaoke songs, learn your vocal range, and get transposition recommendations.

## Features

- **PIN-protected access** - Set a PIN on first visit; stored securely (hashed with bcrypt), not in source code
- **Song registry** - Track songs with original key, vocal range, and your comfortable semitone shift
- **Vocal range estimation** - Automatically calculates your comfortable range from registered songs
- **Transposition recommendations** - Enter a new song's range and get an optimal semitone adjustment
- **Visual piano display** - See your vocal range mapped on a piano keyboard
- **Modern dark UI** - Elegant dark theme with warm golden accents

## Local Development

```bash
npm install
npm start
```

The app runs on `http://localhost:3000` by default (configurable via `PORT` env variable).
In local mode, data is stored in a SQLite file (`data.db`).

## Deploy to Vercel

This app is ready for Vercel deployment using [Turso](https://turso.tech) as the database.

### 1. Create a Turso database

```bash
# Install Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Sign up / log in
turso auth signup   # or: turso auth login

# Create a database
turso db create karaoke

# Get the connection URL
turso db show karaoke --url

# Create an auth token
turso db tokens create karaoke
```

### 2. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (follow prompts to link your project)
vercel

# Set environment variables
vercel env add TURSO_DATABASE_URL   # paste the libsql://... URL
vercel env add TURSO_AUTH_TOKEN     # paste the token

# Deploy to production
vercel --prod
```

### 3. Done

Open the URL that Vercel gives you. The first time you access the app, it will ask you to set a PIN.

## Tech Stack

- Node.js + Express (serverless on Vercel)
- SQLite locally / Turso (libsql) in production
- Vanilla HTML/CSS/JS frontend
