import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deletePhoto, makeMainPhoto, saveBio, uploadPhoto } from "@/actions/profile";
import { recordWhile } from "@/test/frames";
import { BioForm } from "./BioForm";
import { ProfilePhotos } from "./ProfilePhotos";

vi.mock("@/actions/profile", () => ({
  deletePhoto: vi.fn(),
  makeMainPhoto: vi.fn(),
  saveBio: vi.fn(),
  uploadPhoto: vi.fn(),
}));
vi.mock("@/lib/shrink", () => ({
  shrinkForUpload: vi.fn(async (file: File) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return file;
  }),
}));

const photo = (n: number) => ({
  id: `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`,
  width: 1080,
  height: 1350,
});

describe("ProfilePhotos", () => {
  it("removes a photo and hides the uploader once all four slots are used", async () => {
    const user = userEvent.setup();
    vi.mocked(deletePhoto).mockResolvedValue({ ok: true, value: undefined });
    const { rerender } = render(<ProfilePhotos photos={[photo(1), photo(2)]} />);
    expect(screen.getByLabelText("Add photo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove photo 2" }));
    expect(deletePhoto).toHaveBeenCalledWith(photo(2).id);

    rerender(<ProfilePhotos photos={[photo(1), photo(2), photo(3), photo(4)]} />);
    expect(screen.queryByLabelText("Add photo")).not.toBeInTheDocument();
  });

  it("marks the main photo and promotes another one", async () => {
    const user = userEvent.setup();
    vi.mocked(makeMainPhoto).mockResolvedValue({ ok: true, value: undefined });
    render(<ProfilePhotos photos={[photo(1), photo(2), photo(3)]} />);
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Make photo 1 your main photo" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Make photo 3 your main photo" }));
    expect(makeMainPhoto).toHaveBeenCalledWith(photo(3).id);
  });

  it("says so under the photos when removing one fails", async () => {
    const user = userEvent.setup();
    vi.mocked(deletePhoto).mockResolvedValue({
      ok: false,
      error: "Couldn't delete that photo. Try again in a moment.",
    });
    render(<ProfilePhotos photos={[photo(1), photo(2)]} />);
    await user.click(screen.getByRole("button", { name: "Remove photo 2" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete that photo");
  });

  it("frees the photo buttons in the same moment it says the change failed", async () => {
    const user = userEvent.setup();
    vi.mocked(deletePhoto).mockResolvedValue({
      ok: false,
      error: "Couldn't delete that photo. Try again in a moment.",
    });
    render(<ProfilePhotos photos={[photo(1), photo(2)]} />);
    const remove = screen.getByRole("button", { name: "Remove photo 2" });
    const locked = recordWhile(
      () => screen.queryByRole("alert") !== null,
      () => remove.hasAttribute("disabled"),
    );

    await user.click(remove);
    await screen.findByRole("alert");

    expect(locked).toEqual(new Set([false]));
  });

  it("still sends the file after the async resize step", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadPhoto).mockReset();
    vi.mocked(uploadPhoto).mockResolvedValue({ done: true });
    render(<ProfilePhotos photos={[]} />);
    const file = new File(["pixels"], "me.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Add photo"), file);
    await vi.waitFor(() => expect(uploadPhoto).toHaveBeenCalled());
    expect(vi.mocked(uploadPhoto).mock.calls[0]![1].get("photo")).toBeInstanceOf(File);
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
    vi.mocked(saveBio).mockImplementation(async (_, form) => ({
      done: true,
      values: { bio: String(form.get("bio")) },
    }));
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
