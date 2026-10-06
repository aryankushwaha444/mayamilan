/**
 * Escapes HTML entities to prevent XSS and layout breaking
 */
const escapeHTML = (str) => {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export const otpTemplate = ({ userName, otp }) => {
  // ✅ FIX: Sanitize dynamic inputs before injecting into HTML
  const safeUserName = escapeHTML(userName || "there");
  const safeOtp = escapeHTML(otp);
  const currentYear = new Date().getFullYear();

  return `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  
  <!-- ✅ FIX: Dark mode support meta tags -->
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  
  <title>Your Verification Code</title>
  
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->

  <style>
    /* Reset */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    
    /* Mobile responsive */
    @media screen and (max-width: 600px) {
      .container { width: 100% !important; max-width: 100% !important; }
      .padding-mobile { padding: 24px !important; }
      .otp-text { font-size: 36px !important; letter-spacing: 4px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f3f4f6;">
  
  <!-- ✅ FIX: Hidden Preheader Text for Inbox Preview -->
  <div style="display: none; font-size: 1px; color: #f3f4f6; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    Your verification code for Maya~Milan is ${safeOtp}. It expires in 10 minutes.
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" class="container" width="600" cellspacing="0" cellpadding="0" style="max-width: 600px; width: 100%; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #ec4899, #f43f5e); padding: 32px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 700;">Maya~Milan</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="padding-mobile" style="padding: 40px;">
              <h2 style="color: #1f2937; margin: 0 0 16px; font-size: 22px;">
                Hi ${safeUserName}! 👋
              </h2>

              <p style="color: #4b5563; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                Thank you for signing up! To complete your registration, please verify your email address using the code below:
              </p>

              <!-- OTP Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td style="background: #fdf2f8; padding: 30px; text-align: center; border-radius: 8px; border: 2px dashed #ec4899;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px;">Your verification code:</p>
                    <h1 class="otp-text" style="color: #ec4899; font-size: 48px; margin: 0; letter-spacing: 8px; font-weight: 700; font-family: 'Courier New', Courier, monospace; word-break: break-all;">
                      ${safeOtp}
                    </h1>
                  </td>
                </tr>
              </table>

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 12px;">
                ⏰ This code will expire in <strong>10 minutes</strong>.
              </p>

              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0;">
                If you didn't request this code, please ignore this email or contact support if you have concerns.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="padding-mobile" style="padding: 24px 40px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
                This is an automated message, please do not reply to this email.<br>
                &copy; ${currentYear} Maya~Milan. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};
