import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { signToken } from '../middleware/auth';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    if (username.length < 2 || username.length > 24) {
      res.status(400).json({ error: 'Username must be 2-24 characters' });
      return;
    }

    if (password.length < 4) {
      res.status(400).json({ error: 'Password must be at least 4 characters' });
      return;
    }

    const existing = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (existing) {
      res.status(409).json({ error: 'Username already taken' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, passwordHash, isAnonymous: false });

    const token = signToken({
      userId: user._id.toString(),
      username: user.username,
      isAnonymous: false,
    });

    res.status(201).json({
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('[Auth] Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const user = await User.findOne({ username, isAnonymous: false });
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken({
      userId: user._id.toString(),
      username: user.username,
      isAnonymous: false,
    });

    res.json({
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/anonymous
router.post('/anonymous', async (_req: Request, res: Response) => {
  try {
    const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const username = `Guest_${suffix}`;

    const user = await User.create({ username, isAnonymous: true });

    const token = signToken({
      userId: user._id.toString(),
      username: user.username,
      isAnonymous: true,
    });

    res.status(201).json({
      token,
      user: user.toJSON(),
    });
  } catch (error) {
    console.error('[Auth] Anonymous error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
