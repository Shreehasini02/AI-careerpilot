import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { evaluateInterviewAnswer, generateInterviewQuestions } from "../services/geminiService.js";

const INTERVIEW_TYPES = ["TECHNICAL", "BEHAVIORAL", "MIXED"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function interviewView(interview) {
  return {
    id: interview.id,
    type: interview.type,
    targetRole: interview.targetRole,
    requestedDifficulty: interview.requestedDifficulty,
    status: interview.status,
    score: interview.score,
    summary: interview.summary,
    recommendedTopics: interview.recommendedTopics || [],
    startedAt: interview.startedAt,
    completedAt: interview.completedAt,
    createdAt: interview.createdAt,
    questions: (interview.InterviewQuestion || []).map((question) => ({
      id: question.id,
      question: question.question,
      difficulty: question.difficulty,
      order: question.order,
      answer: question.InterviewAnswer ? {
        answer: question.InterviewAnswer.answer,
        score: question.InterviewAnswer.score,
        feedback: question.InterviewAnswer.feedback,
        strengths: question.InterviewAnswer.strengths || [],
        improvements: question.InterviewAnswer.improvements || [],
        exampleAnswer: question.InterviewAnswer.exampleAnswer
      } : null
    }))
  };
}

const INTERVIEW_INCLUDE = {
  InterviewQuestion: {
    orderBy: { order: "asc" },
    include: { InterviewAnswer: true }
  }
};

export async function listInterviews(req, res, next) {
  try {
    const interviews = await prisma.interview.findMany({
      where: { userId: req.auth.userId },
      include: INTERVIEW_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 20
    });
    return res.json({ success: true, data: { interviews: interviews.map(interviewView) } });
  } catch (error) {
    return next(error);
  }
}

export async function startInterview(req, res, next) {
  const type = req.body?.type === undefined ? "MIXED" : req.body.type;
  const targetRole = req.body?.targetRole === undefined ? "" : req.body.targetRole;
  const difficulty = req.body?.difficulty === undefined ? "MEDIUM" : req.body.difficulty;
  if (!INTERVIEW_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: "Choose a technical, behavioral, or mixed interview." });
  }
  if (typeof targetRole !== "string" || targetRole.length > 120) {
    return res.status(400).json({ success: false, message: "Target role must be no more than 120 characters." });
  }
  if (!["EASY", "MEDIUM", "HARD"].includes(difficulty)) return res.status(400).json({ success: false, message: "Choose easy, medium, or hard difficulty." });

  try {
    const generated = await generateInterviewQuestions({ type, targetRole: targetRole.trim(), difficulty });
    const now = new Date();
    const interview = await prisma.interview.create({
      data: {
        id: randomUUID(),
        userId: req.auth.userId,
        type,
        targetRole: targetRole.trim() || null,
        requestedDifficulty: difficulty,
        status: "IN_PROGRESS",
        startedAt: now,
        updatedAt: now,
        InterviewQuestion: {
          create: generated.map((item, order) => ({
            id: randomUUID(),
            question: item.question,
            difficulty: item.difficulty,
            order
          }))
        }
      },
      include: INTERVIEW_INCLUDE
    });
    return res.status(201).json({ success: true, data: { interview: interviewView(interview) } });
  } catch (error) {
    return next(error);
  }
}

export async function submitInterviewAnswer(req, res, next) {
  const { id } = req.params;
  const questionId = req.body?.questionId;
  const answer = typeof req.body?.answer === "string" ? req.body.answer.trim() : "";
  if (!UUID_PATTERN.test(id || "") || !UUID_PATTERN.test(questionId || "")) {
    return res.status(400).json({ success: false, message: "Interview or question ID is invalid." });
  }
  if (answer.length < 20 || answer.length > 4000) {
    return res.status(400).json({ success: false, message: "Answer must contain 20 to 4,000 characters." });
  }

  try {
    const interview = await prisma.interview.findFirst({
      where: { id, userId: req.auth.userId },
      include: INTERVIEW_INCLUDE
    });
    if (!interview) return res.status(404).json({ success: false, message: "Interview not found." });
    if (interview.status !== "IN_PROGRESS") {
      return res.status(409).json({ success: false, message: "This interview is already complete." });
    }
    const question = interview.InterviewQuestion.find((item) => item.id === questionId);
    if (!question) return res.status(404).json({ success: false, message: "Question not found in this interview." });
    if (question.InterviewAnswer) return res.status(409).json({ success: false, message: "An answer has already been submitted for this question." });

    const evaluation = await evaluateInterviewAnswer({ question: question.question, answer, interviewType: interview.type });
    const questionIds = interview.InterviewQuestion.map((item) => item.id);
    const updated = await prisma.$transaction(async (tx) => {
      await tx.interviewAnswer.create({
        data: {
          id: randomUUID(),
          interviewQuestionId: question.id,
          answer,
          score: evaluation.score,
          feedback: evaluation.feedback,
          strengths: evaluation.strengths,
          improvements: evaluation.improvements,
          exampleAnswer: evaluation.exampleAnswer
        }
      });
      const [answeredCount, answers] = await Promise.all([
        tx.interviewAnswer.count({ where: { interviewQuestionId: { in: questionIds } } }),
        tx.interviewAnswer.findMany({ where: { interviewQuestionId: { in: questionIds } }, select: { score: true } })
      ]);
      const complete = answeredCount === questionIds.length;
      if (complete) {
        const average = Math.round(answers.reduce((total, item) => total + (item.score || 0), 0) / answers.length);
        const allAnswers = await tx.interviewAnswer.findMany({ where: { interviewQuestionId: { in: questionIds } }, select: { strengths: true, improvements: true } });
        const topics = [...new Set(allAnswers.flatMap((item) => Array.isArray(item.improvements) ? item.improvements : []).map(String))].slice(0, 8);
        await tx.interview.update({
          where: { id },
          data: { status: "COMPLETED", score: average, completedAt: new Date(), updatedAt: new Date(),
            summary: `Completed all ${questionIds.length} questions with an average score of ${average}/100. Review the feedback on each answer and practice the topics below.`,
            recommendedTopics: topics }
        });
      } else {
        await tx.interview.update({ where: { id }, data: { updatedAt: new Date() } });
      }
      return tx.interview.findFirst({ where: { id, userId: req.auth.userId }, include: INTERVIEW_INCLUDE });
    });
    return res.json({ success: true, data: { interview: interviewView(updated) } });
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ success: false, message: "An answer has already been submitted for this question." });
    return next(error);
  }
}

export async function endInterview(req, res, next) {
  const { id } = req.params;
  if (!UUID_PATTERN.test(id || "")) return res.status(400).json({ success: false, message: "Interview ID is invalid." });
  try {
    const interview = await prisma.interview.findFirst({ where: { id, userId: req.auth.userId }, include: INTERVIEW_INCLUDE });
    if (!interview) return res.status(404).json({ success: false, message: "Interview not found." });
    if (interview.status !== "IN_PROGRESS") return res.status(409).json({ success: false, message: "Only an in-progress interview can be ended." });
    const updated = await prisma.interview.update({ where: { id }, data: { status: "CANCELLED", completedAt: new Date(), updatedAt: new Date(), summary: "This practice session was ended early. Submitted answers and their feedback are saved." }, include: INTERVIEW_INCLUDE });
    return res.json({ success: true, data: { interview: interviewView(updated) } });
  } catch (error) { return next(error); }
}
