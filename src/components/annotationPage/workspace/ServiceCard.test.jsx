import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ServiceCard from "./ServiceCard";
import * as annotationSelectors from "../../../stores/selectors/annotationSelectors";

describe("ServiceCard", () => {
    const mockSetFavorite = vi.fn();
    const mockClearFavorite = vi.fn();

    const sampleService = {
        key: "prompted",
        task: "prompted-segmentation",
        name: "Prompted Segmentation",
        selectedModel: "sam2-cell",
        models: [
            { id: "sam2-cell", name: "SAM 2 Cell", model_status: "ready" },
            { id: "sam2-generic", name: "SAM 2 Generic", model_status: "ready" },
        ],
        onSelectModel: vi.fn(),
        isRunning: false,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(annotationSelectors, "useSetFavoriteModel").mockReturnValue(mockSetFavorite);
        vi.spyOn(annotationSelectors, "useClearFavoriteModel").mockReturnValue(mockClearFavorite);
    });

    it("renders favorite star and calls setFavoriteModel when not favorited", () => {
        vi.spyOn(annotationSelectors, "useModelFavorites").mockReturnValue({});

        render(<ServiceCard service={sampleService} />);

        const starBtn = screen.getByRole("button", { name: "Set as default model" });
        expect(starBtn).toBeInTheDocument();

        fireEvent.click(starBtn);
        expect(mockSetFavorite).toHaveBeenCalledWith("prompted-segmentation", "sam2-cell");
    });

    it("calls clearFavoriteModel when model is currently favorited", () => {
        vi.spyOn(annotationSelectors, "useModelFavorites").mockReturnValue({
            "prompted-segmentation": "sam2-cell",
        });

        render(<ServiceCard service={sampleService} />);

        const starBtn = screen.getByRole("button", { name: "Remove default model" });
        expect(starBtn).toBeInTheDocument();

        fireEvent.click(starBtn);
        expect(mockClearFavorite).toHaveBeenCalledWith("prompted-segmentation");
    });
});
