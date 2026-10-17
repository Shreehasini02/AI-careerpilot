import { Router } from "express";
import bcrypt from "bcryptjs";
import { rateLimit } from "express-rate-limit";
import { prisma } from "../config/prisma.js";
import { authenticate, createAccessToken } from "../middleware/authenticate.js";
import { inngest } from "../inngest/client.js";

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many sign-in attempts. Try again in 15 minutes." }
});

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function readCredentials(body, includeName = false) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (includeName && (name.length < 2 || name.length > 80)) {
    return { error: "Enter a name between 2 and 80 characters." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return { error: "Password must be at least 8 characters and no more than 72 bytes." };
  }

  return { name, email, password };
}

router.post("/register", authLimiter, async (req, res, next) => {
  const credentials = readCredentials(req.body, true);
  if (credentials.error) {
    return res.status(400).json({ success: false, message: credentials.error });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email: credentials.email } });
    if (existingUser) {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }

    const user = await prisma.user.create({
      data: {
        name: credentials.name,
        email: credentials.email,
        passwordHash: await bcrypt.hash(credentials.password, 12),
        updatedAt: new Date()
      }
    });

    if (process.env.INNGEST_EVENT_KEY && process.env.INNGEST_SIGNING_KEY && process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
      try {
        await inngest.send({ id: `welcome-${user.id}`, name: "careerpilot/user.registered", data: { userId: user.id } });
      } catch (eventError) {
        console.warn("Welcome email event could not be queued", { errorType: eventError?.name || "UnknownError" });
      }
    }

    return res.status(201).json({
      success: true,
      user: publicUser(user),
      token: createAccessToken(user)
    });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ success: false, message: "An account with this email already exists." });
    }
    return next(error);
  }
});

router.post("/login", authLimiter, async (req, res, next) => {
  const credentials = readCredentials(req.body);
  if (credentials.error) {
    return res.status(400).json({ success: false, message: credentials.error });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: credentials.email } });
    const passwordMatches = user && await bcrypt.compare(credentials.password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ success: false, message: "Email or password is incorrect." });
    }

    return res.status(200).json({ success: true, user: publicUser(user), token: createAccessToken(user) });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth.userId },
      select: { id: true, name: true, email: true, role: true }
    });
    if (!user) {
      return res.status(401).json({ success: false, message: "Account not found. Sign in again." });
    }
    return res.json({ success: true, user });
  } catch (error) {
    return next(error);
  }
});

export default router;
