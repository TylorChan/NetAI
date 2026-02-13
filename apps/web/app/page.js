import ContextSetupForm from "@/components/ContextSetupForm";

export default function HomePage() {
  return (
    <section className="page-grid">
      <div className="hero panel">
        <p className="tag">NetAI</p>
        <h1>Practice networking conversations with a realtime AI coach</h1>
        <p>
          Build stronger small-talk, ask better follow-up questions, and get actionable feedback with
          session-level memory.
        </p>
      </div>
      <ContextSetupForm />
    </section>
  );
}
