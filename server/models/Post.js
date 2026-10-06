import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
    aspectRatio: { type: Number, default: 1 },
  },
  { _id: false }
);

// ✅ FIXED: Moved validator to top to prevent hoisting issues
function arrayLimit(val) {
  return val.length <= 5;
}

const postSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      trim: true,
      maxlength: [2000, "Content cannot exceed 2000 characters"],
      default: "",
    },
    images: {
      type: [imageSchema],
      validate: [arrayLimit, "{PATH} exceeds the limit of 5"],
    },
    likesCount: { type: Number, default: 0 },
    savesCount: { type: Number, default: 0 },
    commentsCount: { type: Number, default: 0 },
    sharesCount: { type: Number, default: 0 },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] },
    },
    isFlagged: { type: Boolean, default: false, index: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

postSchema.pre("validate", function () {
  if (!this.content && this.images.length === 0)
    this.invalidate(
      "content",
      "Post must have text content or at least one image"
    );
});

postSchema.index({ createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ location: "2dsphere" });
postSchema.index({ isFlagged: 1, createdAt: -1 });
postSchema.index({ isDeleted: 1 });

postSchema.virtual("isLiked").get(function () {
  return this._isLiked || false;
});
postSchema.virtual("isSaved").get(function () {
  return this._isSaved || false;
});
postSchema.set("toJSON", { virtuals: true });
postSchema.set("toObject", { virtuals: true });

export default mongoose.model("Post", postSchema);
