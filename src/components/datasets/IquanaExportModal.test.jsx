import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import IquanaExportModal from "./IquanaExportModal";
import * as api from "../../api";

vi.mock("../../api", () => ({
  downloadIquanaArchive: vi.fn(),
}));

describe("IquanaExportModal", () => {
  const dataset = { id: 42, name: "Coral Survey" };
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <IquanaExportModal isOpen={false} onClose={onClose} dataset={dataset} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders with default configuration toggle off", () => {
    render(
      <IquanaExportModal isOpen={true} onClose={onClose} dataset={dataset} />
    );

    expect(screen.getByText("Export IQUANA Archive")).toBeInTheDocument();
    expect(screen.getByText("Include internal configuration (config.json)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download archive/i })).toBeInTheDocument();
  });

  it("exports without configuration when toggle is not activated", async () => {
    api.downloadIquanaArchive.mockResolvedValueOnce();

    render(
      <IquanaExportModal isOpen={true} onClose={onClose} dataset={dataset} />
    );

    const exportBtn = screen.getByRole("button", { name: /download archive/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(api.downloadIquanaArchive).toHaveBeenCalledWith(42, {
        includeConfig: false,
        datasetName: "Coral Survey",
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("exports with configuration when toggle is enabled", async () => {
    api.downloadIquanaArchive.mockResolvedValueOnce();

    render(
      <IquanaExportModal isOpen={true} onClose={onClose} dataset={dataset} />
    );

    const toggleBtn = screen.getByText("Include internal configuration (config.json)");
    fireEvent.click(toggleBtn);

    const exportBtn = screen.getByRole("button", { name: /download archive/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(api.downloadIquanaArchive).toHaveBeenCalledWith(42, {
        includeConfig: true,
        datasetName: "Coral Survey",
      });
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("displays error message if export API call fails", async () => {
    api.downloadIquanaArchive.mockRejectedValueOnce(new Error("Network connection dropped"));

    render(
      <IquanaExportModal isOpen={true} onClose={onClose} dataset={dataset} />
    );

    const exportBtn = screen.getByRole("button", { name: /download archive/i });
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(screen.getByText("Network connection dropped")).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("resets configuration toggle and errors between modal open sessions", () => {
    const { rerender } = render(
      <IquanaExportModal isOpen={true} onClose={onClose} dataset={dataset} />
    );

    // Toggle configuration on
    const toggleBtn = screen.getByText("Include internal configuration (config.json)");
    fireEvent.click(toggleBtn);

    // Close and unmount/hide modal
    rerender(<IquanaExportModal isOpen={false} onClose={onClose} dataset={dataset} />);

    // Reopen modal
    rerender(<IquanaExportModal isOpen={true} onClose={onClose} dataset={dataset} />);

    // Export button should trigger with includeConfig: false by default
    api.downloadIquanaArchive.mockResolvedValueOnce();
    const exportBtn = screen.getByRole("button", { name: /download archive/i });
    fireEvent.click(exportBtn);

    expect(api.downloadIquanaArchive).toHaveBeenCalledWith(42, {
      includeConfig: false,
      datasetName: "Coral Survey",
    });
  });
});
