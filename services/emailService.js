import { Resend } from "resend";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}

export function isEmailConfigured() {
  const sender = process.env.EMAIL_FROM?.match(/<([^>]+)>/)?.[1] || process.env.EMAIL_FROM || "";
  return Boolean(process.env.RESEND_API_KEY && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender.trim()));
}

export async function sendWelcomeEmail({ name, email, userId }) {
  if (!isEmailConfigured()) throw new Error("Email delivery is not configured.");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const greeting = escapeHtml(name || "there");
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: [email],
    subject: "Welcome to CareerPilot",
    html: `<main><h1>Welcome, ${greeting}</h1><p>Your CareerPilot account is ready. Start with your career profile, then explore your resume analysis, study plan, and interview practice.</p></main>`,
    text: `Welcome, ${name || "there"}. Your CareerPilot account is ready. Start with your career profile, then explore your resume analysis, study plan, and interview practice.`
  }, { idempotencyKey: `careerpilot-welcome-${userId}` });
  if (error) {
    const failure = new Error(error.message || "Email provider rejected the message.");
    failure.status = error.statusCode;
    throw failure;
  }
  return data;
}
