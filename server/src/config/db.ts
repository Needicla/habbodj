import mongoose from 'mongoose';

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/plugdj';

  try {
    await mongoose.connect(uri);
    console.log('[DB] Connected to MongoDB');
  } catch (error) {
    console.error('[DB] Connection error:', error);
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    console.error('[DB] MongoDB error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected');
  });
}
