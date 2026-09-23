import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { answerQuestion } from "@/app/actions";
import { QuestionFlow } from "./QuestionFlow";

vi.mock("@/app/actions", () => ({ answerQuestion: vi.fn() }));

const questions = [
  { id: "family.1", text: "I want to have children someday.", answered: true },
  { id: "planning.1", text: "I like having my week planned in advance.", answered: false },
  { id: "activity.1", text: "I work out at least three times a week.", answered: false },
];

async function answerCurrent(user: ReturnType<typeof userEvent.setup>) {
  for (const group of ["How true is this for you?", "How would you want your partner to answer?", "How much does this matter to you?"]) {
    const radios = screen.getByRole("radiogroup", { name: group }).querySelectorAll("input");
    await user.click(radios[3]);
  }
}

describe("QuestionFlow", () => {
  beforeEach(() => {
    vi.mocked(answerQuestion).mockReset();
  });

  it("skips answered questions and only submits once all three scales are set", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuestion).mockResolvedValue({ remaining: 1, certainty: 0.2 });
    render(<QuestionFlow questions={questions} certainty={0.1} />);

    expect(screen.getByText("Question 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: questions[1].text })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await answerCurrent(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(answerQuestion).toHaveBeenCalledWith("planning.1", { self: 4, partner: 4, importance: 4 });
    expect(await screen.findByRole("heading", { name: questions[2].text })).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "How well we know you" })).toHaveAttribute("aria-valuenow", "20");
    expect(screen.getByRole("button", { name: "Finish for today" })).toBeDisabled();
  });

  it("shows the wrap-up once every question is answered", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuestion).mockResolvedValue({ remaining: 0, certainty: 0.35 });
    render(<QuestionFlow questions={questions.slice(0, 2)} certainty={0.1} />);

    await answerCurrent(user);
    await user.click(screen.getByRole("button", { name: "Finish for today" }));

    expect(await screen.findByRole("heading", { name: "That's it for today" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See today's matches" })).toHaveAttribute("href", "/matches");
  });

  it("keeps the answer on screen when saving fails", async () => {
    const user = userEvent.setup();
    vi.mocked(answerQuestion).mockImplementation(async () => {
      throw new Error("network");
    });
    render(<QuestionFlow questions={questions} certainty={0.1} />);

    await answerCurrent(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save that answer");
    expect(screen.getByRole("heading", { name: questions[1].text })).toBeInTheDocument();
  });
});
