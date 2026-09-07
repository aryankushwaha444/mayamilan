import OTP from "../models/OTP.js";

export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const saveOTP = async (email, otp) => {
  // Delete any existing OTPs for this email
  await OTP.deleteMany({ email });

  // Create new OTP (expires in 10 minutes)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  return await OTP.create({
    email,
    otp,
    expiresAt,
  });
};

export const verifyOTP = async (email, otp) => {
  const record = await OTP.findOne({ email, otp });

  if (!record) {
    return { valid: false, message: "Invalid or expired OTP" };
  }

  if (record.expiresAt < new Date()) {
    await OTP.deleteOne({ _id: record._id });
    return { valid: false, message: "OTP has expired" };
  }

  // Delete OTP after successful verification
  await OTP.deleteOne({ _id: record._id });

  return { valid: true, message: "OTP verified successfully" };
};
