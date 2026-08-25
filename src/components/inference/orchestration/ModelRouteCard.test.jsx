import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ModelRouteCard from "./ModelRouteCard";
import { ROUTE_STATUS } from "./orchestrationViewModel";

describe("ModelRouteCard", () => {
  const mockModel = {
    registry_key: "sam2-prompted",
    name: "SAM 2 Large",
    task: "prompted-segmentation",
    description: "Fast prompted mask generator",
    badges: ["SOTA", "Fast"],
    trained_on_dataset: true,
  };

  it("renders explicit route with model badges, description, and configure action", () => {
    const handleConfigure = vi.fn();

    render(
      <ModelRouteCard
        task="prompted-segmentation"
        label={{ id: 1, name: "cell" }}
        effectiveRoute={{
          status: ROUTE_STATUS.EXPLICIT,
          model: mockModel,
          binding: { model_registry_key: "sam2-prompted" },
        }}
        availableModels={[mockModel]}
        onConfigure={handleConfigure}
        canEdit={true}
      />
    );

    expect(screen.getByText("SAM 2 Large")).toBeInTheDocument();
    expect(screen.queryByText("Explicit Override")).not.toBeInTheDocument();
    expect(screen.getByText("Fine-tuned")).toBeInTheDocument();
    expect(screen.getByText("Fast prompted mask generator")).toBeInTheDocument();
    expect(screen.getByText("SOTA")).toBeInTheDocument();

    const configBtn = screen.getByRole("button", { name: /configure cell route/i });
    fireEvent.click(configBtn);
    expect(handleConfigure).toHaveBeenCalledWith("prompted-segmentation", 1);
  });

  it("renders inherited route with parent model name and bind model action", () => {
    const handleConfigure = vi.fn();

    render(
      <ModelRouteCard
        task="prompted-segmentation"
        label={{ id: 2, name: "nucleus" }}
        effectiveRoute={{
          status: ROUTE_STATUS.INHERITED,
          model: mockModel,
          binding: { model_registry_key: "sam2-prompted" },
          inheritedFrom: "task-default",
        }}
        availableModels={[mockModel]}
        onConfigure={handleConfigure}
        canEdit={true}
      />
    );

    expect(screen.getByText("SAM 2 Large")).toBeInTheDocument();
    expect(screen.getByText("Inherits default")).toBeInTheDocument();

    const bindBtn = screen.getByRole("button", { name: /bind model to nucleus/i });
    fireEvent.click(bindBtn);
    expect(handleConfigure).toHaveBeenCalledWith("prompted-segmentation", 2);
  });

  it("renders stale degraded route with warning message and repair button", () => {
    const handleConfigure = vi.fn();

    render(
      <ModelRouteCard
        task="prompted-segmentation"
        label={null}
        effectiveRoute={{
          status: ROUTE_STATUS.STALE,
          model: null,
          binding: { model_registry_key: "deleted-model-key" },
        }}
        availableModels={[]}
        onConfigure={handleConfigure}
        canEdit={true}
      />
    );

    expect(screen.getByText("deleted-model-key")).toBeInTheDocument();
    expect(screen.getByText("Degraded / Unavailable")).toBeInTheDocument();

    const repairBtn = screen.getByRole("button", { name: /repair task default route/i });
    fireEvent.click(repairBtn);
    expect(handleConfigure).toHaveBeenCalledWith("prompted-segmentation", null);
  });

  it("disables bind model action when no compatible models exist in catalog", () => {
    render(
      <ModelRouteCard
        task="instance-segmentation"
        label={{ id: 2, name: "nucleus" }}
        effectiveRoute={{
          status: ROUTE_STATUS.UNBOUND_INCOMPATIBLE,
          model: null,
          binding: { model_registry_key: "specialist_model" },
        }}
        availableModels={[]}
        onConfigure={vi.fn()}
        canEdit={true}
      />
    );

    const bindBtn = screen.getByRole("button", { name: /bind model to nucleus/i });
    expect(bindBtn).toBeDisabled();
  });

  it("distinguishes incompatible models from missing models in stale route display", () => {
    const specialistModel = {
      registry_key: "specialist_cell",
      name: "Cell Specialist",
      task: "instance-segmentation",
      label_ids: [1],
    };

    render(
      <ModelRouteCard
        task="instance-segmentation"
        label={{ id: 2, name: "nucleus" }}
        effectiveRoute={{
          status: ROUTE_STATUS.STALE,
          model: specialistModel,
          binding: { model_registry_key: "specialist_cell" },
          reason: "incompatible_model",
          isExplicit: true,
        }}
        availableModels={[]}
        onConfigure={vi.fn()}
        canEdit={true}
      />
    );

    expect(screen.getByText("Cell Specialist")).toBeInTheDocument();
    expect(screen.getByText("Incompatible with label")).toBeInTheDocument();
    expect(
      screen.getByText(/This model only predicts specific classes and does not support this label/)
    ).toBeInTheDocument();
  });
});
