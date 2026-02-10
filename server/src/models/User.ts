import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  username: string;
  passwordHash: string | null;
  isAnonymous: boolean;
  avatarColor: string;
  createdAt: Date;
}

const AVATAR_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#84CC16',
  '#22C55E', '#14B8A6', '#06B6D4', '#3B82F6',
  '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
  '#EC4899', '#F43F5E',
];

function randomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

const userSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 2,
      maxlength: 24,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    avatarColor: {
      type: String,
      default: randomAvatarColor,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.set('toJSON', {
  transform(_doc, ret: Record<string, any>) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model<IUser>('User', userSchema);
