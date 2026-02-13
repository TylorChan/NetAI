function tonePrefix(tone) {
  const normalized = (tone || "professional").toLowerCase();
  if (normalized === "friendly") return "Great chatting today";
  if (normalized === "formal") return "Thank you for your time";
  return "Thanks for the conversation";
}

export function createFollowupEmailService({ store }) {
  return {
    generate({ sessionId, tone = "professional", length = "medium" }) {
      const session = store.getSession(sessionId);
      if (!session) {
        throw new Error("session not found");
      }

      const evaluation = store.getEvaluation(sessionId);
      const prefix = tonePrefix(tone);
      const shortBody = `${prefix}. I appreciated your insights on ${session.goal}. If you are open to it, I would value one concrete suggestion on how to improve my networking conversations.`;
      const mediumBody = `${prefix}. I really appreciated your insights on ${session.goal}. I especially found your perspective on collaboration and career growth helpful. If you have time, I would value one practical suggestion on how I can improve my networking conversations and follow-ups.`;
      const longBody = `${prefix}. Thank you again for sharing your time and advice on ${session.goal}. I learned a lot from your perspective, especially around how to ask clearer questions and connect my project experience to business outcomes. I am actively practicing and would greatly appreciate one additional suggestion on what to focus on next. If it is helpful, I can also share a brief summary of how I apply your advice in my next conversation.`;

      const body = length === "short" ? shortBody : length === "long" ? longBody : mediumBody;
      const withFeedback = evaluation
        ? `${body}\n\nP.S. My latest practice score is ${evaluation.score}/10 and I am focusing on: ${evaluation.nextActions[0]}.`
        : body;

      return {
        subject: `Follow-up from our networking chat on ${session.goal}`,
        body: `Hi,\n\n${withFeedback}\n\nBest regards,\n${session.userId}`
      };
    }
  };
}
