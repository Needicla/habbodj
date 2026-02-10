# HabboDJ - Listen Together

A full-stack Plug.dj clone for sharing and listening to music together in real-time. Users join virtual rooms, queue up YouTube/SoundCloud videos, chat, and vote on tracks.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, react-player, socket.io-client
- **Backend**: Node.js, Express, TypeScript, Socket.io, Mongoose
- **Database**: MongoDB

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB running locally (or via Docker)

### 1. Start MongoDB

Using Docker:

```bash
docker-compose up -d
```

Or ensure MongoDB is running on `localhost:27017`.

### 2. Install Dependencies

```bash
npm run install:all
```

### 3. Configure Environment

Copy `.env.example` to `.env` and adjust values if needed:

```bash
cp .env.example .env
```

### 4. Start Development

```bash
npm run dev
```

This starts both the client (http://localhost:5173) and server (http://localhost:3001) concurrently.

## Features

- **Room System**: Create and join rooms with unique names
- **Video Playback**: YouTube and SoundCloud support via react-player
- **Real-time Chat**: Instant messaging within each room
- **Video Queue**: Add videos, vote up/down, see live updates
- **Auto-advance**: Server-side timer automatically plays next video
- **Late-join Sync**: New users join mid-video at the correct timestamp
- **Authentication**: Register with username/password or join as guest
- **Moderation**: Room hosts can skip videos, remove queue items, and kick users
- **Responsive**: Works on both desktop and mobile

## Project Structure

```
plugdj/
├── client/          # React frontend (Vite)
│   └── src/
│       ├── components/  # UI components
│       ├── contexts/    # Auth and Socket providers
│       ├── hooks/       # useRoom, useSocket
│       ├── pages/       # Login, Home, Room
│       └── lib/         # API client, utilities
├── server/          # Express backend
│   └── src/
│       ├── config/      # Database connection
│       ├── middleware/   # JWT auth
│       ├── models/      # Mongoose schemas
│       ├── routes/      # REST API endpoints
│       ├── socket/      # Socket.io handlers
│       └── utils/       # Video validation, helpers
└── docker-compose.yml
```

## Deployment (Render + Vercel)

### Step 1: Push to GitHub

Create a GitHub repo and push this project:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/habbodj.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy Server to Render

1. Go to [render.com](https://render.com) and sign up (free)
2. Click **New > Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Root Directory**: `server`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/index.js`
5. Add **Environment Variables**:
   - `MONGODB_URI` = your MongoDB Atlas connection string
   - `JWT_SECRET` = a random secret string (e.g. `myapp-secret-key-2024`)
   - `CLIENT_URL` = your Vercel URL (add after Step 3)
   - `NODE_ENV` = `production`
6. Click **Create Web Service** and wait for it to deploy
7. Copy the Render URL (e.g. `https://habbodj-server.onrender.com`)

### Step 3: Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) and sign up (free)
2. Click **Add New > Project**, import your GitHub repo
3. Configure:
   - **Root Directory**: `client`
   - **Framework Preset**: Vite
4. Add **Environment Variable**:
   - `VITE_API_URL` = your Render URL from Step 2 (e.g. `https://habbodj-server.onrender.com`)
5. Click **Deploy**

### Step 4: Update Render with Vercel URL

Go back to Render dashboard, add/update the `CLIENT_URL` environment variable with your Vercel URL (e.g. `https://habbodj.vercel.app`).
