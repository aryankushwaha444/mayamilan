import mongoose from "mongoose";

const photoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: null },
    isPrimary: { type: Boolean, default: false },
    hash: { type: String },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);
const locationSchema = new mongoose.Schema(
  {
    city: { type: String, default: "" },
    country: { type: String, default: "" },
    coordinates: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] },
    },
  },
  { _id: false }
);

// ✅ Single source of truth for preference defaults, reused by the schema AND the
// repair hook below so they can never drift out of sync.
const PREF_DEFAULTS = {
  minAge: 18,
  maxAge: 80,
  maxDistance: 50,
  preferredGender: "all",
};

const preferencesSchema = new mongoose.Schema(
  {
    minAge: { type: Number, default: PREF_DEFAULTS.minAge, min: 18, max: 100 },
    maxAge: { type: Number, default: PREF_DEFAULTS.maxAge, min: 18, max: 100 },
    preferredGender: {
      type: String,
      enum: ["male", "female", "non-binary", "other", "all"],
      default: PREF_DEFAULTS.preferredGender,
    },
    maxDistance: {
      type: Number,
      default: PREF_DEFAULTS.maxDistance,
      min: 1,
      max: 500,
    },
  },
  { _id: false }
);
const backupCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    used: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },
  },
  { _id: false }
);

function arrayLimit(max) {
  return function (val) {
    return val.length <= max;
  };
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      select: false,
      required: [
        function () {
          return this.oauthProvider === "local";
        },
        "Password is required",
      ],
    },
    oauthProvider: {
      type: String,
      enum: ["local", "google", "apple"],
      default: "local",
    },
    oauthId: { type: String, default: null },
    dateOfBirth: { type: Date, default: null },
    gender: {
      type: String,
      enum: ["male", "female", "non-binary", "other", "prefer-not-to-say"],
      required: true,
    },
    bio: { type: String, maxlength: 500, default: "" },
    occupation: { type: String, maxlength: 100, default: "" },
    education: { type: String, maxlength: 100, default: "" },
    photos: {
      type: [photoSchema],
      default: [],
      validate: [arrayLimit(6), "Maximum 6 photos allowed"],
    },
    interests: {
      type: [String],
      default: [],
      validate: [arrayLimit(20), "Maximum 20 interests allowed"],
    },
    relationshipGoal: {
      type: String,
      enum: ["serious", "marriage", "casual", "friendship", "not-sure"],
      required: true,
    },
    location: { type: locationSchema, default: () => ({}) },
    preferences: { type: preferencesSchema, default: () => ({}) },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    isBanned: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: null },
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      default: "user",
    },
    blockedUsers: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
      validate: [arrayLimit(1000), "Cannot block more than 1000 users"],
    },
    hiddenConversations: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Conversation",
      default: [],
    },
    deletedAt: { type: Date, default: null },
    scheduledDeletionAt: { type: Date, default: null },
    reactivationAttempts: { type: Number, default: 0 },
    emailBlockedUntil: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    lastLoginCountry: { type: String, default: null },
    lastLoginCity: { type: String, default: null },
    twoFactorSecret: { type: String, select: false, default: null },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorBackupCodes: {
      type: [backupCodeSchema],
      select: false,
      default: [],
    },
    twoFactorEnabledAt: { type: Date, default: null },

    // ✅ Redis-less fallback for the 2FA setup flow (encrypted pending secret +
    // short expiry, plus a failed-attempt counter + lockout timestamp). All
    // select:false so they never leak via /me or any default query; the 2FA
    // controller is the only code that loads/sets them, and it never returns
    // them to the client. The pending secret is stored ENCRYPTED (encryptSecret,
    // env-keyed) exactly like twoFactorSecret, so a DB dump alone reveals nothing.
    twoFactorPendingSecret: { type: String, select: false, default: null },
    twoFactorPendingExpiresAt: { type: Date, select: false, default: null },
    twoFactorFailedAttempts: { type: Number, select: false, default: 0 },
    twoFactorLockoutUntil: { type: Date, select: false, default: null },
  },
  { timestamps: true }
);

userSchema.index({ "location.coordinates": "2dsphere" });
userSchema.index({ isActive: 1, gender: 1, dateOfBirth: 1, lastSeen: -1 });
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ isVerified: 1, isActive: 1 });
userSchema.index({ isBanned: 1 });
userSchema.index({ twoFactorEnabled: 1 });
userSchema.index({ oauthProvider: 1, oauthId: 1 }, { sparse: true });
userSchema.index({ deletedAt: 1, scheduledDeletionAt: 1 }, { sparse: true });
userSchema.index({ blockedUsers: 1 });

userSchema.pre("validate", function () {
  // ✅ PROD FIX (the reported 500): a stored empty-string in preferences is a DEFINED
  // value that fails the enum (preferredGender) / min-max (numbers) validators, so ANY
  // full document save() — photo upload, detectSuspiciousLogin's user.save(), profile
  // edits — throws "`` is not a valid enum value for path `preferredGender`". Local DBs
  // simply never had the poisoned row, which is why it only errors in production. We
  // coerce "" -> the schema default BEFORE validation runs; because pre('validate') fires
  // on hydrated docs too, this repairs existing bad rows in-place on the next save with
  // NO migration, and validation then passes. Healthy rows (no "") are untouched.
  //
  // Scope note: we only coerce the empty STRING (the observed, String-typed poison on
  // preferredGender). null/undefined already skip the validators and are left alone. If
  // you ever also see numeric 500s like "minAge must be >= 18" from a poisoned numeric
  // pref, extend the same coercion to 0/null there — but the current error is purely the
  // String enum, so "" on preferredGender is the targeted repair.
  if (this.preferences) {
    const p = this.preferences;
    if (p.preferredGender === "")
      p.preferredGender = PREF_DEFAULTS.preferredGender;
    if (p.minAge === "") p.minAge = PREF_DEFAULTS.minAge;
    if (p.maxAge === "") p.maxAge = PREF_DEFAULTS.maxAge;
    if (p.maxDistance === "") p.maxDistance = PREF_DEFAULTS.maxDistance;
  }

  // existing business rule, now evaluated against the coerced values
  if (this.preferences && this.preferences.minAge > this.preferences.maxAge) {
    this.invalidate(
      "preferences.minAge",
      "Minimum age cannot be greater than maximum age"
    );
  }
});

const sanitizeTransform = function (doc, ret) {
  delete ret.password;
  delete ret.twoFactorSecret;
  delete ret.twoFactorBackupCodes;
  return ret;
};

userSchema.set("toJSON", { transform: sanitizeTransform });
userSchema.set("toObject", { transform: sanitizeTransform });

export default mongoose.model("User", userSchema);
