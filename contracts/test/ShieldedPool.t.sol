// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";
import {Groth16VerifierTransfer} from "../src/Groth16VerifierTransfer.sol";
import {MerkleTreeWithHistory} from "../src/MerkleTreeWithHistory.sol";
import {IWithdrawVerifier} from "../src/interfaces/IWithdrawVerifier.sol";
import {ITransferVerifier} from "../src/interfaces/ITransferVerifier.sol";

/// @notice Tests the shielded pool against real Groth16 proofs.
///
/// The proofs in tests/fixtures are produced by the compiled circuit
/// (`npm run zk:prove-fixtures`) and verified here by the deployed
/// Groth16Verifier, i.e. through the same pairing precompile path that runs on
/// Elysium. Nothing in this file mocks the verifier: a broken circuit or a
/// broken verifier makes these tests fail.
contract ShieldedPoolTest is Test {
    ShieldedPool internal pool;
    Groth16Verifier internal verifier;
    Groth16VerifierTransfer internal transferVerifier;

    uint32 internal constant DEPTH = 20;
    uint256 internal constant D_SMALL = 0.01 ether;
    uint256 internal constant D01 = 0.1 ether;
    uint256 internal constant D1 = 1 ether;
    /// Index of `D1` in the deployed denomination set: [0.01, 0.1, 1].
    uint256 internal constant D1_INDEX = 2;
    /// Index of `D_SMALL`, the denomination a funded end-to-end run uses.
    uint256 internal constant SMALL_INDEX = 0;

    /// Cross-language pin: the same value `src/protocol/merkle.ts` computes for
    /// an empty depth-20 tree. If either implementation drifts, this fails.
    uint256 internal constant TYPE_SCRIPT_EMPTY_ROOT =
        15019797232609675441998260052101280400536945603062888308240081994073687793470;

    address internal constant RECIPIENT = address(0xdEaD);
    address internal constant RELAYER = address(0xbEEF);
    address internal constant STRANGER = address(0x1234);

    struct Fixture {
        uint256 commitment;
        uint256 nullifierHash;
        uint256 root;
        ShieldedPool.Proof proof;
        uint256[5] signals;
    }

    function setUp() public {
        verifier = new Groth16Verifier();
        transferVerifier = new Groth16VerifierTransfer();

        uint256[] memory denoms = new uint256[](3);
        denoms[0] = D_SMALL;
        denoms[1] = D01;
        denoms[2] = D1;

        pool = new ShieldedPool(
            IWithdrawVerifier(address(verifier)),
            ITransferVerifier(address(transferVerifier)),
            denoms,
            DEPTH
        );
        vm.deal(address(this), 1_000 ether);
        vm.deal(STRANGER, 1_000 ether);
    }

    /* ── Fixture loading ──────────────────────────────────────────────────── */

    function loadSingleLeafFixture() internal view returns (Fixture memory f) {
        return loadFixture("../tests/fixtures/withdraw-single-leaf.json");
    }

    function loadRelayerFixture() internal view returns (Fixture memory f) {
        return loadFixture("../tests/fixtures/withdraw-with-relayer.json");
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

    /* ── Tree agreement ───────────────────────────────────────────────────── */

    function test_empty_root_matches_typescript_implementation() public view {
        assertEq(pool.currentRoot(0), TYPE_SCRIPT_EMPTY_ROOT, "empty root drifted from TypeScript");
        assertEq(pool.currentRoot(1), TYPE_SCRIPT_EMPTY_ROOT);
        assertTrue(pool.isKnownRoot(0, TYPE_SCRIPT_EMPTY_ROOT));
    }

    function test_zero_hashes_are_the_poseidon_fixed_point() public view {
        uint256[] memory zeros = pool.zeroHashes();
        assertEq(zeros.length, DEPTH + 1);
        assertEq(zeros[0], 0);
        for (uint256 i = 0; i < DEPTH; i++) {
            assertEq(zeros[i + 1], MerkleTreeWithHistory.hashPair(zeros[i], zeros[i]));
        }
    }

    /* ── Deposit ──────────────────────────────────────────────────────────── */

    function test_deposit_inserts_commitment_and_tracks_balance() public {
        Fixture memory f = loadSingleLeafFixture();

        uint32 index = pool.deposit{value: D1}(D1_INDEX, f.commitment);

        assertEq(index, 0);
        assertEq(pool.leafCount(D1_INDEX), 1);
        assertEq(pool.pooledBalance(D1_INDEX), D1);
        assertEq(pool.currentRoot(D1_INDEX), f.root, "pool root disagrees with the circuit's root");
        assertTrue(pool.isKnownRoot(D1_INDEX, f.root));
    }

    function test_deposit_rejects_wrong_amount() public {
        Fixture memory f = loadSingleLeafFixture();
        vm.expectRevert(
            abi.encodeWithSelector(ShieldedPool.WrongDepositAmount.selector, D1, D01)
        );
        pool.deposit{value: D01}(D1_INDEX, f.commitment);
    }

    function test_deposit_rejects_unknown_denomination() public {
        vm.expectRevert(ShieldedPool.UnknownDenomination.selector);
        pool.deposit{value: D1}(7, 12345);
    }

    /// A plain transfer would silently break the solvency invariant.
    function test_direct_transfer_is_rejected() public {
        (bool ok, ) = address(pool).call{value: 1 ether}("");
        assertFalse(ok, "pool accepted a bare transfer");
    }

    /* ── Withdrawal: the real proof accepted ──────────────────────────────── */

    function test_withdraw_accepts_a_real_proof() public {
        Fixture memory f = loadSingleLeafFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        uint256 before = RECIPIENT.balance;
        pool.withdraw(f.proof, D1_INDEX, f.root, f.nullifierHash, payable(RECIPIENT), payable(address(0)), 0);

        assertEq(RECIPIENT.balance - before, D1, "recipient did not receive the denomination");
        assertTrue(pool.nullifierSpent(f.nullifierHash), "nullifier was not recorded");
        assertEq(pool.pooledBalance(D1_INDEX), 0, "pool balance not decremented");
        assertEq(address(pool).balance, 0, "pool holds more than it owes");
    }

    function test_withdraw_splits_fee_to_relayer() public {
        Fixture memory f = loadRelayerFixture();
        uint256 fee = vm.parseUint("10000000000000000"); // 0.01 HYPE, as in the fixture
        assertEq(f.signals[3], uint256(uint160(RELAYER)));
        assertEq(f.signals[4], fee);

        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        uint256 recipientBefore = RECIPIENT.balance;
        uint256 relayerBefore = RELAYER.balance;

        pool.withdraw(f.proof, D1_INDEX, f.root, f.nullifierHash, payable(RECIPIENT), payable(RELAYER), fee);

        assertEq(RECIPIENT.balance - recipientBefore, D1 - fee);
        assertEq(RELAYER.balance - relayerBefore, fee);
    }

    /* ── Withdrawal: everything that must be rejected ─────────────────────── */

    function test_withdraw_rejects_a_replayed_nullifier() public {
        Fixture memory f = loadSingleLeafFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);
        pool.withdraw(f.proof, D1_INDEX, f.root, f.nullifierHash, payable(RECIPIENT), payable(address(0)), 0);

        vm.expectRevert(ShieldedPool.NoteAlreadySpent.selector);
        pool.withdraw(f.proof, D1_INDEX, f.root, f.nullifierHash, payable(RECIPIENT), payable(address(0)), 0);
    }

    /// The proof commits to the recipient, so a front-runner cannot redirect it.
    function test_withdraw_rejects_a_redirected_recipient() public {
        Fixture memory f = loadSingleLeafFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.withdraw(f.proof, D1_INDEX, f.root, f.nullifierHash, payable(STRANGER), payable(address(0)), 0);
    }

    /// Same for the fee: raising the fee after the fact must not verify.
    function test_withdraw_rejects_a_tampered_fee() public {
        Fixture memory f = loadSingleLeafFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.withdraw(f.proof, D1_INDEX, f.root, f.nullifierHash, payable(RECIPIENT), payable(RELAYER), 1);
    }

    function test_withdraw_rejects_swapped_proof_points() public {
        Fixture memory f = loadSingleLeafFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        ShieldedPool.Proof memory bad = f.proof;
        (bad.pA[0], bad.pA[1]) = (bad.pA[1], bad.pA[0]);

        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.withdraw(bad, D1_INDEX, f.root, f.nullifierHash, payable(RECIPIENT), payable(address(0)), 0);
    }

    function test_withdraw_rejects_a_wrong_nullifier_hash() public {
        Fixture memory f = loadSingleLeafFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.withdraw(f.proof, D1_INDEX, f.root, f.nullifierHash + 1, payable(RECIPIENT), payable(address(0)), 0);
    }

    function test_withdraw_rejects_an_unknown_root() public {
        Fixture memory f = loadSingleLeafFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.expectRevert(ShieldedPool.UnknownRoot.selector);
        pool.withdraw(f.proof, D1_INDEX, f.root + 1, f.nullifierHash, payable(RECIPIENT), payable(address(0)), 0);
    }

    function test_withdraw_before_any_deposit_reverts() public {
        Fixture memory f = loadSingleLeafFixture();
        // The fixture root is not the empty root, so the pool has never
        // accepted this deposit and must not pay out.
        vm.expectRevert(ShieldedPool.UnknownRoot.selector);
        pool.withdraw(f.proof, D1_INDEX, f.root, f.nullifierHash, payable(RECIPIENT), payable(address(0)), 0);
    }

    function test_withdraw_rejects_fee_above_denomination() public {
        Fixture memory f = loadSingleLeafFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.expectRevert(ShieldedPool.FeeExceedsDenomination.selector);
        pool.withdraw(f.proof, D1_INDEX, f.root, f.nullifierHash, payable(RECIPIENT), payable(RELAYER), D1 + 1);
    }

    function test_withdraw_requires_a_relayer_when_a_fee_is_charged() public {
        Fixture memory f = loadSingleLeafFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.expectRevert(ShieldedPool.RelayerRequiredForFee.selector);
        pool.withdraw(f.proof, D1_INDEX, f.root, f.nullifierHash, payable(RECIPIENT), payable(address(0)), 1);
    }

    /// The commitment was deposited into the 1 HYPE tree. Its root is unknown in
    /// the 10 HYPE tree, so it cannot be redeemed at the higher value.
    function test_a_root_from_one_tree_is_unknown_in_another() public {
        Fixture memory f = loadSingleLeafFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        // A different denomination keeps its own tree, so a root the 1 HYPE
        // tree produced must not be spendable against the 0.1 HYPE tree.
        vm.expectRevert(ShieldedPool.UnknownRoot.selector);
        pool.withdraw(f.proof, 1, f.root, f.nullifierHash, payable(RECIPIENT), payable(address(0)), 0);
    }

    /* ── Deeper tree ──────────────────────────────────────────────────────── */

    function test_withdraw_from_a_four_leaf_tree() public {
        string memory json = vm.readFile("../tests/fixtures/withdraw-four-leaves.json");

        uint256[4] memory commitments = [
            vm.parseUint(vm.parseJsonString(json, ".commitment0")),
            vm.parseUint(vm.parseJsonString(json, ".commitment1")),
            vm.parseUint(vm.parseJsonString(json, ".commitment2")),
            vm.parseUint(vm.parseJsonString(json, ".commitment3"))
        ];

        for (uint256 i = 0; i < 4; i++) {
            pool.deposit{value: D1}(D1_INDEX, commitments[i]);
        }

        uint256 root = vm.parseUint(vm.parseJsonString(json, ".root"));
        assertEq(pool.currentRoot(D1_INDEX), root, "four-leaf root mismatch");
        assertEq(pool.leafCount(D1_INDEX), 4);

        ShieldedPool.Proof memory proof;
        proof.pA[0] = vm.parseUint(vm.parseJsonString(json, ".sol_pA0"));
        proof.pA[1] = vm.parseUint(vm.parseJsonString(json, ".sol_pA1"));
        proof.pB[0][0] = vm.parseUint(vm.parseJsonString(json, ".sol_pB00"));
        proof.pB[0][1] = vm.parseUint(vm.parseJsonString(json, ".sol_pB01"));
        proof.pB[1][0] = vm.parseUint(vm.parseJsonString(json, ".sol_pB10"));
        proof.pB[1][1] = vm.parseUint(vm.parseJsonString(json, ".sol_pB11"));
        proof.pC[0] = vm.parseUint(vm.parseJsonString(json, ".sol_pC0"));
        proof.pC[1] = vm.parseUint(vm.parseJsonString(json, ".sol_pC1"));

        uint256 nullifierHash = vm.parseUint(vm.parseJsonString(json, ".nullifierHash"));
        uint256 recipient = vm.parseUint(vm.parseJsonString(json, ".recipient"));

        uint256 before = address(uint160(recipient)).balance;
        pool.withdraw(proof, D1_INDEX, root, nullifierHash, payable(address(uint160(recipient))), payable(address(0)), 0);
        assertEq(address(uint160(recipient)).balance - before, D1);
    }

    /* ── Pause ────────────────────────────────────────────────────────────── */

    function test_pause_blocks_deposits_and_withdrawals() public {
        Fixture memory f = loadSingleLeafFixture();

        pool.pause();

        vm.expectRevert(ShieldedPool.PoolPaused.selector);
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.expectRevert(ShieldedPool.PoolPaused.selector);
        pool.withdraw(f.proof, D1_INDEX, f.root, f.nullifierHash, payable(RECIPIENT), payable(address(0)), 0);

        pool.unpause();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);
        assertEq(pool.leafCount(D1_INDEX), 1);
    }

    /// Pause is the only owner power. It must never be able to move pool funds.
    function test_owner_cannot_move_pool_funds() public {
        Fixture memory f = loadSingleLeafFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        uint256 ownerBefore = address(this).balance;
        pool.pause();
        pool.unpause();
        pool.transferOwnership(STRANGER);

        assertEq(address(this).balance, ownerBefore, "owner balance changed");
        assertEq(address(pool).balance, D1, "pool balance changed");
    }

    function test_only_owner_can_pause() public {
        vm.prank(STRANGER);
        vm.expectRevert(ShieldedPool.NotOwner.selector);
        pool.pause();
    }

    /* ── Solvency invariant ───────────────────────────────────────────────── */

    function test_pool_never_owes_more_than_it_holds() public {
        Fixture memory f = loadSingleLeafFixture();

        pool.deposit{value: D_SMALL}(SMALL_INDEX, 111);
        pool.deposit{value: D01}(1, 222);
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        assertEq(pool.totalPooledBalance(), D_SMALL + D01 + D1);
        assertEq(address(pool).balance, D_SMALL + D01 + D1);

        pool.withdraw(f.proof, D1_INDEX, f.root, f.nullifierHash, payable(RECIPIENT), payable(address(0)), 0);

        assertEq(pool.totalPooledBalance(), D_SMALL + D01);
        assertGe(address(pool).balance, pool.totalPooledBalance(), "pool is insolvent");
    }
}
