import { fireEvent, render, screen } from "@testing-library/react";
import ModelMetadataGate, { MODEL_METADATA_STATUS } from "./ModelMetadataGate";

const modelConfig = <div data-testid="training-config">Mask2Former configuration</div>;

describe("ModelMetadataGate", () => {
  test("does not render model configuration while metadata is loading", () => {
    render(
      <ModelMetadataGate status={MODEL_METADATA_STATUS.LOADING} models={[]}>
        {modelConfig}
      </ModelMetadataGate>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading training models");
    expect(screen.queryByTestId("training-config")).not.toBeInTheDocument();
    expect(screen.queryByText("Mask2Former configuration")).not.toBeInTheDocument();
  });

  test("shows a retry action for metadata failures", () => {
    const onRetry = jest.fn();

    render(
      <ModelMetadataGate
        status={MODEL_METADATA_STATUS.ERROR}
        models={[]}
        error="Registry unavailable"
        onRetry={onRetry}
      >
        {modelConfig}
      </ModelMetadataGate>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Registry unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("training-config")).not.toBeInTheDocument();
  });

  test("distinguishes a valid empty registry from a failed load", () => {
    render(
      <ModelMetadataGate status={MODEL_METADATA_STATUS.EMPTY} models={[]}>
        {modelConfig}
      </ModelMetadataGate>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("No training models available");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("training-config")).not.toBeInTheDocument();
  });

  test("renders the existing configuration only after metadata succeeds", () => {
    render(
      <ModelMetadataGate
        status={MODEL_METADATA_STATUS.SUCCESS}
        models={[{ registry_key: "mask2former" }]}
      >
        {modelConfig}
      </ModelMetadataGate>,
    );

    expect(screen.getByTestId("training-config")).toBeInTheDocument();
  });

  test("fails closed for an unknown metadata status", () => {
    const onRetry = jest.fn();

    render(
      <ModelMetadataGate status="future-status" models={[{ registry_key: "mask2former" }]} onRetry={onRetry}>
        {modelConfig}
      </ModelMetadataGate>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Training models are unavailable");
    expect(screen.queryByTestId("training-config")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("fails closed when SUCCESS does not contain valid models", () => {
    render(
      <ModelMetadataGate status={MODEL_METADATA_STATUS.SUCCESS} models={[{}]}>
        {modelConfig}
      </ModelMetadataGate>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Training models are unavailable");
    expect(screen.queryByTestId("training-config")).not.toBeInTheDocument();
  });
});
