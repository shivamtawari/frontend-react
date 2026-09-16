import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import IquanaImportModal from "./IquanaImportModal";
import * as api from "../../api";

vi.mock("../../api", () => ({
  importIquanaArchive: vi.fn(),
}));

describe("IquanaImportModal", () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <IquanaImportModal isOpen={false} onClose={onClose} onSuccess={onSuccess} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders upload dropzone and disabled start button when no file selected", () => {
    render(
      <IquanaImportModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />
    );

    expect(screen.getByText("Import IQUANA Archive")).toBeInTheDocument();
    expect(screen.getByText(/Click or drag & drop an IQUANA archive/i)).toBeInTheDocument();
    const startBtn = screen.getByRole("button", { name: /start import/i });
    expect(startBtn).toBeDisabled();
  });

  it("handles valid .zip file selection and allows name override", async () => {
    render(
      <IquanaImportModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />
    );

    const file = new File(["dummy zip content"], "survey_archive.zip", {
      type: "application/zip",
    });

    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByText("survey_archive.zip")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText(/Leave empty to use the name saved in the archive/i);
    fireEvent.change(nameInput, { target: { value: "New Survey Name" } });
    expect(nameInput.value).toBe("New Survey Name");

    const startBtn = screen.getByRole("button", { name: /start import/i });
    expect(startBtn).not.toBeDisabled();
  });

  it("rejects non-zip file selection with error message", async () => {
    render(
      <IquanaImportModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />
    );

    const file = new File(["not a zip"], "document.pdf", {
      type: "application/pdf",
    });

    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(screen.getByText("Please select a valid .zip file.")).toBeInTheDocument();
  });

  it("submits import request, triggers onImportComplete and closes modal on success", async () => {
    const mockResponse = {
      success: true,
      message: "Dataset imported successfully.",
      dataset_id: 105,
      dataset_name: "Imported Coral Survey",
      config_applied: true,
    };
    api.importIquanaArchive.mockResolvedValueOnce(mockResponse);
    const onImportComplete = vi.fn();

    render(
      <IquanaImportModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        onImportComplete={onImportComplete}
      />
    );

    const file = new File(["zip data"], "archive.zip", { type: "application/zip" });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    const startBtn = screen.getByRole("button", { name: /start import/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(api.importIquanaArchive).toHaveBeenCalledWith(file, "");
      expect(onImportComplete).toHaveBeenCalledWith(mockResponse);
      expect(onSuccess).toHaveBeenCalledWith(mockResponse);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("preserves file selection on 409 conflict error so user can adjust name", async () => {
    const conflictError = new Error("Dataset with name 'Coral Survey' already exists.");
    conflictError.status = 409;
    api.importIquanaArchive.mockRejectedValueOnce(conflictError);

    render(
      <IquanaImportModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />
    );

    const file = new File(["zip data"], "archive.zip", { type: "application/zip" });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    const startBtn = screen.getByRole("button", { name: /start import/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(screen.getByText("Dataset with name 'Coral Survey' already exists.")).toBeInTheDocument();
      // File remains selected
      expect(screen.getByText("archive.zip")).toBeInTheDocument();
    });
  });

  it("closes after a successful import even when the response contains warnings", async () => {
    const mockResponseWithWarnings = {
      success: true,
      message: "Dataset imported successfully.",
      dataset_id: 106,
      dataset_name: "Survey with Warnings",
      config_applied: false,
      warnings: [
        "12 reviewer approvals could not be matched and were detached.",
        "Model 'sam2' referenced in config is not available on this server.",
      ],
    };
    api.importIquanaArchive.mockResolvedValueOnce(mockResponseWithWarnings);
    const onImportComplete = vi.fn();
    render(
      <IquanaImportModal
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
        onImportComplete={onImportComplete}
      />
    );

    const file = new File(["zip data"], "archive.zip", { type: "application/zip" });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    const startBtn = screen.getByRole("button", { name: /start import/i });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(api.importIquanaArchive).toHaveBeenCalledWith(file, "");
      expect(onImportComplete).toHaveBeenCalledWith(mockResponseWithWarnings);
      expect(onSuccess).toHaveBeenCalledWith(mockResponseWithWarnings);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("prevents dismissal via backdrop, header X, or cancel button during active import", async () => {
    let resolveImport;
    const importPromise = new Promise((resolve) => {
      resolveImport = resolve;
    });
    api.importIquanaArchive.mockReturnValueOnce(importPromise);

    render(
      <IquanaImportModal isOpen={true} onClose={onClose} onSuccess={onSuccess} />
    );

    const file = new File(["zip data"], "archive.zip", { type: "application/zip" });
    const fileInput = document.querySelector('input[type="file"]');
    fireEvent.change(fileInput, { target: { files: [file] } });

    const startBtn = screen.getByRole("button", { name: /start import/i });
    fireEvent.click(startBtn);

    // Now actively importing
    expect(screen.getByText("Importing Dataset...")).toBeInTheDocument();

    // Try clicking backdrop
    const backdrop = document.querySelector(".bg-scrim");
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    // Try clicking header close button
    const closeBtn = screen.getByTitle("Close");
    expect(closeBtn).toBeDisabled();
    fireEvent.click(closeBtn);
    expect(onClose).not.toHaveBeenCalled();

    // Clean up unresolved promise
    resolveImport({
      success: true,
      dataset_id: 107,
      dataset_name: "Cleaned Survey",
      config_applied: true,
      warnings: [],
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });
});
