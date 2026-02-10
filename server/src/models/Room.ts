import mongoose, { Schema, Document } from 'mongoose';

export interface IVideoItem {
  url: string;
  title: string;
  duration: number; // seconds
  addedBy: {
    _id: string;
    username: string;
  };
  upvotes: string[];   // userIds
  downvotes: string[]; // userIds
}

export interface ICurrentVideo {
  url: string;
  title: string;
  duration: number;
  addedBy: {
    _id: string;
    username: string;
  };
  startedAt: Date;
}

export interface IRoom extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  creatorId: mongoose.Types.ObjectId;
  isPrivate: boolean;
  password?: string; // bcrypt-hashed
  currentVideo: ICurrentVideo | null;
  queue: IVideoItem[];
  createdAt: Date;
}

const videoItemSchema = new Schema<IVideoItem>(
  {
    url: { type: String, required: true },
    title: { type: String, required: true },
    duration: { type: Number, default: 0 },
    addedBy: {
      _id: { type: String, required: true },
      username: { type: String, required: true },
    },
    upvotes: [{ type: String }],
    downvotes: [{ type: String }],
  },
  { _id: true }
);

const currentVideoSchema = new Schema<ICurrentVideo>(
  {
    url: { type: String, required: true },
    title: { type: String, required: true },
    duration: { type: Number, default: 0 },
    addedBy: {
      _id: { type: String, required: true },
      username: { type: String, required: true },
    },
    startedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const roomSchema = new Schema<IRoom>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    password: {
      type: String,
      default: undefined,
    },
    currentVideo: {
      type: currentVideoSchema,
      default: null,
    },
    queue: {
      type: [videoItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

roomSchema.set('toJSON', {
  transform(_doc, ret: Record<string, any>) {
    delete ret.__v;
    delete ret.password; // never expose hashed password
    return ret;
  },
});

export const Room = mongoose.model<IRoom>('Room', roomSchema);
