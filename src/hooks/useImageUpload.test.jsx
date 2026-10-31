import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { useImageUpload } from "./useImageUpload";

vi.mock("../api", () => ({
  fetchStackFormats: vi.fn(),
  uploadImage: vi.fn(),
  uploadStackFiles: vi.fn(),
}));

const makeFile = (name, type = "application/octet-stream") =>
  new File([name], name, { type });

describe("useImageUpload retry state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.fetchStackFormats.mockResolvedValue({ extensions: [".e2e", ".vol"] });
    api.uploadImage.mockResolvedValue({ success: true });
    api.uploadStackFiles.mockResolvedValue({ stack_ids: [1], failed: [] });
  });

  it("retries only failed images and eventually clears the queue", async () => {
    const onSuccess = vi.fn();
    const onPartialSuccess = vi.fn();
    const good = makeFile("good.png", "image/png");
    const badTiff = makeFile("bad.tiff", "image/tiff");
    api.uploadImage
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error("422 unsupported TIFF"))
      .mockRejectedValueOnce(new Error("422 unsupported TIFF"))
      .mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useImageUpload({ id: 7 }, onSuccess, onPartialSuccess));
    act(() => result.current.addFiles([good, badTiff]));

    await act(async () => result.current.handleUpload());

    expect(api.uploadImage).toHaveBeenNthCalledWith(1, good, 7);
    expect(api.uploadImage).toHaveBeenNthCalledWith(2, badTiff, 7);
    expect(result.current.uploadingFiles).toEqual([badTiff]);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onPartialSuccess).toHaveBeenCalledTimes(1);

    await act(async () => result.current.handleUpload());
    expect(api.uploadImage).toHaveBeenCalledTimes(3);
    expect(api.uploadImage).toHaveBeenLastCalledWith(badTiff, 7);
    expect(result.current.uploadingFiles).toEqual([badTiff]);
    expect(onPartialSuccess).toHaveBeenCalledTimes(1);

    await act(async () => result.current.handleUpload());
    expect(api.uploadImage).toHaveBeenCalledTimes(4);
    expect(result.current.uploadingFiles).toEqual([]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("keeps an all-failed batch available for a later retry", async () => {
    const onSuccess = vi.fn();
    const first = makeFile("first.png", "image/png");
    const second = makeFile("second.png", "image/png");
    api.uploadImage
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({ success: false, message: "temporary failure" })
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useImageUpload({ id: 7 }, onSuccess));
    act(() => result.current.addFiles([first, second]));

    await act(async () => result.current.handleUpload());
    expect(result.current.uploadingFiles).toEqual([first, second]);
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => result.current.handleUpload());
    expect(api.uploadImage).toHaveBeenCalledTimes(4);
    expect(result.current.uploadingFiles).toEqual([]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("does not retry successful stacks or a partial stack that returned IDs", async () => {
    const onSuccess = vi.fn();
    const onPartialSuccess = vi.fn();
    const completeStack = makeFile("complete.e2e");
    const partialStack = makeFile("partial.vol");
    const unreadableStack = makeFile("unreadable.e2e");
    const failedImage = makeFile("bad.png", "image/png");
    const unsupported = makeFile("notes.pdf", "application/pdf");
    api.uploadStackFiles
      .mockResolvedValueOnce({ stack_ids: [1, 2], failed: [] })
      .mockResolvedValueOnce({
        stack_ids: [3],
        failed: [{ file_name: "partial.vol", reason: "one volume unreadable" }],
      })
      .mockResolvedValueOnce({
        stack_ids: [],
        failed: [{ file_name: "unreadable.e2e", reason: "no readable volumes" }],
      })
      .mockResolvedValueOnce({
        stack_ids: [],
        failed: [{ file_name: "unreadable.e2e", reason: "still unreadable" }],
      })
      .mockResolvedValueOnce({ stack_ids: [4], failed: [] });
    api.uploadImage
      .mockRejectedValueOnce(new Error("422 unsupported TIFF"))
      .mockRejectedValueOnce(new Error("422 unsupported TIFF"))
      .mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() => useImageUpload({ id: 7 }, onSuccess, onPartialSuccess));
    act(() => result.current.addFiles([completeStack, partialStack, unreadableStack, failedImage, unsupported]));

    await act(async () => result.current.handleUpload());
    expect(api.uploadStackFiles).toHaveBeenCalledTimes(3);
    expect(result.current.uploadingFiles).toEqual([unreadableStack, failedImage, unsupported]);
    expect(result.current.uploadErrors.join(" ")).toContain("one volume unreadable");
    expect(onPartialSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => result.current.handleUpload());
    expect(api.uploadStackFiles).toHaveBeenCalledTimes(4);
    expect(api.uploadImage).toHaveBeenCalledTimes(2);
    expect(api.uploadImage).toHaveBeenLastCalledWith(failedImage, 7);
    expect(result.current.uploadErrors.join(" ")).toContain("one volume unreadable");
    expect(result.current.uploadingFiles).toEqual([unreadableStack, failedImage, unsupported]);
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => result.current.handleUpload());
    expect(api.uploadStackFiles).toHaveBeenCalledTimes(5);
    expect(api.uploadImage).toHaveBeenCalledTimes(3);
    expect(api.uploadStackFiles.mock.calls.flatMap(([files]) => files.map((file) => file.name))).not.toContain("notes.pdf");
    expect(api.uploadImage.mock.calls.map(([file]) => file.name)).not.toContain("notes.pdf");
    expect(result.current.uploadingFiles).toEqual([]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("skips unsupported files and keeps queue editing safe", async () => {
    const onSuccess = vi.fn();
    const unsupported = makeFile("notes.pdf", "application/pdf");
    const removeMe = makeFile("remove.png", "image/png");
    const keepMe = makeFile("keep.png", "image/png");
    const addedLater = makeFile("later.png", "image/png");
    const { result } = renderHook(() => useImageUpload({ id: 7 }, onSuccess));

    act(() => result.current.addFiles([unsupported, removeMe, keepMe]));
    act(() => result.current.removeFile(1));
    act(() => result.current.removeUnsupported());
    act(() => result.current.addFiles([addedLater]));
    expect(result.current.uploadingFiles).toEqual([keepMe, addedLater]);

    act(() => result.current.clearFiles());
    expect(result.current.uploadingFiles).toEqual([]);
    expect(result.current.uploadProgress).toEqual({ current: 0, total: 0 });

    act(() => result.current.addFiles([unsupported]));
    await act(async () => result.current.handleUpload());
    expect(api.uploadImage).not.toHaveBeenCalled();
    expect(api.uploadStackFiles).not.toHaveBeenCalled();
    expect(result.current.uploadingFiles).toEqual([unsupported]);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("preserves files added while an earlier upload is in flight", async () => {
    let resolveUpload;
    const inFlight = makeFile("in-flight.png", "image/png");
    const addedDuringUpload = makeFile("added.png", "image/png");
    api.uploadImage.mockReturnValue(new Promise((resolve) => { resolveUpload = resolve; }));
    const onSuccess = vi.fn();
    const onPartialSuccess = vi.fn();
    const { result } = renderHook(() => useImageUpload({ id: 7 }, onSuccess, onPartialSuccess));
    act(() => result.current.addFiles([inFlight]));

    let uploadPromise;
    act(() => { uploadPromise = result.current.handleUpload(); });
    expect(api.uploadImage).toHaveBeenCalledWith(inFlight, 7);
    act(() => result.current.addFiles([addedDuringUpload]));

    await act(async () => {
      resolveUpload({ success: true });
      await uploadPromise;
    });
    expect(result.current.uploadingFiles).toEqual([addedDuringUpload]);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onPartialSuccess).toHaveBeenCalledTimes(1);
  });
});
