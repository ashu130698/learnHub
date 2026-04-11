import mongoose, { Schema, Document, Model } from 'mongoose'
import bcrypt from 'bcryptjs'

// ─────────────────────────────────────────────────────────────
// TypeScript interface — describes the shape of a User document
// Document adds MongoDB-specific fields like _id, save(), etc.
// ─────────────────────────────────────────────────────────────

export interface IUser extends Document {
    _id: mongoose.Types.ObjectId
    email: string
    passwordHash: string
    role: 'user' | 'admin'
    profile: {
        name: string
        avatarUrl?: string    //optimal field
    }
    createdAt: Date
    updatedAt: Date
    comparePassword(plaintext: string): Promise<boolean>  //instance methosd
}

// ─────────────────────────────────────────────────────────────
// Schema — the actual MongoDB document structure
// Mongoose enforces these rules before any save() call
// ─────────────────────────────────────────────────────────────
const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true, // MongoDB creates a unique index automatically
      lowercase: true, // always store as lowercase — "A@B.com" === "a@b.com"
      trim: true, // remove accidental spaces
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },

    passwordHash: {
      type: String,
      required: true,
      select: false, // NEVER return this field in queries by default
      // Must explicitly ask: User.findOne().select('+passwordHash')
    },

    role: {
      type: String,
      enum: ["user", "admin"], // only these two values are valid
      default: "user", // every new user starts as a regular user
    },

    profile: {
      name: {
        type: String,
        required: true,
        trim: true,
      },
      avatarUrl: {
        type: String, // optional — no `required`
      },
    },
  },
  {
    timestamps: true, // auto-adds createdAt and updatedAt to every document
  },
);

// ─────────────────────────────────────────────────────────────
// Pre-save middleware
// Runs automatically BEFORE every document.save() call
// 'this' refers to the document being saved
// ─────────────────────────────────────────────────────────────
userSchema.pre('save', async function () {
  // Only hash if passwordHash field was actually changed
  // This prevents re-hashing an already-hashed password on profile updates
  if (!this.isModified('passwordHash')) return

  // bcrypt hash with salt rounds = 12
  // Salt rounds: higher = more secure but slower
  // 10 = ~100ms, 12 = ~400ms, 14 = ~1500ms
  // 12 is the production standard — slow enough to stop brute force, fast enough to use
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12)
})

// ─────────────────────────────────────────────────────────────
// Instance method — available on every user document
// Usage: const isValid = await user.comparePassword('plaintextPassword')
// ─────────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (
  plaintext: string
): Promise<boolean> {
  // bcrypt.compare is timing-safe
  // It always takes the same amount of time whether the password matches or not
  // This prevents timing attacks (measuring response time to guess passwords)
  return bcrypt.compare(plaintext, this.passwordHash)
}

// ─────────────────────────────────────────────────────────────
// Create and export the Model
// 'User' → maps to 'users' collection in MongoDB (Mongoose pluralizes automatically)
// ─────────────────────────────────────────────────────────────
export const User: Model<IUser> = mongoose.model<IUser>('User', userSchema)