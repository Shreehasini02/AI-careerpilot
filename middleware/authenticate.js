import jwt from "jsonwebtoken";

const JWT_ISSUER = "ai-careerpilot-api";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be set to a secret of at least 32 characters.");
  }
  return secret;
}

export function createAccessToken(user) {
  return jwt.sign(
    { role: user.role },
    getJwtSecret(),
    { subject: user.id, expiresIn: "1h", issuer: JWT_ISSUER }
  );
}

export function authenticate(req, res, next) {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ success: false, message: "Sign in to continue." });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret(), { issuer: JWT_ISSUER });
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      return res.status(401).json({ success: false, message: "Your session is invalid. Sign in again." });
    }
    req.auth = { userId: payload.sub };
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Your session has expired. Sign in again." });
  }
}
