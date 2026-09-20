// server/templates/suspiciousLoginEmail.js

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const BRAND_NAME = "Maya~Milan";

export const suspiciousLoginTemplate = ({
  name,
  ip,
  city,
  country,
  userAgent,
  time,
}) => {
  // ✅ Defensive checks — userAgent might be null/undefined
  const ua = userAgent || "";

  const deviceType = /mobile|android|iphone/i.test(ua)
    ? "📱 Mobile device"
    : /tablet|ipad/i.test(ua)
    ? "📱 Tablet"
    : "💻 Desktop";

  const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/);
  const browser = browserMatch ? browserMatch[0] : "Unknown browser";

  const osMatch = ua.match(
    /(Windows|Mac OS X|Linux|Android|iPhone OS) [\d._]+/
  );
  const os = osMatch ? osMatch[0] : "Unknown OS";

  const year = new Date().getFullYear();
  const safeName = (name || "there").replace(/[<>]/g, ""); // Basic XSS protection
  const safeCity = (city || "Unknown").replace(/[<>]/g, "");
  const safeCountry = (country || "Unknown").replace(/[<>]/g, "");
  const safeIp = (ip || "Unknown").replace(/[<>]/g, "");

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>New Login Detected - ${BRAND_NAME}</title>

  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
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
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #f6f7fb; }
    a { color: #dc2626; text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Mobile responsive */
    @media screen and (max-width: 620px) {
      .container { width: 100% !important; max-width: 100% !important; }
      .padding-mobile { padding-left: 20px !important; padding-right: 20px !important; }
      .button-mobile { width: 100% !important; display: block !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">

  <!-- Preheader (hidden preview text in inbox) -->
  <div style="display:none;font-size:1px;color:#f6f7fb;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    Someone signed in to your ${BRAND_NAME} account from ${safeCity}, ${safeCountry}. If this wasn't you, change your password immediately.
  </div>

  <!-- Main wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f6f7fb;padding:40px 20px;">
    <tr>
      <td align="center">

        <!-- Container -->
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;">

          <!-- Header -->
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#dc2626 0%,#991b1b 100%);background-color:#dc2626;padding:32px 24px;">
              <div style="font-size:48px;line-height:1;">🔔</div>
              <h1 style="color:#ffffff;margin:16px 0 8px;font-size:24px;font-weight:700;letter-spacing:-0.5px;">New Login Detected</h1>
              <p style="color:rgba(255,255,255,0.9);margin:0;font-size:14px;font-weight:400;">
                Someone signed in to your account from a new location
              </p>
            </td>
          </tr>

          <!-- Body content -->
          <tr>
            <td class="padding-mobile" style="padding:32px;">

              <!-- Greeting -->
              <p style="color:#374151;font-size:16px;margin:0 0 24px;line-height:1.5;">
                Hi <strong>${safeName}</strong>,
              </p>

              <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px;">
                We detected a login to your <strong>${BRAND_NAME}</strong> account from a different country than usual.
                If this was you, you can safely ignore this email.
              </p>

              <!-- Login Details Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px;">
                    <h3 style="margin:0 0 16px;color:#111827;font-size:13px;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;">
                      Login Details
                    </h3>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;border-collapse:collapse;">
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;width:120px;vertical-align:top;">📍 Location</td>
                        <td style="padding:8px 0;color:#111827;font-weight:600;">${safeCity}, ${safeCountry}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;vertical-align:top;">🌐 IP Address</td>
                        <td style="padding:8px 0;color:#111827;font-family:'SF Mono',Monaco,Consolas,monospace;font-size:13px;">${safeIp}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;vertical-align:top;">🕐 Time</td>
                        <td style="padding:8px 0;color:#111827;">${time}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;vertical-align:top;">🖥️ Device</td>
                        <td style="padding:8px 0;color:#111827;">${deviceType}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;vertical-align:top;">🌍 Browser</td>
                        <td style="padding:8px 0;color:#111827;">${browser}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;color:#6b7280;vertical-align:top;">⚙️ OS</td>
                        <td style="padding:8px 0;color:#111827;">${os}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Warning Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:12px;margin-bottom:32px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 12px;color:#991b1b;font-weight:700;font-size:15px;">
                      ⚠️ Wasn't you?
                    </p>
                    <p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.6;">
                      If you don't recognize this login, your account may be compromised.
                      <strong>Change your password immediately</strong> and review your active sessions.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button — bulletproof for all email clients -->
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:10px;background-color:#dc2626;">
                    <!--[if mso]>
                    <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${CLIENT_URL}/settings/security" style="height:48px;v-text-anchor:middle;width:240px;" arcsize="21%" strokecolor="#dc2626" fillcolor="#dc2626">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">Review Active Sessions →</center>
                    </v:roundrect>
                    <![endif]-->
                    <!--[if !mso]><!-->
                    <a href="${CLIENT_URL}/settings/security"
                       class="button-mobile"
                       target="_blank"
                       style="display:inline-block;padding:14px 32px;background-color:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;border-radius:10px;mso-padding-alt:0;text-align:center;">
                      Review Active Sessions →
                    </a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9fafb;padding:24px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.5;">
                This is an automated security alert from ${BRAND_NAME}.
              </p>
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
                © ${year} ${BRAND_NAME} · Your safety is our priority
              </p>
              <p style="margin:12px 0 0;font-size:12px;">
                <a href="${CLIENT_URL}/settings/notifications" style="color:#9ca3af;text-decoration:underline;">
                  Manage notification preferences
                </a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Container -->

      </td>
    </tr>
  </table>
</body>
</html>`.trim();
};
