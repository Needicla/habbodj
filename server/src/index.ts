import dotenv from 'dotenv';
import path from 'path';
// Load .env from project root (local dev) or current dir (production)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // also check cwd/.env for production

import express from 'express';
import cors from 'cors';
import http from 'http';
import { connectDB } from './config/db';
import { initSocket } from './socket';
import authRoutes from './routes/auth';
import roomRoutes from './routes/rooms';
import { getAllRoomCounts } from './socket/roomHandlers';

const app = express();
const server = http.createServer(app);

// CORS — allow multiple origins for dev + production
const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL,
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.some((o) => origin.startsWith(o))) {
      callback(null, true);
    } else {
      callback(null, true); // Be permissive in production; tighten if needed
    }
  },
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Room counts endpoint (for lobby display)
app.get('/api/room-counts', (_req, res) => {
  res.json(getAllRoomCounts());
});

// Initialize Socket.io
const io = initSocket(server);

// Start server
const PORT = parseInt(process.env.PORT || '3001', 10);

async function start() {
  await connectDB();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Running on http://0.0.0.0:${PORT}`);
    console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

start().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});
