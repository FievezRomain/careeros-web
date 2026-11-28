import type { Recommendation } from "./jobs-http";

const reasons: Record<Recommendation["reason"], string> = {
  qualified: "Meets your current search criteria.",
  paused: "Your automatic search is paused.",
  ignored: "You marked this opportunity as ignored.",
  expired: "This opportunity has expired.",
  applied: "You already applied to this opportunity.",
  not_recent: "This opportunity is outside the current matching window.",
  excluded: "This opportunity matches one of your exclusions.",
  criteria_mismatch: "This opportunity falls outside your search criteria.",
  criteria_unknown: "Some search criteria could not be verified.",
  hard_conflict: "A confirmed conflict blocks eligibility.",
  insufficient_evidence: "There is insufficient evidence to calculate a score.",
  external_to_verify: "The source has not provided verified full text.",
  below_threshold: "The score falls below your recommendation threshold.",
};

const statuses = {
  satisfied: "Satisfied",
  partial: "Partially satisfied",
  missing: "Missing",
  unknown: "Unknown",
};

const uncertainties = {
  unconfirmed_profile_facts:
    "Some requirements lack confirmed profile evidence.",
  no_verified_requirements: "No verified requirements are available.",
  external_to_verify: "The external source still requires verification.",
};

export function MatchExplanation({
  recommendation,
}: {
  recommendation: Recommendation;
}) {
  const { score, explanation, findings, limitation, hardConflicts } =
    recommendation.match;
  return (
    <>
      <p className="job-score">
        {score === null ? "Score unavailable" : `${String(score)}% match`}
      </p>
      <p>{reasons[recommendation.reason]}</p>
      <p>
        {explanation.assessedRequirements} of {explanation.totalRequirements}{" "}
        requirements assessed. Earned {explanation.earnedWeight} of{" "}
        {explanation.assessedWeight} assessed weight.
      </p>
      {explanation.uncertainty && (
        <p>
          {uncertainties[explanation.uncertainty]} Unknown requirements are
          excluded from the score.
        </p>
      )}
      {explanation.scoreBounds && (
        <p>
          Possible score after resolving unknowns:{" "}
          {explanation.scoreBounds.minimum}–{explanation.scoreBounds.maximum}%.
        </p>
      )}
      <p>{limitation}</p>
      {findings.length > 0 && (
        <ul className="match-findings">
          {findings.map((finding) => (
            <li key={finding.requirementId}>
              <blockquote>{finding.statement}</blockquote>
              <strong>{statuses[finding.status]}</strong>
              {hardConflicts.includes(finding.requirementId) && (
                <p className="error-message">Hard eligibility conflict</p>
              )}
              <p>
                Required level {finding.minimumLevel}.{" "}
                {finding.confirmedLevel === null
                  ? "No confirmed profile level."
                  : `Confirmed profile level ${String(finding.confirmedLevel)}.`}{" "}
                Weight {finding.weight}.{" "}
                {finding.earnedWeight === null
                  ? "Excluded from the score."
                  : `Contribution ${String(finding.earnedWeight)}.`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
