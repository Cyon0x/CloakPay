// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {IWithdrawVerifier} from "../src/interfaces/IWithdrawVerifier.sol";

/// @title ShieldedPoolFork
/// @notice Runs the pool that is actually deployed on Elysium testnet, on a fork
///         of that chain, so the deployed bytecode, the deployed verifier and a
///         real Groth16 proof are exercised together rather than separately.
///
///         Addresses are never hardcoded: `scripts/chain-fork-test.mjs` reads
///         them out of `src/config/pool-deployments.json` and passes them in. If
///         POOL_ADDRESS is unset the suite skips itself, so the ordinary offline
///         test run is unaffected.
contract ShieldedPoolForkTest is Test {
    ShieldedPool internal pool;
    IWithdrawVerifier internal verifier;

    /// 1 HYPE: index 1 of the denomination set the pool was deployed with, and
    /// the denomination the proof fixtures were generated for.
    uint256 internal denomIndex;
    uint256 internal denom;

    address payable internal constant RECIPIENT = payable(0x000000000000000000000000000000000000dEaD);
    address payable internal constant NOT_A_RELAYER = payable(address(0));

    struct Fixture {
        uint256 commitment;
        uint256 nullifierHash;
        uint256 root;
        ShieldedPool.Proof proof;
        uint256[5] signals;
    }

    function setUp() public {
        address poolAddress = vm.envOr("POOL_ADDRESS", address(0));
        if (poolAddress == address(0)) {
            vm.skip(true);
            return;
        }

        string memory rpc = vm.envOr(
            "ELYSIUM_RPC_URL",
            string("https://testnet-rpc.elysium.kinetiq.xyz")
        );
        vm.createSelectFork(rpc);

        pool = ShieldedPool(payable(poolAddress));
        verifier = pool.verifier();
        denomIndex = vm.envOr("DENOM_INDEX", uint256(1));
        denom = pool.denominations(denomIndex);

        // The fork must be of the chain the pool was deployed to.
        assertEq(block.chainid, vm.envOr("EXPECTED_CHAIN_ID", uint256(99801)), "forked the wrong chain");
    }

    function loadFixture(string memory path) internal view returns (Fixture memory f) {
        string memory json = vm.readFile(path);
        f.commitment = vm.parseUint(vm.parseJsonString(json, ".commitment"));
        f.nullifierHash = vm.parseUint(vm.parseJsonString(json, ".nullifierHash"));
        f.root = vm.parseUint(vm.parseJsonString(json, ".root"));
        f.proof.pA[0] = vm.parseUint(vm.parseJsonString(json, ".sol_pA0"));
        f.proof.pA[1] = vm.parseUint(vm.parseJsonString(json, ".sol_pA1"));
        f.proof.pB[0][0] = vm.parseUint(vm.parseJsonString(json, ".sol_pB00"));
        f.proof.pB[0][1] = vm.parseUint(vm.parseJsonString(json, ".sol_pB01"));
        f.proof.pB[1][0] = vm.parseUint(vm.parseJsonString(json, ".sol_pB10"));
        f.proof.pB[1][1] = vm.parseUint(vm.parseJsonString(json, ".sol_pB11"));
        f.proof.pC[0] = vm.parseUint(vm.parseJsonString(json, ".sol_pC0"));
        f.proof.pC[1] = vm.parseUint(vm.parseJsonString(json, ".sol_pC1"));
        f.signals[0] = vm.parseUint(vm.parseJsonString(json, ".sig0"));
        f.signals[1] = vm.parseUint(vm.parseJsonString(json, ".sig1"));
        f.signals[2] = vm.parseUint(vm.parseJsonString(json, ".sig2"));
        f.signals[3] = vm.parseUint(vm.parseJsonString(json, ".sig3"));
        f.signals[4] = vm.parseUint(vm.parseJsonString(json, ".sig4"));
    }

    function singleLeaf() internal view returns (Fixture memory) {
        return loadFixture("../tests/fixtures/withdraw-single-leaf.json");
    }

    /// The whole flow, on the deployed contracts: deposit, prove, withdraw.
    function test_deployed_pool_completes_a_deposit_and_a_withdrawal() public {
        Fixture memory f = singleLeaf();

        vm.deal(address(this), denom);
        uint256 recipientBefore = RECIPIENT.balance;

        uint32 leafIndex = pool.deposit{value: denom}(denomIndex, f.commitment);
        assertEq(leafIndex, 0, "the first deposit into an empty tree is leaf 0");
        assertEq(
            pool.currentRoot(denomIndex),
            f.root,
            "the deployed tree did not reach the root the proof was made against"
        );
        assertEq(pool.pooledBalance(denomIndex), denom, "the pool must hold exactly one denomination");

        assertTrue(
            verifier.verifyProof(f.proof.pA, f.proof.pB, f.proof.pC, f.signals),
            "the deployed verifier rejected a valid proof"
        );

        pool.withdraw(f.proof, denomIndex, f.root, f.nullifierHash, RECIPIENT, NOT_A_RELAYER, 0);

        assertEq(RECIPIENT.balance, recipientBefore + denom, "the recipient did not receive the denomination");
        assertEq(pool.pooledBalance(denomIndex), 0, "the pool still owes a denomination");
        assertTrue(pool.nullifierSpent(f.nullifierHash), "the nullifier was not recorded");
    }

    /// A note cannot be spent twice, even with a valid proof.
    function test_deployed_pool_refuses_a_reused_nullifier() public {
        Fixture memory f = singleLeaf();

        vm.deal(address(this), denom);
        pool.deposit{value: denom}(denomIndex, f.commitment);
        pool.withdraw(f.proof, denomIndex, f.root, f.nullifierHash, RECIPIENT, NOT_A_RELAYER, 0);

        vm.expectRevert(ShieldedPool.NoteAlreadySpent.selector);
        pool.withdraw(f.proof, denomIndex, f.root, f.nullifierHash, RECIPIENT, NOT_A_RELAYER, 0);
    }

    /// The deployed verifier must reject a proof whose public signals were altered.
    function test_deployed_verifier_rejects_tampered_public_signals() public {
        Fixture memory f = singleLeaf();

        uint256[5] memory tamperedRoot = f.signals;
        tamperedRoot[0] = tamperedRoot[0] + 1;
        assertFalse(
            verifier.verifyProof(f.proof.pA, f.proof.pB, f.proof.pC, tamperedRoot),
            "the verifier accepted a tampered root"
        );

        uint256[5] memory tamperedRecipient = f.signals;
        tamperedRecipient[2] = tamperedRecipient[2] + 1;
        assertFalse(
            verifier.verifyProof(f.proof.pA, f.proof.pB, f.proof.pC, tamperedRecipient),
            "the verifier accepted a redirected recipient, which would let a relayer steal the payout"
        );

        uint256[5] memory tamperedNullifier = f.signals;
        tamperedNullifier[1] = tamperedNullifier[1] + 1;
        assertFalse(
            verifier.verifyProof(f.proof.pA, f.proof.pB, f.proof.pC, tamperedNullifier),
            "the verifier accepted a nullifier the proof did not commit to"
        );
    }

    /// A proof against a root the deployed pool has never produced must be refused.
    function test_deployed_pool_refuses_a_proof_for_an_unknown_root() public {
        Fixture memory f = singleLeaf();
        vm.expectRevert(ShieldedPool.UnknownRoot.selector);
        pool.withdraw(f.proof, denomIndex, f.root, f.nullifierHash, RECIPIENT, NOT_A_RELAYER, 0);
    }

    /// A deposit of any amount other than the denomination must be refused.
    function test_deployed_pool_refuses_the_wrong_deposit_amount() public {
        vm.deal(address(this), denom);
        vm.expectRevert(
            abi.encodeWithSelector(ShieldedPool.WrongDepositAmount.selector, denom, denom / 2)
        );
        pool.deposit{value: denom / 2}(denomIndex, 12345);
    }

    /// An unknown denomination index must be refused.
    function test_deployed_pool_refuses_an_unknown_denomination() public {
        vm.deal(address(this), denom);
        vm.expectRevert(ShieldedPool.UnknownDenomination.selector);
        pool.deposit{value: denom}(99, 12345);
    }
}
