import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";

import {
  createRendererLabCandidateState,
  replaceRendererCandidate,
  replaceRendererPreviewRequests,
  replaceRendererPreviewResults,
  type RendererCandidateInput,
  type RendererPreviewRequest,
  type RendererPreviewResultInput,
} from "@/features/renderer-lab/candidate";
import {
  approveRendererCandidate,
  isRendererReviewCurrent,
  rejectRendererCandidate,
  RendererApprovalError,
} from "@/features/renderer-lab/approval";

const interfaceSchema = `0x${"12".repeat(32)}` as Hex;

function candidateFixture({
  creationBytecode = "0x6000600055",
}: {
  creationBytecode?: Hex;
} = {}): RendererCandidateInput {
  return {
    candidateId: "candidate-1",
    chainId: 46_630,
    artifactFingerprint: `0x${"ab".repeat(32)}`,
    interfaceSchema,
    creationBytecode,
    runtimeBytecode: "0x6000",
    initCodeByteLength: (creationBytecode.length - 2) / 2,
  };
}

function requestFixtures(suffix = "base"): readonly RendererPreviewRequest[] {
  return [
    [1, "active", false],
    [1, "expired", true],
    [7, "active", true],
    [7, "expired", false],
    [42, "active", false],
    [42, "expired", true],
  ].map(([tokenId, membershipState, localImageSlot], index) => ({
    requestId: `request-${index + 1}`,
    mode: "undeployed-initcode" as const,
    method: "previewSVG" as const,
    contextWithoutMedia: { membershipState, suffix, tokenId },
    localImageSlot: Boolean(localImageSlot),
  }));
}

function readyResults(suffix = "base"): readonly RendererPreviewResultInput[] {
  return requestFixtures().map((request) => ({
    requestId: request.requestId,
    status: "ready" as const,
    image: `<svg xmlns="http://www.w3.org/2000/svg"><text>${request.requestId}-${suffix}</text></svg>`,
  }));
}

function stateWithResults(
  results: readonly RendererPreviewResultInput[] = readyResults(),
) {
  let state = createRendererLabCandidateState();
  state = replaceRendererCandidate(state, candidateFixture());
  if (!state.candidate) throw new Error("Expected a renderer candidate.");
  const candidateFingerprint = state.candidate.candidateFingerprint;
  state = replaceRendererPreviewRequests(
    state,
    candidateFingerprint,
    requestFixtures(),
  );
  if (!state.requestSet) throw new Error("Expected representative requests.");
  return replaceRendererPreviewResults(state, {
    candidateFingerprint,
    requestSetFingerprint: state.requestSet.requestSetFingerprint,
    results,
  });
}

describe("renderer candidate browser-memory state", () => {
  it("tracks candidate, request, and result mutations without using persistence APIs", () => {
    const localStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    const sessionStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("sessionStorage", sessionStorage);

    const state = stateWithResults();

    expect(state.mutation).toMatchObject({ revision: 3, kind: "results" });
    expect(state.resultSet?.results).toHaveLength(6);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("rejects stale representative results from another candidate or request set", () => {
    let state = createRendererLabCandidateState();
    state = replaceRendererCandidate(state, candidateFixture());
    if (!state.candidate) throw new Error("Expected a renderer candidate.");
    state = replaceRendererPreviewRequests(
      state,
      state.candidate.candidateFingerprint,
      requestFixtures(),
    );
    if (!state.requestSet) throw new Error("Expected representative requests.");

    expect(() =>
      replaceRendererPreviewResults(state, {
        candidateFingerprint: `0x${"ee".repeat(32)}`,
        requestSetFingerprint: state.requestSet!.requestSetFingerprint,
        results: readyResults(),
      }),
    ).toThrow(/candidate/i);
    expect(() =>
      replaceRendererPreviewResults(state, {
        candidateFingerprint: state.candidate!.candidateFingerprint,
        requestSetFingerprint: `0x${"ff".repeat(32)}`,
        results: readyResults(),
      }),
    ).toThrow(/request/i);
  });
});

describe("renderer creator approval", () => {
  it("binds approval and rejection to the exact candidate, requests, and displayed results", () => {
    const state = stateWithResults();
    const approval = approveRendererCandidate(state, 1_800_000_000_000);
    const rejection = rejectRendererCandidate(state, 1_800_000_000_001);

    expect(approval).toMatchObject({
      decision: "approved",
      chainId: 46_630,
      candidateFingerprint: state.candidate?.candidateFingerprint,
      requestSetFingerprint: state.requestSet?.requestSetFingerprint,
      resultFingerprints: state.resultSet?.results.map(
        (result) => result.resultFingerprint,
      ),
      decidedAt: 1_800_000_000_000,
    });
    expect(rejection).toMatchObject({
      decision: "rejected",
      candidateFingerprint: state.candidate?.candidateFingerprint,
      requestSetFingerprint: state.requestSet?.requestSetFingerprint,
      decidedAt: 1_800_000_000_001,
    });
    expect(isRendererReviewCurrent(approval, state)).toBe(true);
    expect(isRendererReviewCurrent(rejection, state)).toBe(true);
  });

  it("does not approve incomplete or failed representative results", () => {
    const incomplete = stateWithResults(readyResults().slice(0, 5));
    expect(() => approveRendererCandidate(incomplete)).toThrow(
      RendererApprovalError,
    );
    expect(() => approveRendererCandidate(incomplete)).toThrow(/complete/i);

    const failed = stateWithResults([
      ...readyResults().slice(0, 5),
      {
        requestId: "request-6",
        status: "failed",
        error: "Renderer call reverted.",
      },
    ]);
    expect(() => approveRendererCandidate(failed)).toThrow(/successful/i);
    expect(
      isRendererReviewCurrent(rejectRendererCandidate(failed), failed),
    ).toBe(true);
  });

  it("invalidates approval and rejection after candidate, request, or result mutation", () => {
    const approvedState = stateWithResults();
    const decisions = [
      approveRendererCandidate(approvedState),
      rejectRendererCandidate(approvedState),
    ];

    const changedCandidate = replaceRendererCandidate(
      approvedState,
      candidateFixture({ creationBytecode: "0x6001600055" }),
    );

    const changedRequests = replaceRendererPreviewRequests(
      approvedState,
      approvedState.candidate!.candidateFingerprint,
      requestFixtures("changed"),
    );

    const changedResults = replaceRendererPreviewResults(approvedState, {
      candidateFingerprint: approvedState.candidate!.candidateFingerprint,
      requestSetFingerprint: approvedState.requestSet!.requestSetFingerprint,
      results: readyResults("changed"),
    });

    for (const decision of decisions) {
      expect(isRendererReviewCurrent(decision, changedCandidate)).toBe(false);
      expect(isRendererReviewCurrent(decision, changedRequests)).toBe(false);
      expect(isRendererReviewCurrent(decision, changedResults)).toBe(false);
    }

    expect(changedCandidate.requestSet).toBeNull();
    expect(changedCandidate.resultSet).toBeNull();
    expect(changedRequests.resultSet).toBeNull();
    expect(changedResults.resultSet).not.toBeNull();
  });
});
