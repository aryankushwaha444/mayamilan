import mongoose from "mongoose";

const matchSchema = new mongoose.Schema(
  {
    users: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      ],
      validate: {
        validator: function (users) {
          return users.length === 2;
        },
        message: "A match must contain exactly two users.",
      },
    },

    pairKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    matchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Match", matchSchema);
