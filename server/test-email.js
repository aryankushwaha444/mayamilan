import dotenv from "dotenv";
dotenv.config();
import { suspiciousLoginTemplate } from "./templates/suspiciousLoginEmail.js";
import fs from "fs";

const html = suspiciousLoginTemplate({
  name: "Dark Evil",
  ip: "185.220.101.34",
  city: "Moscow",
  country: "RU",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  time: new Date().toLocaleString(),
});

fs.writeFileSync("test-email.html", html);
console.log("✅ Saved to test-email.html — open in browser to preview");
