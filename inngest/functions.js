import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { isEmailConfigured, sendWelcomeEmail } from "../services/emailService.js";
import { inngest } from "./client.js";

export const sendWelcomeEmailJob = inngest.createFunction(
  { id: "careerpilot-welcome-email", retries: 3, triggers: [{ event: "careerpilot/user.registered" }] },
  async ({ event, step, attempt }) => {
    const userId = event.data?.userId;
    if (typeof userId !== "string") throw new Error("Welcome email event is missing its user ID.");
    if (!isEmailConfigured()) throw new Error("Email delivery is not configured.");
    const notification = await prisma.emailNotification.upsert({
      where: { userId_template: { userId, template: "WELCOME" } },
      create: { id: randomUUID(), userId, template: "WELCOME", status: "SENDING", attempts: attempt + 1, updatedAt: new Date() },
      update: { status: "SENDING", attempts: attempt + 1, lastError: null, updatedAt: new Date() }
    });
    try {
      const result = await step.run("send-welcome-email", async () => {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
        if (!user) throw new Error("Account is no longer available.");
        return sendWelcomeEmail({ ...user, userId });
      });
      await prisma.emailNotification.update({ where: { id: notification.id }, data: { status: "SENT", providerId: result?.id || null, sentAt: new Date(), lastError: null, updatedAt: new Date() } });
    } catch (error) {
      const finalAttempt = attempt >= 3;
      await prisma.emailNotification.update({ where: { id: notification.id }, data: { status: finalAttempt ? "FAILED" : "RETRYING", lastError: Number.isInteger(error?.status) ? `Email provider returned status ${error.status}.` : "Email delivery attempt failed.", updatedAt: new Date() } });
      throw error;
    }
  }
);

export const inngestFunctions = [sendWelcomeEmailJob];
