import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { answerQuestion } from "@/actions/questions";
import type { AnswerResult } from "@/lib/types";
import { recordWhile } from "@/test/frames";
import { pendingAction } from "@/test/pending";
import { QuestionFlow } from "./QuestionFlow";

vi.mock("@/actions/questions", () => ({ answerQuestion: vi.fn() }));

const family = { id: "family.1", text: "I want to have children someday.", answered: true };
const planning = { id: "planning.1", text: "I like having my week planned in advance.", answered: false };
const activity = { id: "activity.1", text: "I work out at least three times a week.", answered: false };
const questions = [family, planning, activity];

async function answerCurrent(user: ReturnType<typeof userEvent.setup>) {
  for (const group of [
    "How true is this for you?",
    "How would you want your partner to answer?",
    "How much does this matter to you?",
  ]) {
    await user.click(within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name: "4" }));
  }
}

describe("QuestionFlow", () => {
  beforeEach(() => {
    vi.mocked(answerQuestion).mockReset();
  });

  it("skips answered questions and only submits once all three scales are set", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuestion).mockResolvedValue({ ok: true, value: { remaining: 1, certainty: 0.2 } });
    render(<QuestionFlow questions={questions} certainty={0.1} />);

    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: planning.text })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await answerCurrent(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(answerQuestion).toHaveBeenCalledWith(planning.id, { self: 4, partner: 4, importance: 4 });
    expect(await screen.findByRole("heading", { name: activity.text })).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "How well we know you" })).toHaveAttribute("aria-valuenow", "20");
    expect(screen.getByRole("button", { name: "Finish for today" })).toBeDisabled();
  });

  it("never shows the next question with the last one still saving", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuestion).mockResolvedValue({ ok: true, value: { remaining: 1, certainty: 0.2 } });
    render(<QuestionFlow questions={questions} certainty={0.1} />);
    const buttons = recordWhile(
      () => screen.queryByRole("heading", { name: activity.text }) !== null,
      () => screen.getByRole("button").textContent,
    );

    await answerCurrent(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("heading", { name: activity.text });

    expect(buttons).toEqual(new Set(["Finish for today"]));
  });

  it("shows the wrap-up once every question is answered", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuestion).mockResolvedValue({ ok: true, value: { remaining: 0, certainty: 0.35 } });
    render(<QuestionFlow questions={questions.slice(0, 2)} certainty={0.1} />);

    await answerCurrent(user);
    await user.click(screen.getByRole("button", { name: "Finish for today" }));

    expect(await screen.findByRole("heading", { name: "That's it for today" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "See today's matches" })).toHaveAttribute("href", "/matches");
  });

  it("keeps the answer on screen when saving fails", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuestion).mockResolvedValue({
      ok: false,
      error: "Couldn't save that answer. Try again in a moment.",
    });
    render(<QuestionFlow questions={questions} certainty={0.1} />);

    await answerCurrent(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that answer");
    expect(screen.getByRole("heading", { name: planning.text })).toBeInTheDocument();
  });

  it("locks the answer while it saves", async () => {
    const user = userEvent.setup();
    const save = pendingAction<AnswerResult>();
    vi.mocked(answerQuestion).mockReturnValue(save.promise);
    render(<QuestionFlow questions={questions} certainty={0.1} />);

    await answerCurrent(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    for (const radio of screen.getAllByRole("radio")) expect(radio).toBeDisabled();
    await act(async () => save.settle({ ok: true, value: { remaining: 1, certainty: 0.2 } }));
    expect(screen.getAllByRole("radio")[0]).toBeEnabled();
  });

  it("moves focus to the next question once the answer is saved", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuestion).mockResolvedValue({ ok: true, value: { remaining: 1, certainty: 0.2 } });
    render(<QuestionFlow questions={questions} certainty={0.1} />);
    expect(screen.getByRole("heading", { name: planning.text })).not.toHaveFocus();

    await answerCurrent(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("heading", { name: activity.text })).toHaveFocus();
  });

  it("puts focus back on the question when the answer can't be saved", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuestion).mockResolvedValue({ ok: false, error: "Couldn't save that answer." });
    render(<QuestionFlow questions={questions} certainty={0.1} />);

    await answerCurrent(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that answer.");
    expect(screen.getByRole("heading", { name: planning.text })).toHaveFocus();
  });

  it("never shows a failed save with the button still saving", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuestion).mockResolvedValue({
      ok: false,
      error: "Couldn't save that answer. Try again in a moment.",
    });
    render(<QuestionFlow questions={questions} certainty={0.1} />);
    const buttons = recordWhile(
      () => screen.queryByRole("alert") !== null,
      () => screen.getByRole("button").textContent,
    );

    await answerCurrent(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByRole("alert");

    expect(buttons).toEqual(new Set(["Next"]));
  });
});
