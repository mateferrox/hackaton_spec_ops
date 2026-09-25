export type ErrorCode =
  | "INVALID_INPUT"
  | "MOCK_INPUT_MISMATCH"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_ANALYSIS"
  | "INVALID_ANSWER"
  | "LIVE_NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "INVALID_MODEL_OUTPUT"
  | "ANALYSIS_TIMEOUT"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "STALE_SPEC"
  | "CAPABILITY_UNAVAILABLE"
  | "INVALID_STATE"
  | "PROVIDER_NOT_CONFIGURED"
  | "RUNNER_UNREACHABLE"
  | "COMMAND_TIMEOUT"
  | "CONFLICT";

const RETRYABLE: ReadonlySet<ErrorCode> = new Set([
  "PROVIDER_ERROR",
  "ANALYSIS_TIMEOUT",
  "RUNNER_UNREACHABLE",
]);

export class SpecOpsError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, status: number) {
    super(message);
    this.name = "SpecOpsError";
    this.code = code;
    this.status = status;
    this.retryable = RETRYABLE.has(code);
  }

  toApiError(): {
    error: { code: string; message: string; retryable: boolean };
  } {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: this.retryable,
      },
    };
  }
}
