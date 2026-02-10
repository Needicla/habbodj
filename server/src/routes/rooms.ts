import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Room } from '../models/Room';
import { authMiddleware } from '../middleware/auth';
import { slugify } from '../utils/helpers';

const router = Router();

// GET /api/rooms — list all rooms
router.get('/', async (_req: Request, res: Response) => {
  try {
    const rooms = await Room.find()
      .select('name slug creatorId isPrivate currentVideo queue createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const result = rooms.map((room) => ({
      ...room,
      userCount: 0, // will be patched by socket presence data
      queueLength: room.queue?.length ?? 0,
    }));

    res.json(result);
  } catch (error) {
    console.error('[Rooms] List error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rooms/:slug
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const room = await Room.findOne({ slug: req.params.slug });
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.json(room.toJSON());
  } catch (error) {
    console.error('[Rooms] Get error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rooms — create a new room (auth required)
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { name, isPrivate, password } = req.body;

    if (!name || name.trim().length < 2 || name.trim().length > 50) {
      res.status(400).json({ error: 'Room name must be 2-50 characters' });
      return;
    }

    if (isPrivate && (!password || password.length < 1)) {
      res.status(400).json({ error: 'Private rooms require a password' });
      return;
    }

    const slug = slugify(name);
    if (!slug) {
      res.status(400).json({ error: 'Invalid room name' });
      return;
    }

    const existing = await Room.findOne({ slug });
    if (existing) {
      res.status(409).json({ error: 'A room with that name already exists' });
      return;
    }

    const roomData: Record<string, any> = {
      name: name.trim(),
      slug,
      creatorId: req.user!.userId,
      isPrivate: !!isPrivate,
    };

    if (isPrivate && password) {
      roomData.password = await bcrypt.hash(password, 10);
    }

    const room = await Room.create(roomData);

    res.status(201).json(room.toJSON());
  } catch (error) {
    console.error('[Rooms] Create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
