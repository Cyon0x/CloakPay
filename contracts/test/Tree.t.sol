// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
import {Test} from "forge-std/Test.sol";
import {MerkleTreeWithHistory} from "../src/MerkleTreeWithHistory.sol";

/// Checks the hardcoded zero table against runtime Poseidon, and against the
/// values the TypeScript tree produces.
contract TreeTest is Test {
    uint256 constant TS_EMPTY_ROOT =
        15019797232609675441998260052101280400536945603062888308240081994073687793470;

    function test_zero_table_matches_runtime_poseidon() public pure {
        uint256[33] memory table = MerkleTreeWithHistory.zeroTable();
        assertEq(table[0], 0);
        for (uint256 i = 0; i < 32; i++) {
            assertEq(
                table[i + 1],
                MerkleTreeWithHistory.hashPair(table[i], table[i]),
                "zero table drifted from runtime Poseidon"
            );
        }
    }

    function test_default_hashes_match_typescript() public pure {
        uint256[] memory zeros = MerkleTreeWithHistory.defaultHashes(20);
        assertEq(zeros.length, 21);
        assertEq(
            zeros[1],
            14744269619966411208579211824598458697587494354926760081771325075741142829156
        );
        assertEq(zeros[20], TS_EMPTY_ROOT);
    }
}
