import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { uploadPhoto } from "@/actions/profile";
import { ProfilePhotos } from "./ProfilePhotos";

vi.mock("@/actions/profile", () => ({ uploadPhoto: vi.fn(), deletePhoto: vi.fn(), makeMainPhoto: vi.fn() }));

describe("ProfilePhotos", () => {
  it("turns away a photo over 8 MB before sending it", async () => {
    const user = userEvent.setup();
    render(<ProfilePhotos photos={[]} />);
    const photo = new File([new Uint8Array(8 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText("Add photo"), photo);

    expect(await screen.findByText("That photo is over 8 MB.")).toBeInTheDocument();
    expect(uploadPhoto).not.toHaveBeenCalled();
  });
});
