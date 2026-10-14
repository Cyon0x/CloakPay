// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IWithdrawVerifier
/// @notice The interface produced by `snarkjs zkey export solidityverifier` for
///         `circuits/withdraw.circom`. The public signal order is fixed by the
///         circuit's declaration order: [root, nullifierHash, recipient, relayer, fee].
interface IWithdrawVerifier {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[5] calldata publicSignals
    ) external view returns (bool);
}
