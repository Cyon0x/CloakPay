// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";
import {Groth16VerifierTransfer} from "../src/Groth16VerifierTransfer.sol";
import {IWithdrawVerifier} from "../src/interfaces/IWithdrawVerifier.sol";
import {ITransferVerifier} from "../src/interfaces/ITransferVerifier.sol";

/// @notice Tests the shielded transfer path against real Groth16 proofs.
///
/// The proofs in tests/fixtures come from the compiled `transfer` and `withdraw`
/// circuits (`npm run zk:prove-fixtures`) and are checked here by the contracts
/// snarkjs generated for them. Nothing is mocked: a broken circuit, a mismatched
/// verifier or a wrong public-signal order fails these tests.
contract ShieldedTransferTest is Test {
    ShieldedPool internal pool;
    Groth16Verifier internal withdrawVerifier;
    Groth16VerifierTransfer internal transferVerifier;

    uint32 internal constant DEPTH = 20;
    uint256 internal constant D_SMALL = 0.01 ether;
    uint256 internal constant D01 = 0.1 ether;
    uint256 internal constant D1 = 1 ether;
    /// Index of `D1` in the deployed set: [0.01, 0.1, 1].
    uint256 internal constant D1_INDEX = 2;
    /// Index of `D01`, used as "some other denomination's tree".
    uint256 internal constant D01_INDEX = 1;

    address internal constant RECIPIENT = address(0xdEaD);
    address internal constant STRANGER = address(0x1234);

    struct Fixture {
        uint256 commitment;
        uint256 nullifierHash;
        uint256 root;
        uint256 newCommitment;
        ShieldedPool.Proof proof;
        uint256[3] signals;
    }

    function setUp() public {
        withdrawVerifier = new Groth16Verifier();
        transferVerifier = new Groth16VerifierTransfer();

        uint256[] memory denoms = new uint256[](3);
        denoms[0] = D_SMALL;
        denoms[1] = D01;
        denoms[2] = D1;

        pool = new ShieldedPool(
            IWithdrawVerifier(address(withdrawVerifier)),
            ITransferVerifier(address(transferVerifier)),
            denoms,
            DEPTH
        );
        vm.deal(address(this), 1_000 ether);
        vm.deal(STRANGER, 1_000 ether);
    }

    function loadTransferFixture() internal view returns (Fixture memory f) {
        string memory json = vm.readFile("../tests/fixtures/transfer-single-leaf.json");
        f.commitment = vm.parseUint(vm.parseJsonString(json, ".commitment"));
        f.nullifierHash = vm.parseUint(vm.parseJsonString(json, ".nullifierHash"));
        f.root = vm.parseUint(vm.parseJsonString(json, ".root"));
        f.newCommitment = vm.parseUint(vm.parseJsonString(json, ".newCommitment"));
        f.proof = readProof(json, ".sol_");
        f.signals[0] = vm.parseUint(vm.parseJsonString(json, ".sig0"));
        f.signals[1] = vm.parseUint(vm.parseJsonString(json, ".sig1"));
        f.signals[2] = vm.parseUint(vm.parseJsonString(json, ".sig2"));
    }

    /// Reads the eight proof coordinates from `<prefix>pA0` style keys.
    function readProof(string memory json, string memory prefix) internal view returns (ShieldedPool.Proof memory proof) {
        proof.pA[0] = vm.parseUint(vm.parseJsonString(json, string.concat(prefix, "pA0")));
        proof.pA[1] = vm.parseUint(vm.parseJsonString(json, string.concat(prefix, "pA1")));
        proof.pB[0][0] = vm.parseUint(vm.parseJsonString(json, string.concat(prefix, "pB00")));
        proof.pB[0][1] = vm.parseUint(vm.parseJsonString(json, string.concat(prefix, "pB01")));
        proof.pB[1][0] = vm.parseUint(vm.parseJsonString(json, string.concat(prefix, "pB10")));
        proof.pB[1][1] = vm.parseUint(vm.parseJsonString(json, string.concat(prefix, "pB11")));
        proof.pC[0] = vm.parseUint(vm.parseJsonString(json, string.concat(prefix, "pC0")));
        proof.pC[1] = vm.parseUint(vm.parseJsonString(json, string.concat(prefix, "pC1")));
    }

    /* ── The swap itself ──────────────────────────────────────────────────── */

    function test_transfer_spends_a_note_and_mints_another() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);
        uint256 pooledBefore = pool.pooledBalance(D1_INDEX);

        uint32 leafIndex = pool.privateTransfer(
            f.proof, D1_INDEX, f.root, f.nullifierHash, f.newCommitment
        );

        assertEq(leafIndex, 1, "the new note should be the second leaf");
        assertEq(pool.leafCount(D1_INDEX), 2, "the tree did not grow");
        assertTrue(pool.nullifierSpent(f.nullifierHash), "the nullifier was not recorded");
        // A transfer swaps one note for another of equal value, so the backing
        // must be untouched: no money entered or left the pool.
        assertEq(pool.pooledBalance(D1_INDEX), pooledBefore, "a transfer must not move money");
        assertEq(address(pool).balance, D1, "the pool's ether changed");
    }

    function test_transfer_does_not_reveal_an_address() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        // The event carries a commitment and a nullifier, never an address.
        vm.recordLogs();
        pool.privateTransfer(f.proof, D1_INDEX, f.root, f.nullifierHash, f.newCommitment);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bool sawTransfer;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == keccak256("PrivateTransfer(uint256,uint256,uint256,uint32,address)")) {
                sawTransfer = true;
                // topic0 + 4 indexed-free slots; the only address is the submitter.
                assertEq(logs[i].data.length, 128, "unexpected event shape");
            }
        }
        assertTrue(sawTransfer, "PrivateTransfer was not emitted");
    }

    function test_transfer_records_the_new_commitment_in_the_tree() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        uint256 rootBefore = pool.currentRoot(D1_INDEX);
        pool.privateTransfer(f.proof, D1_INDEX, f.root, f.nullifierHash, f.newCommitment);
        uint256 rootAfter = pool.currentRoot(D1_INDEX);

        assertTrue(rootAfter != rootBefore, "minting a note must change the root");
        assertTrue(pool.isKnownRoot(D1_INDEX, rootAfter), "the new root is not known");
        // The previous root stays known, which is what lets a proof built
        // against it still settle.
        assertTrue(pool.isKnownRoot(D1_INDEX, rootBefore), "the previous root was dropped");
    }

    /// Anyone may submit, which is what lets a relayer pay the gas without the
    /// sender's address appearing in the transaction.
    function test_a_stranger_can_submit_a_transfer_they_did_not_author() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.prank(STRANGER);
        pool.privateTransfer(f.proof, D1_INDEX, f.root, f.nullifierHash, f.newCommitment);

        assertTrue(pool.nullifierSpent(f.nullifierHash), "the relayed transfer did not settle");
        assertEq(pool.leafCount(D1_INDEX), 2, "the new note was not minted");
    }

    /// Because the proof binds the output commitment, a submitter cannot mint a
    /// note for themselves instead of the one the sender asked for.
    function test_a_submitter_cannot_redirect_the_note_they_relay() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.prank(STRANGER);
        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.privateTransfer(f.proof, D1_INDEX, f.root, f.nullifierHash, f.newCommitment + 1);

        // The redirect failed without burning the nullifier or the tree slot.
        assertFalse(pool.nullifierSpent(f.nullifierHash), "a rejected transfer spent the note");
        assertEq(pool.leafCount(D1_INDEX), 1, "a rejected transfer grew the tree");

        // The honest version still settles afterwards.
        vm.prank(STRANGER);
        pool.privateTransfer(f.proof, D1_INDEX, f.root, f.nullifierHash, f.newCommitment);
        assertTrue(pool.nullifierSpent(f.nullifierHash));
    }

    /* ── Rejections ───────────────────────────────────────────────────────── */

    function test_transfer_refuses_a_reused_nullifier() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);
        pool.privateTransfer(f.proof, D1_INDEX, f.root, f.nullifierHash, f.newCommitment);

        vm.expectRevert(ShieldedPool.NoteAlreadySpent.selector);
        pool.privateTransfer(f.proof, D1_INDEX, f.root, f.nullifierHash, f.newCommitment);
    }

    function test_transfer_rejects_a_substituted_output_commitment() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.privateTransfer(f.proof, D1_INDEX, f.root, f.nullifierHash, f.newCommitment + 1);
    }

    function test_transfer_rejects_a_zero_commitment() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.expectRevert(ShieldedPool.InvalidCommitment.selector);
        pool.privateTransfer(f.proof, D1_INDEX, f.root, f.nullifierHash, 0);
    }

    function test_transfer_rejects_a_root_from_another_tree() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.expectRevert(ShieldedPool.UnknownRoot.selector);
        pool.privateTransfer(f.proof, D01_INDEX, f.root, f.nullifierHash, f.newCommitment);
    }

    function test_transfer_rejects_a_stale_root() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.expectRevert(ShieldedPool.UnknownRoot.selector);
        pool.privateTransfer(f.proof, D1_INDEX, f.root + 1, f.nullifierHash, f.newCommitment);
    }

    function test_transfer_rejects_an_unknown_denomination() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        vm.expectRevert(ShieldedPool.UnknownDenomination.selector);
        pool.privateTransfer(f.proof, 9, f.root, f.nullifierHash, f.newCommitment);
    }

    function test_transfer_rejects_a_swapped_nullifier() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);

        // A proof bound to one nullifier must not authorise another.
        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.privateTransfer(f.proof, D1_INDEX, f.root, f.nullifierHash + 1, f.newCommitment);
    }

    function test_transfer_is_blocked_while_paused() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);
        pool.pause();

        vm.expectRevert(ShieldedPool.PoolPaused.selector);
        pool.privateTransfer(f.proof, D1_INDEX, f.root, f.nullifierHash, f.newCommitment);
    }

    /* ── The full round trip ──────────────────────────────────────────────── */

    /// The point of the transfer path: the note it mints must be spendable,
    /// not merely well-formed.
    function test_a_transferred_note_can_be_withdrawn() public {
        string memory json = vm.readFile("../tests/fixtures/transfer-then-withdraw.json");

        uint256 commitment = vm.parseUint(vm.parseJsonString(json, ".commitment"));
        uint256 root = vm.parseUint(vm.parseJsonString(json, ".root"));
        uint256 newCommitment = vm.parseUint(vm.parseJsonString(json, ".newCommitment"));
        uint256 rootAfter = vm.parseUint(vm.parseJsonString(json, ".rootAfterTransfer"));
        uint256 createdNullifier = vm.parseUint(vm.parseJsonString(json, ".createdNullifierHash"));
        uint256 spentNullifier = vm.parseUint(vm.parseJsonString(json, ".transfer.sig1"));

        ShieldedPool.Proof memory transferProof = readProof(json, ".transfer.sol_");
        ShieldedPool.Proof memory withdrawProof = readProof(json, ".withdraw.sol_");

        // 1. The sender's note enters the pool.
        pool.deposit{value: D1}(D1_INDEX, commitment);
        assertEq(pool.currentRoot(D1_INDEX), root, "deposit root disagrees with the fixture");

        // 2. It is swapped for a new note addressed to nobody in particular.
        pool.privateTransfer(transferProof, D1_INDEX, root, spentNullifier, newCommitment);
        assertEq(pool.currentRoot(D1_INDEX), rootAfter, "transfer root disagrees with the fixture");
        assertEq(pool.pooledBalance(D1_INDEX), D1, "the transfer changed the pool's backing");

        // 3. The note the transfer created is withdrawn by a recipient who
        //    appears nowhere in the transfer itself.
        uint256 before = RECIPIENT.balance;
        pool.withdraw(
            withdrawProof, D1_INDEX, rootAfter, createdNullifier, payable(RECIPIENT), payable(address(0)), 0
        );

        assertEq(RECIPIENT.balance - before, D1, "the recipient did not receive the denomination");
        assertEq(pool.pooledBalance(D1_INDEX), 0, "the pool still owes a denomination");
        assertTrue(pool.nullifierSpent(spentNullifier), "the spent note was not recorded");
        assertTrue(pool.nullifierSpent(createdNullifier), "the created note was not recorded");
    }

    /// One shared nullifier set, so a note cannot be spent on both paths.
    function test_a_note_cannot_be_spent_as_both_a_transfer_and_a_withdrawal() public {
        Fixture memory f = loadTransferFixture();
        pool.deposit{value: D1}(D1_INDEX, f.commitment);
        pool.privateTransfer(f.proof, D1_INDEX, f.root, f.nullifierHash, f.newCommitment);

        vm.expectRevert(ShieldedPool.NoteAlreadySpent.selector);
        pool.withdraw(
            f.proof, D1_INDEX, f.root, f.nullifierHash, payable(RECIPIENT), payable(address(0)), 0
        );
    }
}
