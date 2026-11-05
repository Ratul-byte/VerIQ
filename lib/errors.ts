/** Errors whose message is safe to show to end users (no stack traces, no internals). */
export class PipelineError extends Error {
  constructor(
    message: string,
    public kind:
      | "invalid_file" | "empty_document" | "invalid_pr" | "llm_unavailable"
      | "schema_failure" | "timeout" | "internal" = "internal",
  ) {
    super(message);
  }
}
