import { Schema, model, type Document, type Types } from 'mongoose';

export interface RefreshSessionDoc extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  /** sha256 hash of the refresh token; the raw token is never stored. */
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  /** Hash of the session this one replaced (rotation chain, audit only). */
  replacedByTokenHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const refreshSessionSchema = new Schema<RefreshSessionDoc>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByTokenHash: { type: String, default: null },
  },
  { timestamps: true },
);

refreshSessionSchema.index({ tokenHash: 1 }, { unique: true });
// Let MongoDB clean up sessions after they expire.
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshSession = model<RefreshSessionDoc>(
  'RefreshSession',
  refreshSessionSchema,
);
