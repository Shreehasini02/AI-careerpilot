import { generateCareerReply } from "../services/geminiService.js";
import { retrieveRelevantChunks } from "../services/documentRagService.js";

const MAX_MESSAGE_LENGTH = 3000;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 12000;

export async function chat(req, res, next) {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  const history = req.body?.history === undefined ? [] : req.body.history;
  const useDocuments = req.body?.useDocuments === undefined ? false : req.body.useDocuments;

  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Message must contain 1 to ${MAX_MESSAGE_LENGTH} characters.`
    });
  }
  if (!Array.isArray(history) || history.length > MAX_HISTORY_MESSAGES) {
    return res.status(400).json({
      success: false,
      message: `Conversation history must contain no more than ${MAX_HISTORY_MESSAGES} messages.`
    });
  }
  if (typeof useDocuments !== "boolean") {
    return res.status(400).json({ success: false, message: "useDocuments must be true or false." });
  }

  let historyLength = 0;
  const contents = [];
  for (const item of history) {
    if (
      !item ||
      (item.role !== "user" && item.role !== "model") ||
      typeof item.content !== "string" ||
      !item.content.trim() ||
      item.content.length > MAX_MESSAGE_LENGTH
    ) {
      return res.status(400).json({ success: false, message: "Conversation history contains an invalid message." });
    }

    historyLength += item.content.length;
    if (historyLength > MAX_HISTORY_CHARS) {
      return res.status(400).json({ success: false, message: "Conversation history is too long." });
    }
    contents.push({ role: item.role, parts: [{ text: item.content.trim() }] });
  }

  contents.push({ role: "user", parts: [{ text: message }] });

  try {
    const retrievedDocuments = useDocuments
      ? await retrieveRelevantChunks({ userId: req.auth.userId, query: message })
      : [];
    const reply = await generateCareerReply(contents, retrievedDocuments);
    const sources = retrievedDocuments.map(({ title, chunkIndex, similarity }) => ({ title, chunkIndex, similarity: Number(similarity.toFixed(3)) }));
    return res.json({ success: true, data: { reply, sources } });
  } catch (error) {
    return next(error);
  }
}
