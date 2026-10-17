import { Inngest } from "inngest";

const clientOptions = { id: "ai-careerpilot" };
if (process.env.NODE_ENV !== "production" && !process.env.INNGEST_SIGNING_KEY) clientOptions.isDev = true;
if (process.env.INNGEST_EVENT_KEY) clientOptions.eventKey = process.env.INNGEST_EVENT_KEY;
if (process.env.INNGEST_SIGNING_KEY) clientOptions.signingKey = process.env.INNGEST_SIGNING_KEY;

export const inngest = new Inngest(clientOptions);
