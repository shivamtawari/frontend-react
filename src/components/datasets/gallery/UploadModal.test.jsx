import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import UploadModal from "./UploadModal";
import { useImageUpload } from "../../../hooks/useImageUpload";
import * as api from "../../../api";

vi.mock("../../../api", () => ({
  fetchStackFormats: vi.fn(),
  uploadImage: vi.fn(),
  uploadStackFiles: vi.fn(),
}));

const Harness = ({ onSuccess }) => {
  const upload = useImageUpload({ id: 7 }, onSuccess);
  return (
    <UploadModal
      isOpen
      onClose={() => {}}
      dataset={{ id: 7, name: "Eyes" }}
      {...upload}
      onAddFiles={upload.addFiles}
      onRemoveFile={upload.removeFile}
      onRemoveUnsupported={upload.removeUnsupported}
      onUpload={upload.handleUpload}
      onClear={upload.clearFiles}
    />
  );
};

const drop = async (container, names) => {
  const input = container.querySelector('input[type="file"]');
  const files = names.map((name) => new File(["x"], name));
  fireEvent.change(input, { target: { files } });
  await waitFor(() => expect(screen.getByText(names[0])).toBeInTheDocument());
};

describe("UploadModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchStackFormats.mockResolvedValue({ extensions: [".e2e", ".vol"] });
    api.uploadImage.mockResolvedValue({ success: true });
    api.uploadStackFiles.mockResolvedValue({ stack_ids: [1, 2], failed: [] });
  });

  it("takes OCT exports and any other file, flagging the unsupported ones", async () => {
    const { container } = render(<Harness />);
    const input = container.querySelector('input[type="file"]');
    expect(input.getAttribute("accept")).toBeNull();

    await drop(container, ["scan.e2e", "a.png", "notes.pdf"]);

    expect(screen.getByText("OCT volume")).toBeInTheDocument();
    expect(screen.getByText("Not supported")).toBeInTheDocument();
    expect(screen.getByText(/notes\.pdf is not in a/)).toBeInTheDocument();
  });

  it("sends OCT files to the stack upload and skips unsupported files", async () => {
    const onSuccess = vi.fn();
    const { container } = render(<Harness onSuccess={onSuccess} />);
    await drop(container, ["scan.e2e", "a.png", "notes.pdf"]);

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(api.uploadStackFiles).toHaveBeenCalledWith([expect.objectContaining({ name: "scan.e2e" })], 7);
    expect(api.uploadImage).toHaveBeenCalledTimes(1);
    expect(api.uploadImage).toHaveBeenCalledWith(expect.objectContaining({ name: "a.png" }), 7);
  });

  it("labels a failed attempt as retryable and accepts a retry", async () => {
    const onSuccess = vi.fn();
    api.uploadImage
      .mockRejectedValueOnce(new Error("unsupported TIFF"))
      .mockResolvedValueOnce({ success: true });
    const { container } = render(<Harness onSuccess={onSuccess} />);
    await drop(container, ["scan.png"]);

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry failed uploads" })).toBeInTheDocument());
    expect(screen.getByText("Upload attempt finished")).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retry failed uploads" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(api.uploadImage).toHaveBeenCalledTimes(2);
  });

  it("disables Upload when only unsupported files are queued, and can remove them", async () => {
    const { container } = render(<Harness />);
    await drop(container, ["notes.pdf"]);
    expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Remove them" }));
    expect(screen.queryByText("notes.pdf")).not.toBeInTheDocument();
  });
});
