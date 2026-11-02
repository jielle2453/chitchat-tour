import { describe, expect, it } from "vitest";
import { isRoutineStep, routineTraceKey, ROUTINE_TRACE_MS, shouldEmitRoutineTrace } from "./useWalk";

describe("routine trace throttle", () => {
  it("keys on area plus candidate set", () => {
    expect(routineTraceKey("Yongkang Street", [{ itemId: "a" }])).toBe("Yongkang Street|a");
    expect(routineTraceKey("Yongkang Street", [{ itemId: "a" }])).not.toBe(routineTraceKey("Yongkang Street", [{ itemId: "b" }]));
    expect(routineTraceKey("Yongkang Street", [{ itemId: "a" }])).not.toBe(routineTraceKey("Dongmen", [{ itemId: "a" }]));
  });
  it("emits on first sight, on change, or after ~60 s", () => {
    const key = "Yongkang Street|a";
    expect(shouldEmitRoutineTrace(null, key, 0)).toBe(true);
    const prev = { at: 1000, key };
    expect(shouldEmitRoutineTrace(prev, key, 2000)).toBe(false);
    expect(shouldEmitRoutineTrace(prev, "Yongkang Street|b", 2000)).toBe(true);
    expect(shouldEmitRoutineTrace(prev, "Dongmen|a", 2000)).toBe(true);
    expect(shouldEmitRoutineTrace(prev, key, 1000 + ROUTINE_TRACE_MS)).toBe(true);
    expect(shouldEmitRoutineTrace(prev, key, 1000 + ROUTINE_TRACE_MS - 1)).toBe(false);
  });
  it("treats only position/user steps as routine", () => {
    expect(isRoutineStep("position")).toBe(true);
    expect(isRoutineStep("user")).toBe(true);
    expect(isRoutineStep("skip")).toBe(false);
    expect(isRoutineStep("decision")).toBe(false);
    expect(isRoutineStep("candidate")).toBe(false);
  });
});
