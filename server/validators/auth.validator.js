import { z } from "zod";

// ═══════════════════════════════════════════
// REGISTRATION SCHEMA
// ═══════════════════════════════════════════

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must not exceed 50 characters")
    // ✅ FIX: Allow letters (including international Unicode), numbers, spaces, hyphens, and apostrophes.
    // Blocks HTML tags, pure emojis, and weird symbols.
    .regex(/^[\p{L}\p{N}\s'-]+$/u, "Name contains invalid characters"),

  email: z
    .string()
    .trim()
    .email("Please provide a valid email")
    .toLowerCase()
    .max(100, "Email is too long"),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must not exceed 100 characters") // Prevents bcrypt DoS attacks
    // ✅ FIX: Enforce basic complexity (at least 1 letter and 1 number)
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d).+$/,
      "Password must contain at least one letter and one number"
    ),

  // ✅ FIX: Strict date validation and 18+ age verification (COPPA/GDPR compliance)
  dateOfBirth: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Invalid date format. Please use YYYY-MM-DD",
    })
    .refine(
      (val) => {
        const dob = new Date(val);
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();

        // Adjust age if birthday hasn't occurred yet this year
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
          age--;
        }

        return age >= 18;
      },
      {
        message: "You must be at least 18 years old to use this app",
      }
    ),

  gender: z.enum(["male", "female", "non-binary", "other"], {
    errorMap: () => ({ message: "Please select a valid gender" }),
  }),

  relationshipGoal: z.enum(
    ["serious", "marriage", "casual", "friendship", "not-sure"],
    {
      errorMap: () => ({ message: "Please select a valid relationship goal" }),
    }
  ),

  // Bot protection fields
  turnstileToken: z.string().optional(),
  website: z.string().optional(), // honeypot field
});

// ═══════════════════════════════════════════
// LOGIN SCHEMA
// ═══════════════════════════════════════════

export const loginSchema = z.object({
  email: z.string().trim().email("Please provide a valid email").toLowerCase(),

  // No complexity check on login — only on registration.
  // We just need to ensure it's not empty so we can pass it to bcrypt/argon2.
  password: z.string().min(1, "Password is required"),

  turnstileToken: z.string().optional(),
  website: z.string().optional(), // honeypot field
});
