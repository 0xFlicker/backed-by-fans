// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Immutable cumulative reward-weight arithmetic in raw payment-token units.
/// @dev C = 2^112-1 bounds cumulative accepted raw payments, not token supply.
/// Asset onboarding must consider raw denomination and lifetime circulation volume.
/// Refunds never rewind the cursor or recover capacity. Quotes over remaining C revert
/// before funds/time change. Display conversion must be exact; display multipliers do
/// not alter C. Cash uses Q = 2^128 separately, keeping scaled lifetime amounts below 2^240.
library RewardCurve {
    uint256 internal constant MAX_GROSS = type(uint112).max;
    uint32 internal constant NORMAL_BOOST_BPS = 10_000;
    uint32 internal constant MAX_BOOST_BPS = 100_000;
    uint32 internal constant BOOST_STEP_BPS = 100;

    error InvalidCurveSettings();
    error CurveCapacityExceeded();

    /// @notice Boost is 1.00x–10.00x in 0.01x increments; None requires zero horizon.
    /// @dev Enabled horizon is 1..C raw units. A priced horizon must represent an exact
    /// whole number of periods fitting uint64. Actual access timestamps have separate bounds.
    function validate(uint32 boost, uint112 horizon, uint256 price) internal pure {
        if (
            boost < NORMAL_BOOST_BPS || boost > MAX_BOOST_BPS || boost % BOOST_STEP_BPS != 0
                || price > MAX_GROSS
        ) revert InvalidCurveSettings();
        if (boost == NORMAL_BOOST_BPS) {
            if (horizon != 0) revert InvalidCurveSettings();
        } else {
            if (horizon == 0) revert InvalidCurveSettings();
            if (price != 0 && (horizon % price != 0 || horizon / price > type(uint64).max)) {
                revert InvalidCurveSettings();
            }
        }
    }

    /// @notice Exact issuance at this cursor; a quote does not reserve its position.
    /// @dev boost/horizon are immutable constructor-validated terms. Only payment capacity
    /// changes at runtime; revalidating those immutable terms bloats every deployed tier.
    function quote(uint112 cursor, uint256 gross, uint32 boost, uint112 horizon)
        internal
        pure
        returns (uint256)
    {
        if (gross > MAX_GROSS - cursor) revert CurveCapacityExceeded();
        return
            cumulative(uint256(cursor) + gross, boost, horizon) - cumulative(cursor, boost, horizon);
    }

    /// @dev Inputs are bounded by validate/quote. Largest numerator is below 2^241.
    function cumulative(uint256 gross, uint32 boost, uint112 horizon)
        private
        pure
        returns (uint256)
    {
        if (boost == NORMAL_BOOST_BPS) return gross;
        uint256 u = gross < horizon ? gross : horizon;
        return gross + uint256(boost - NORMAL_BOOST_BPS) * u * (2 * uint256(horizon) - u)
            / (20_000 * uint256(horizon));
    }
}
