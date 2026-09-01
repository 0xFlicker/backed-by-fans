import { keccak256, stringToHex, type Hex } from "viem";

import type {
  RendererLabCandidateState,
  RendererPreviewResultSet,
} from "@/features/renderer-lab/candidate";

export type RendererReviewDecision = {
  decision: "approved" | "rejected";
  fingerprint: Hex;
  chainId: number;
  candidateFingerprint: Hex;
  requestSetFingerprint: Hex;
  resultFingerprints: readonly Hex[];
  decidedAt: number;
};

export type RendererApprovalErrorCode =
  | "candidate-missing"
  | "requests-missing"
  | "results-missing"
  | "results-incomplete"
  | "results-failed";

export class RendererApprovalError extends Error {
  readonly code: RendererApprovalErrorCode;

  constructor(code: RendererApprovalErrorCode, message: string) {
    super(message);
    this.name = "RendererApprovalError";
    this.code = code;
  }
}

type ReviewBinding = Omit<RendererReviewDecision, "fingerprint" | "decidedAt">;

function fingerprintReviewBinding(binding: ReviewBinding): Hex {
  return keccak256(
    stringToHex(
      JSON.stringify({
        decision: binding.decision,
        chainId: binding.chainId,
        candidateFingerprint: binding.candidateFingerprint.toLowerCase(),
        requestSetFingerprint: binding.requestSetFingerprint.toLowerCase(),
        resultFingerprints: binding.resultFingerprints.map((result) =>
          result.toLowerCase(),
        ),
      }),
    ),
  );
}

function requireCompleteResultSet(
  state: RendererLabCandidateState,
): RendererPreviewResultSet {
  if (!state.candidate) {
    throw new RendererApprovalError(
      "candidate-missing",
      "Load a renderer candidate before review.",
    );
  }
  if (!state.requestSet) {
    throw new RendererApprovalError(
      "requests-missing",
      "Representative requests are required before review.",
    );
  }
  if (!state.resultSet) {
    throw new RendererApprovalError(
      "results-missing",
      "Complete representative results are required before review.",
    );
  }
  if (
    state.resultSet.candidateFingerprint !==
      state.candidate.candidateFingerprint ||
    state.resultSet.requestSetFingerprint !==
      state.requestSet.requestSetFingerprint ||
    state.requestSet.candidateFingerprint !==
      state.candidate.candidateFingerprint
  ) {
    throw new RendererApprovalError(
      "results-incomplete",
      "Complete representative results for the current candidate are required before review.",
    );
  }
  if (
    state.requestSet.requests.length < 6 ||
    state.resultSet.results.length !== state.requestSet.requests.length
  ) {
    throw new RendererApprovalError(
      "results-incomplete",
      "Complete representative results are required before review.",
    );
  }
  return state.resultSet;
}

function bindingFromState(
  state: RendererLabCandidateState,
  decision: RendererReviewDecision["decision"],
): ReviewBinding {
  const resultSet = requireCompleteResultSet(state);
  return {
    decision,
    chainId: state.candidate!.chainId,
    candidateFingerprint: state.candidate!.candidateFingerprint,
    requestSetFingerprint: state.requestSet!.requestSetFingerprint,
    resultFingerprints: resultSet.results.map(
      (result) => result.resultFingerprint,
    ),
  };
}

function createRendererReview(
  state: RendererLabCandidateState,
  decision: RendererReviewDecision["decision"],
  decidedAt: number,
): RendererReviewDecision {
  const binding = bindingFromState(state, decision);
  if (
    decision === "approved" &&
    state.resultSet!.results.some((result) => result.status !== "ready")
  ) {
    throw new RendererApprovalError(
      "results-failed",
      "Every representative result must be successful before approval.",
    );
  }

  return {
    ...binding,
    fingerprint: fingerprintReviewBinding(binding),
    decidedAt,
  };
}

export function approveRendererCandidate(
  state: RendererLabCandidateState,
  approvedAt = Date.now(),
): RendererReviewDecision {
  return createRendererReview(state, "approved", approvedAt);
}

export function rejectRendererCandidate(
  state: RendererLabCandidateState,
  rejectedAt = Date.now(),
): RendererReviewDecision {
  return createRendererReview(state, "rejected", rejectedAt);
}

export function isRendererReviewCurrent(
  review: RendererReviewDecision | null | undefined,
  state: RendererLabCandidateState,
): boolean {
  if (!review) return false;
  try {
    const binding = bindingFromState(state, review.decision);
    return (
      review.fingerprint === fingerprintReviewBinding(binding) &&
      review.chainId === binding.chainId &&
      review.candidateFingerprint === binding.candidateFingerprint &&
      review.requestSetFingerprint === binding.requestSetFingerprint &&
      review.resultFingerprints.length === binding.resultFingerprints.length &&
      review.resultFingerprints.every(
        (result, index) => result === binding.resultFingerprints[index],
      )
    );
  } catch (error) {
    if (error instanceof RendererApprovalError) return false;
    throw error;
  }
}
