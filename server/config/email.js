import { BrevoClient } from "@getbrevo/brevo";

const brevo = new BrevoClient({
  apiKey: process.env.BREVO_API_KEY,
});

export const sendOTP = async (email, otp, userName) => {
  try {
    const response = await brevo.transactionalEmails.sendTransacEmail({
      sender: {
        name: "Maya~Milan",
        email: process.env.BREVO_SENDER_EMAIL,
      },

      to: [
        {
          email: email,
          name: userName,
        },
      ],

      subject: "Verify Your Email - Maya~Milan",

      htmlContent: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          
          <div style="
            background: linear-gradient(135deg, #ec4899, #f43f5e);
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
          ">
            <h1 style="color: white; margin: 0;">
              Maya~Milan
            </h1>
          </div>

          <div style="
            padding: 40px;
            background: #f9fafb;
            border-radius: 0 0 10px 10px;
          ">

            <h2 style="color: #1f2937; margin-top: 0;">
              Hi ${userName}! 👋
            </h2>

            <p style="
              color: #4b5563;
              font-size: 16px;
              line-height: 1.6;
            ">
              Thank you for signing up! To complete your registration,
              please verify your email address using the code below:
            </p>

            <div style="
              background: white;
              padding: 30px;
              text-align: center;
              border-radius: 8px;
              margin: 30px 0;
              border: 2px dashed #ec4899;
            ">

              <p style="
                margin: 0 0 10px;
                color: #6b7280;
                font-size: 14px;
              ">
                Your verification code:
              </p>

              <h1 style="
                color: #ec4899;
                font-size: 48px;
                margin: 0;
                letter-spacing: 8px;
                font-weight: 700;
              ">
                ${otp}
              </h1>

            </div>

            <p style="
              color: #6b7280;
              font-size: 14px;
              line-height: 1.6;
            ">
              ⏰ This code will expire in
              <strong>10 minutes</strong>.
            </p>

            <p style="
              color: #6b7280;
              font-size: 14px;
              line-height: 1.6;
            ">
              If you didn't request this code, please ignore this email
              or contact support if you have concerns.
            </p>

            <div style="
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
            ">

              <p style="
                color: #9ca3af;
                font-size: 12px;
                text-align: center;
                margin: 0;
              ">
                This is an automated message, please do not reply to this email.
              </p>

            </div>

          </div>
        </div>
      `,
    });

    console.log("✅ OTP email sent:", response.messageId);

    return {
      success: true,
      messageId: response.messageId,
    };
  } catch (error) {
    console.error("❌ Brevo email error:", error);

    throw new Error("Failed to send verification email");
  }
};
