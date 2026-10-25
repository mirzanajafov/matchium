import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deletePhoto, makeMainPhoto, saveBio, uploadPhoto } from "@/actions/profile";
import { recordWhile } from "@/test/frames";
import { nth } from "@/test/nth";
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
  beforeEach(() => {
    vi.mocked(uploadPhoto).mockReset();
    vi.mocked(deletePhoto).mockReset();
    vi.mocked(makeMainPhoto).mockReset();
  });

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
    vi.mocked(uploadPhoto).mockResolvedValue({ done: true });
    render(<ProfilePhotos photos={[]} />);
    const file = new File(["pixels"], "me.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Add photo"), file);
    await vi.waitFor(() => expect(uploadPhoto).toHaveBeenCalled());
    expect(nth(vi.mocked(uploadPhoto).mock.calls, 0)[1].get("photo")).toBeInstanceOf(File);
  });

  it("shows why an upload was refused", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadPhoto).mockResolvedValue({ error: "That file isn't a photo we can read." });
    render(<ProfilePhotos photos={[]} />);
    await user.upload(screen.getByLabelText("Add photo"), new File(["x"], "x.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't a photo we can read");
  });

  it("turns away a photo over 8 MB before sending it", async () => {
    const user = userEvent.setup();
    render(<ProfilePhotos photos={[]} />);
    const big = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Add photo"), big);

    expect(await screen.findByText("That photo is over 8 MB.")).toBeInTheDocument();
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it("clears the size message when the next photo fits", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadPhoto).mockResolvedValueOnce({ done: true });
    render(<ProfilePhotos photos={[]} />);
    const input = screen.getByLabelText("Add photo");
    await user.upload(input, new File([new Uint8Array(8 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" }));
    await screen.findByText("That photo is over 8 MB.");

    await user.upload(input, new File(["small"], "small.jpg", { type: "image/jpeg" }));
    await vi.waitFor(() => expect(uploadPhoto).toHaveBeenCalledOnce());
    expect(screen.queryByText("That photo is over 8 MB.")).not.toBeInTheDocument();
  });
});

describe("BioForm", () => {
  beforeEach(() => {
    vi.mocked(saveBio).mockReset();
  });

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
    expect(nth(vi.mocked(saveBio).mock.calls, 0)[1].get("bio")).toBe("Hi there");
  });

  it("lets a save that never reached Matchium be tried again", async () => {
    const user = userEvent.setup();
    vi.mocked(saveBio).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    render(<BioForm bio="Likes long walks." />);
    await user.clear(screen.getByLabelText("About you"));
    await user.type(screen.getByLabelText("About you"), "Likes short walks.");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("Couldn't reach Matchium. Check your connection and try again."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("About you")).toHaveValue("Likes short walks.");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
