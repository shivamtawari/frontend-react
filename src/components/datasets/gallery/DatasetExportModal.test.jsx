import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import DatasetExportModal from "./DatasetExportModal";
import * as api from "../../../api";
import * as labelsApi from "../../../api/labels";
import { Permission } from "../../../utils/permissions";

vi.mock("../../../api", () => ({
  downloadIquanaArchive: vi.fn(),
  downloadCocoExport: vi.fn(),
}));

vi.mock("../../../api/labels", () => ({
  fetchLabels: vi.fn(),
}));

const mockCan = vi.fn();
vi.mock("../../../hooks/usePermissions", () => ({
  usePermissions: () => ({
    can: (...args) => mockCan(...args),
  }),
}));

describe("DatasetExportModal", () => {
  const dataset = { id: 42, name: "Reef Survey" };
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockCan.mockReturnValue(true);
  });

  it("does not render when isOpen is false", () => {
    render(<DatasetExportModal isOpen={false} onClose={onClose} dataset={dataset} />);
    expect(screen.queryByText("Export Dataset")).not.toBeInTheDocument();
  });

  it("renders with IQUANA archive as the default format", () => {
    render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);
    expect(screen.getByText("Export Dataset")).toBeInTheDocument();
    expect(screen.getByText("IQUANA archive")).toBeInTheDocument();
    expect(screen.getByText("COCO")).toBeInTheDocument();
    // IQUANA-specific options are visible
    expect(screen.getByText(/Include internal configuration/i)).toBeInTheDocument();
    // COCO-specific options are NOT visible
    expect(screen.queryByText(/Only fully-annotated images/i)).not.toBeInTheDocument();
    // Labels are NOT fetched while IQUANA is selected
    expect(labelsApi.fetchLabels).not.toHaveBeenCalled();
  });

  it("switches to COCO format and shows COCO options while hiding IQUANA options", async () => {
    labelsApi.fetchLabels.mockResolvedValueOnce({
      labels: [{ id: 1, name: "Acropora", parent_id: null }],
    });

    render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);

    // Click COCO tab
    fireEvent.click(screen.getByText("COCO"));

    expect(screen.getByText(/Only fully-annotated images/i)).toBeInTheDocument();
    expect(screen.getByText(/Only reviewed annotations/i)).toBeInTheDocument();
    expect(screen.queryByText(/Include internal configuration/i)).not.toBeInTheDocument();

    // Labels API is called when switched to COCO
    await waitFor(() => {
      expect(labelsApi.fetchLabels).toHaveBeenCalledWith(42);
      expect(screen.getByText("Acropora")).toBeInTheDocument();
    });
  });

  describe("IQUANA export behavior", () => {
    it("exports full IQUANA archive by default", async () => {
      api.downloadIquanaArchive.mockResolvedValueOnce();

      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);

      const downloadBtn = screen.getByRole("button", { name: /download archive \(\.zip\)/i });
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(api.downloadIquanaArchive).toHaveBeenCalledWith(42, {
          includeImages: true,
          includeConfig: false,
          datasetName: "Reef Survey",
        });
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("exports annotations-only IQUANA archive when selected and shows notice", async () => {
      api.downloadIquanaArchive.mockResolvedValueOnce();

      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);

      fireEvent.click(screen.getByRole("button", { name: /annotations only/i }));

      expect(
        screen.getByText(/Annotations-only archives cannot create a new dataset, and importing or merging them into an existing dataset is not supported yet/i)
      ).toBeInTheDocument();

      const downloadBtn = screen.getByRole("button", { name: /download archive \(\.zip\)/i });
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(api.downloadIquanaArchive).toHaveBeenCalledWith(42, {
          includeImages: false,
          includeConfig: false,
          datasetName: "Reef Survey",
        });
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("includes internal configuration when toggled", async () => {
      api.downloadIquanaArchive.mockResolvedValueOnce();

      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);

      fireEvent.click(screen.getByText(/Include internal configuration/i));

      const downloadBtn = screen.getByRole("button", { name: /download archive \(\.zip\)/i });
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(api.downloadIquanaArchive).toHaveBeenCalledWith(42, {
          includeImages: true,
          includeConfig: true,
          datasetName: "Reef Survey",
        });
      });
    });

    it("defaults to annotations-only and disables images option when user lacks EXPORT_IMAGES", () => {
      mockCan.mockImplementation((perm) => perm !== Permission.EXPORT_IMAGES);

      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);

      const imagesBtn = screen.getByRole("button", { name: /images \+ annotations/i });
      expect(imagesBtn).toBeDisabled();
      expect(screen.getByText("Not permitted")).toBeInTheDocument();
      expect(
        screen.getByText(/Annotations-only archives cannot create a new dataset/i)
      ).toBeInTheDocument();
    });
  });

  describe("COCO export behavior", () => {
    beforeEach(() => {
      labelsApi.fetchLabels.mockResolvedValue({
        labels: [
          { id: 1, name: "Substrate", parent_id: null },
          { id: 2, name: "Coral", parent_id: 1 },
        ],
      });
    });

    it("exports full COCO archive with all labels selected by default", async () => {
      api.downloadCocoExport.mockResolvedValueOnce();

      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);
      fireEvent.click(screen.getByText("COCO"));

      await waitFor(() => {
        expect(screen.getByText("Substrate")).toBeInTheDocument();
      });

      const exportBtn = screen.getByRole("button", { name: /^export$/i });
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(api.downloadCocoExport).toHaveBeenCalledWith(42, {
          includeImages: true,
          excludeUnreviewed: true,
          excludeNotFullyAnnotated: true,
          contourSelection: "all",
          labelIds: null,
        });
        expect(onClose).toHaveBeenCalled();
      });
    });

    it("exports subset of labels when some labels are deselected", async () => {
      api.downloadCocoExport.mockResolvedValueOnce();

      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);
      fireEvent.click(screen.getByText("COCO"));

      await waitFor(() => {
        expect(screen.getByText("Coral")).toBeInTheDocument();
      });

      // Deselect Coral
      fireEvent.click(screen.getByText("Coral"));

      const exportBtn = screen.getByRole("button", { name: /^export$/i });
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(api.downloadCocoExport).toHaveBeenCalledWith(42, {
          includeImages: true,
          excludeUnreviewed: true,
          excludeNotFullyAnnotated: true,
          contourSelection: "all",
          labelIds: [1],
        });
      });
    });

    it("disables export button when all labels are deselected", async () => {
      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);
      fireEvent.click(screen.getByText("COCO"));

      await waitFor(() => {
        expect(screen.getByText("Deselect all")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Deselect all"));

      const exportBtn = screen.getByRole("button", { name: /^export$/i });
      expect(exportBtn).toBeDisabled();
    });

    it("shows ancestor/descendant warning when both parent and child are selected", async () => {
      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);
      fireEvent.click(screen.getByText("COCO"));

      await waitFor(() => {
        expect(
          screen.getByText(/Selected labels include both parent and descendant categories/i)
        ).toBeInTheDocument();
      });
    });

    it("allows COCO export when user lacks LABEL_READ permission", async () => {
      mockCan.mockImplementation((perm) => perm !== Permission.LABEL_READ);
      api.downloadCocoExport.mockResolvedValueOnce();

      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);
      fireEvent.click(screen.getByText("COCO"));

      expect(labelsApi.fetchLabels).not.toHaveBeenCalled();
      expect(
        screen.getByText(/Label filtering is unavailable without label read permissions/i)
      ).toBeInTheDocument();

      const exportBtn = screen.getByRole("button", { name: /^export$/i });
      expect(exportBtn).not.toBeDisabled();
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(api.downloadCocoExport).toHaveBeenCalledWith(42, {
          includeImages: true,
          excludeUnreviewed: true,
          excludeNotFullyAnnotated: true,
          contourSelection: "all",
          labelIds: null,
        });
      });
    });

    it("allows COCO export when dataset has no labels", async () => {
      labelsApi.fetchLabels.mockResolvedValueOnce({ labels: [] });
      api.downloadCocoExport.mockResolvedValueOnce();

      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);
      fireEvent.click(screen.getByText("COCO"));

      await waitFor(() => {
        expect(screen.getByText("No labels found in this dataset.")).toBeInTheDocument();
      });

      const exportBtn = screen.getByRole("button", { name: /^export$/i });
      expect(exportBtn).not.toBeDisabled();
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(api.downloadCocoExport).toHaveBeenCalledWith(42, {
          includeImages: true,
          excludeUnreviewed: true,
          excludeNotFullyAnnotated: true,
          contourSelection: "all",
          labelIds: null,
        });
      });
    });

    it("disables COCO export when labels fail to load", async () => {
      labelsApi.fetchLabels.mockRejectedValueOnce(new Error("Network failed"));

      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);
      fireEvent.click(screen.getByText("COCO"));

      await waitFor(() => {
        expect(screen.getByText(/Failed to load labels: Network failed/i)).toBeInTheDocument();
      });

      const exportBtn = screen.getByRole("button", { name: /^export$/i });
      expect(exportBtn).toBeDisabled();
    });

    it("defaults COCO to annotations-only when user lacks EXPORT_IMAGES", async () => {
      mockCan.mockImplementation((perm) => perm !== Permission.EXPORT_IMAGES);

      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);
      fireEvent.click(screen.getByText("COCO"));

      await waitFor(() => {
        expect(screen.getByText("Substrate")).toBeInTheDocument();
      });

      const imagesBtn = screen.getByRole("button", { name: /images \+ annotations/i });
      expect(imagesBtn).toBeDisabled();
      expect(screen.getByText("Not permitted")).toBeInTheDocument();
    });
  });

  describe("Reset on close/reopen and error handling", () => {
    it("resets format to IQUANA and clears selections when closed and reopened", async () => {
      labelsApi.fetchLabels.mockResolvedValue({
        labels: [{ id: 1, name: "Coral", parent_id: null }],
      });

      const { rerender } = render(
        <DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />
      );

      // Switch to COCO
      fireEvent.click(screen.getByText("COCO"));
      await waitFor(() => {
        expect(screen.getByText("Coral")).toBeInTheDocument();
      });

      // Close modal
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(onClose).toHaveBeenCalled();

      // Reopen modal
      rerender(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);

      // Should be back to IQUANA default
      expect(screen.getByText(/Include internal configuration/i)).toBeInTheDocument();
      expect(screen.queryByText(/Only fully-annotated images/i)).not.toBeInTheDocument();
      // Labels from previous session must be cleared
      expect(screen.queryByText("Coral")).not.toBeInTheDocument();
    });

    it("prevents dismissal via backdrop, header close button, or cancel button during active export", async () => {
      let resolveExport;
      const exportPromise = new Promise((resolve) => {
        resolveExport = resolve;
      });
      api.downloadIquanaArchive.mockReturnValue(exportPromise);

      const { container } = render(
        <DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />
      );

      const downloadBtn = screen.getByRole("button", { name: /download archive \(\.zip\)/i });
      fireEvent.click(downloadBtn);

      // Modal is now in active export state
      expect(screen.getByText("Preparing Archive...")).toBeInTheDocument();

      // 1. Header close button must be disabled and not trigger onClose
      const closeBtn = screen.getByTitle("Close");
      expect(closeBtn).toBeDisabled();
      fireEvent.click(closeBtn);
      expect(onClose).not.toHaveBeenCalled();

      // 2. Backdrop click must not trigger onClose
      const backdrop = container.querySelector(".bg-scrim");
      expect(backdrop).toBeInTheDocument();
      fireEvent.click(backdrop);
      expect(onClose).not.toHaveBeenCalled();

      // 3. Cancel button must be disabled
      const cancelBtn = screen.getByRole("button", { name: /cancel/i });
      expect(cancelBtn).toBeDisabled();
      fireEvent.click(cancelBtn);
      expect(onClose).not.toHaveBeenCalled();

      // Finish export cleanly to avoid unresolved promises in test
      resolveExport();
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it("displays error message when export fails", async () => {
      api.downloadIquanaArchive.mockRejectedValueOnce(new Error("Disk quota exceeded"));

      render(<DatasetExportModal isOpen={true} onClose={onClose} dataset={dataset} />);

      const downloadBtn = screen.getByRole("button", { name: /download archive \(\.zip\)/i });
      fireEvent.click(downloadBtn);

      await waitFor(() => {
        expect(screen.getByText("Disk quota exceeded")).toBeInTheDocument();
      });
    });
  });
});
