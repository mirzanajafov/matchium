import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deletePhoto, saveBio, uploadPhoto } from "@/app/actions";
import { BioForm } from "./BioForm";
import { ProfilePhotos } from "./ProfilePhotos";

vi.mock("@/app/actions", () => ({ deletePhoto: vi.fn(), saveBio: vi.fn(), uploadPhoto: vi.fn() }));

const photo = (n: number) => ({ id: `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`, width: 1080, height: 1350 });

describe("ProfilePhotos", () => {
  it("removes a photo and hides the uploader once all four slots are used", async () => {
    const user = userEvent.setup();
    vi.mocked(deletePhoto).mockResolvedValue(undefined);
    const { rerender } = render(<ProfilePhotos photos={[photo(1), photo(2)]} />);
    expect(screen.getByLabelText("Add photo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove photo 2" }));
    expect(deletePhoto).toHaveBeenCalledWith(photo(2).id);

    rerender(<ProfilePhotos photos={[photo(1), photo(2), photo(3), photo(4)]} />);
    expect(screen.queryByLabelText("Add photo")).not.toBeInTheDocument();
  });

  it("shows why an upload was refused", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadPhoto).mockResolvedValue({ error: "That file isn't a photo we can read." });
    render(<ProfilePhotos photos={[]} />);
    await user.upload(screen.getByLabelText("Add photo"), new File(["x"], "x.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't a photo we can read");
  });
});

describe("BioForm", () => {
  it("counts down and saves only when something changed", async () => {
    const user = userEvent.setup();
    vi.mocked(saveBio).mockImplementation(async (_, form) => ({ done: true, values: { bio: String(form.get("bio")) } }));
    render(<BioForm bio="Hi" />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(screen.getByText("298 left")).toBeInTheDocument();

    await user.type(screen.getByLabelText("About you"), " there");
    await user.click(save);

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(vi.mocked(saveBio).mock.calls[0]![1].get("bio")).toBe("Hi there");
  });
});
