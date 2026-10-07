// Single source of truth for audit redaction. The logger and the model MUST use
// the SAME predicate — when they kept separate lists they drifted, and compound
// keys like `otpCode` / `accessToken` / `signature` slipped through BOTH layers.
// Matching is by SUBSTRING on the normalized key: in an audit log we would rather
// over‑redact a benign field (e.g. a `pinned` boolean) than leak a secret, so a
// generous substring list is the safe direction. Bare over‑broad tokens (`code`,
// `key`, `id`, `pan`) are intentionally NOT included — they would eat forensic
// fields like `statusCode`, `countryCode`, `foreignKey`, `companyName`; the
// specific compounds are listed instead.

const SENSITIVE_SUBSTRINGS = [
  // passwords
  "password",
  "passwd",
  "pwd",
  "currentpassword",
  "newpassword",
  "confirmpassword",
  // tokens
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "bearertoken",
  "csrftoken",
  "sessiontoken",
  "authtoken",
  "jwt",
  "bearer",
  // secrets / keys
  "secret",
  "secretkey",
  "clientsecret",
  "appsecret",
  "apikey",
  "accesskey",
  "privatekey",
  "encryptionkey",
  "signingkey",
  "recoverykey",
  "backupkey",
  // 2FA / one‑time
  "twofactorsecret",
  "twofactorbackupcodes",
  "totp",
  "otp",
  "otpcode",
  "onetimepassword",
  "passcode",
  "verificationcode",
  "confirmationcode",
  "securitycode",
  "accesscode",
  "invitecode",
  // payments / PII identifiers
  "cvv",
  "cvc",
  "creditcard",
  "cardnumber",
  "ssn",
  "socialsecurity",
  "nationalid",
  "taxid",
  // transport / session
  "authorization",
  "authheader",
  "cookie",
  "setcookie",
  "session",
  // crypto / integrity
  "signature",
  "pin",
];

// NFKC + lower + trim, then substring test. Non‑string keys are never sensitive.
export const isSensitiveKey = (key) => {
  if (typeof key !== "string") return false;
  const normalized = key.normalize("NFKC").toLowerCase().trim();
  if (!normalized) return false;
  return SENSITIVE_SUBSTRINGS.some((s) => normalized.includes(s));
};

// One bound for metadata size, shared by the logger (pre‑cut, keys‑preserving)
// and the model (authoritative) so behavior is predictable and 16MB BSON is safe.
export const MAX_AUDIT_METADATA_BYTES = 10240; // 10KB
