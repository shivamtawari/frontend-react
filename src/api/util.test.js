import { handleApiError } from "./util";

const mockJsonResponse = (status, body) => ({
  ok: false,
  status,
  statusText: "Bad Request",
  json: async () => body,
});

describe("handleApiError", () => {
  test("surfaces a string detail as-is", async () => {
    const response = mockJsonResponse(400, { detail: "Dataset not found." });
    await expect(handleApiError(response)).rejects.toThrow(
      "API Error: Dataset not found."
    );
  });

  test("surfaces FastAPI validation array details", async () => {
    const response = mockJsonResponse(422, {
      detail: [{ loc: ["body", "dataset_id"], msg: "field required" }],
    });
    await expect(handleApiError(response)).rejects.toThrow(
      "API Validation Error: body.dataset_id: field required"
    );
  });

  test("surfaces a structured object detail without collapsing to [object Object]", async () => {
    const response = mockJsonResponse(400, {
      detail: {
        message: "Failed to export annotations.",
        error_code: "empty_residual",
        details: { contour_id: 42, label_id: 7 },
      },
    });
    const error = await handleApiError(response).catch((e) => e);
    expect(error.message).not.toContain("[object Object]");
    expect(error.message).toContain("Failed to export annotations.");
    expect(error.message).toContain("empty_residual");
    expect(error.message).toContain("\"contour_id\": 42");
  });

  test("falls back to JSON for an unrecognized object detail shape", async () => {
    const response = mockJsonResponse(400, { detail: { foo: "bar" } });
    const error = await handleApiError(response).catch((e) => e);
    expect(error.message).not.toContain("[object Object]");
    expect(error.message).toContain("\"foo\": \"bar\"");
  });
});
