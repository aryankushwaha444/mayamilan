import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      // required ONLY for normal (local) signups
      required: [
        function () {
          return this.oauthProvider === "local";
        },
        "Password is required",
      ],
    },

    // ADD these two fields
    oauthProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    oauthId: { type: String, default: null },

    dateOfBirth: {
      type: Date,
      required: true,
    },

    gender: {
      type: String,
      enum: ["male", "female", "non-binary", "other"],
      required: true,
    },

    bio: {
      type: String,
      maxlength: 500,
      default: "",
    },

    photos: [
      {
        url: {
          type: String,
          required: true,
        },
        publicId: {
          type: String,
          required: true,
        },
        isPrimary: {
          type: Boolean,
          default: false,
        },
      },
    ],

    location: {
      city: {
        type: String,
        default: "",
      },

      country: {
        type: String,
        default: "",
      },

      coordinates: {
        type: {
          type: String,
          enum: ["Point"],
          default: "Point",
        },

        coordinates: {
          type: [Number],
          default: [0, 0],
        },
      },
    },

    occupation: {
      type: String,
      default: "",
    },

    education: {
      type: String,
      default: "",
    },

    interests: {
      type: [String],
      default: [],
    },

    relationshipGoal: {
      type: String,
      enum: ["serious", "marriage", "casual", "friendship", "not-sure"],
      required: true,
    },

    preferences: {
      minAge: {
        type: Number,
        default: 18,
      },

      maxAge: {
        type: Number,
        default: 80,
      },

      preferredGender: {
        type: String,
        default: "",
      },

      maxDistance: {
        type: Number,
        default: 50,
      },
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isOnline: {
      type: Boolean,
      default: false,
    },

    lastSeen: {
      type: Date,
      default: null,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    blockedUsers: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({
  "location.coordinates": "2dsphere",
});

const User = mongoose.model("User", userSchema);

export default User;
