import { z } from "zod";

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must not exceed 50 characters"),

  email: z.string().trim().email("Please provide a valid email").toLowerCase(),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must not exceed 100 characters"),

  dateOfBirth: z.string().min(1, "Date of birth is required"),

  gender: z.enum(["male", "female", "non-binary", "other"]),

  relationshipGoal: z.enum([
    "serious",
    "marriage",
    "casual",
    "friendship",
    "not-sure",
  ]),
  turnstileToken: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Please provide a valid email").toLowerCase(),

  password: z.string().min(1, "Password is required"),
  turnstileToken: z.string().optional(),
});
