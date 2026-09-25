export type {
  Mode,
  AnalyzeRequest,
  Task,
  Choice,
  Assumption,
  Analysis,
  Answer,
  ResolveRequest,
  TaskResolution,
  Resolution,
  ApiError,
} from "./contracts.js";

export { analyze, isLiveConfigured } from "./analyze.js";
export { resolve } from "./resolve.js";
export {
  DEMO_ANALYZE_REQUEST,
  DEMO_ANALYSIS,
  DEMO_PLAN,
  DEMO_SPEC,
} from "./fixture.js";
export { SpecOpsError } from "./errors.js";
export { createAppServer, HOST, PORT } from "./http.js";
