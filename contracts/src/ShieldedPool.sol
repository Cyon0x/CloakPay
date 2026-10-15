// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleTreeWithHistory} from "./MerkleTreeWithHistory.sol";
import {IWithdrawVerifier} from "./interfaces/IWithdrawVerifier.sol";
import {ITransferVerifier} from "./interfaces/ITransferVerifier.sol";

/// @title ShieldedPool
/// @notice A fixed-denomination shielded pool for the chain's native token.
///
/// Deposit is public: an observer sees that an address put exactly one
/// denomination into the pool, and the commitment that was inserted.
/// Withdrawal is private: a Groth16 proof shows that the withdrawer knows the
/// secrets behind some commitment already in the tree, without revealing which
/// one. The deposit and the withdrawal cannot be linked by an observer.
///
/// A shielded transfer spends one note and mints another of the same
/// denomination, so the money never leaves the pool and no address is involved
/// on either side. That is what lets a payment be addressed to a CloakPay
/// username without the recipient's wallet address reaching the chain.
///
/// What this contract deliberately does NOT do:
///   * it never stores an amount alongside a commitment, so no per-note value
///     is publicly attributable;
///   * it has no privileged path that can move pool funds to an operator
///     address. The owner can only pause and unpause.
contract ShieldedPool is ReentrancyGuard {
    using MerkleTreeWithHistory for MerkleTreeWithHistory.Tree;

    struct Proof {
        uint256[2] pA;
        uint256[2][2] pB;
        uint256[2] pC;
    }

    /// @notice Verifier generated from `circuits/withdraw.circom`.
    IWithdrawVerifier public immutable verifier;

    /// @notice Verifier generated from `circuits/transfer.circom`.
    ITransferVerifier public immutable transferVerifier;

    /// @notice Tree height. Fixed at 20 -> 1,048,576 commitments per denomination.
    uint32 public immutable levels;

    /// @notice Contract owner. The only privilege is pausing.
    address public owner;

    /// @notice When true, deposits and withdrawals are both halted.
    ///         No function exists that can move pool funds while paused.
    bool public paused;

    /// @notice Fixed denominations in wei. Index is the denomination id.
    uint256[] public denominations;

    /// @notice denomination index => tree
    mapping(uint256 => MerkleTreeWithHistory.Tree) private trees;

    /// @notice denomination index => total wei deposited minus withdrawn
    mapping(uint256 => uint256) public pooledBalance;

    /// @notice nullifier hash => spent. This is the double-spend guard.
    mapping(uint256 => bool) public nullifierSpent;

    /// @notice Default subtree hashes, indexed by height.
    uint256[] private zeros;

    event Deposit(
        uint256 indexed denominationIndex,
        uint256 denomination,
        uint256 commitment,
        uint32 leafIndex
    );
    event Withdrawal(
        uint256 indexed denominationIndex,
        uint256 nullifierHash,
        address recipient,
        address relayer,
        uint256 fee
    );
    /// @notice A note was spent and another minted. No address is published.
    event PrivateTransfer(
        uint256 indexed denominationIndex,
        uint256 nullifierHash,
        uint256 newCommitment,
        uint32 leafIndex,
        address submitter
    );
    event Paused(address account);
    event Unpaused(address account);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error PoolPaused();
    error UnknownDenomination();
    error WrongDepositAmount(uint256 expected, uint256 received);
    error UnknownRoot();
    error NoteAlreadySpent();
    error InvalidProof();
    error FeeExceedsDenomination();
    error RelayerRequiredForFee();
    error TransferFailed();
    error NotOwner();
    error ZeroAddress();
    error InvalidCommitment();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PoolPaused();
        _;
    }

    /// @param verifier_     Verifier contract for the withdraw circuit.
    /// @param transferVerifier_ Verifier contract for the transfer circuit.
    /// @param denominations_ Fixed denominations in wei, ascending, non-zero.
    /// @param levels_       Tree height. Must match the compiled circuit.
    constructor(
        IWithdrawVerifier verifier_,
        ITransferVerifier transferVerifier_,
        uint256[] memory denominations_,
        uint32 levels_
    ) {
        require(address(verifier_) != address(0), "ShieldedPool: verifier is the zero address");
        require(
            address(transferVerifier_) != address(0),
            "ShieldedPool: transfer verifier is the zero address"
        );
        require(denominations_.length > 0, "ShieldedPool: no denominations");
        require(levels_ > 0 && levels_ <= 32, "ShieldedPool: unsupported tree height");

        verifier = verifier_;
        transferVerifier = transferVerifier_;
        levels = levels_;
        owner = msg.sender;

        zeros = MerkleTreeWithHistory.defaultHashes(levels_);

        for (uint256 i = 0; i < denominations_.length; i++) {
            uint256 value = denominations_[i];
            require(value > 0, "ShieldedPool: zero denomination");
            if (i > 0) {
                require(value > denominations_[i - 1], "ShieldedPool: denominations must ascend");
            }
            denominations.push(value);
            trees[i].init(levels_, zeros);
        }
    }

    /* ── Deposit ──────────────────────────────────────────────────────────── */

    /// @notice Deposits exactly one denomination and inserts a commitment.
    /// @param denominationIndex Index into `denominations`.
    /// @param commitment        Poseidon(nullifier, secret) computed by the client.
    /// @return leafIndex Position of the commitment in that denomination's tree.
    function deposit(
        uint256 denominationIndex,
        uint256 commitment
    ) external payable whenNotPaused returns (uint32 leafIndex) {
        if (denominationIndex >= denominations.length) revert UnknownDenomination();

        uint256 denomination = denominations[denominationIndex];
        if (msg.value != denomination) revert WrongDepositAmount(denomination, msg.value);

        leafIndex = trees[denominationIndex].insert(commitment, levels, zeros);
        pooledBalance[denominationIndex] += msg.value;

        emit Deposit(denominationIndex, denomination, commitment, leafIndex);
    }

    /* ── Withdrawal ───────────────────────────────────────────────────────── */

    /// @notice Spends a note and releases the denomination to `recipient`.
    /// @dev The proof binds root, nullifierHash, recipient, relayer and fee, so
    ///      neither a relayer nor a front-runner can redirect the payout.
    function withdraw(
        Proof calldata proof,
        uint256 denominationIndex,
        uint256 root,
        uint256 nullifierHash,
        address payable recipient,
        address payable relayer,
        uint256 fee
    ) external nonReentrant whenNotPaused {
        if (denominationIndex >= denominations.length) revert UnknownDenomination();

        uint256 denomination = denominations[denominationIndex];
        if (fee > denomination) revert FeeExceedsDenomination();
        if (fee > 0 && relayer == address(0)) revert RelayerRequiredForFee();

        // The root must belong to this denomination's tree, so a note can only
        // ever be redeemed at the value it was deposited at.
        if (!trees[denominationIndex].isKnownRoot(root)) revert UnknownRoot();
        if (nullifierSpent[nullifierHash]) revert NoteAlreadySpent();

        uint256[5] memory publicSignals = [
            root,
            nullifierHash,
            uint256(uint160(address(recipient))),
            uint256(uint160(address(relayer))),
            fee
        ];

        if (!verifier.verifyProof(proof.pA, proof.pB, proof.pC, publicSignals)) {
            revert InvalidProof();
        }

        // Effects before interactions.
        nullifierSpent[nullifierHash] = true;
        pooledBalance[denominationIndex] -= denomination;

        uint256 payout = denomination - fee;
        if (fee > 0) {
            _sendValue(relayer, fee);
        }
        _sendValue(recipient, payout);

        emit Withdrawal(denominationIndex, nullifierHash, recipient, relayer, fee);
    }

    /* ── Shielded transfer ────────────────────────────────────────────────── */

    /// @notice Spends one note and mints another of the same denomination.
    /// @dev The money does not move: `pooledBalance` is untouched, because one
    ///      note of a denomination is exchanged for one note of the same
    ///      denomination. Conservation is structural rather than an arithmetic
    ///      check, which is the point of a fixed-denomination pool.
    ///
    ///      There is no `recipient`, `relayer` or `fee` parameter. The proof
    ///      binds `newCommitment`, so whoever submits this cannot substitute a
    ///      commitment they control; and because the payout is a commitment
    ///      rather than an address, any third party may submit it -- which is
    ///      what lets a relayer pay the gas without being able to redirect the
    ///      note. The sender's address is not part of the transaction unless
    ///      the sender is the one who submits it.
    ///
    /// @param proof            Groth16 proof for `circuits/transfer.circom`.
    /// @param denominationIndex Which denomination's tree to operate on.
    /// @param root             A root that denomination's tree has produced.
    /// @param nullifierHash    Nullifier of the note being spent.
    /// @param newCommitment    Commitment of the note being created.
    /// @return leafIndex       Position of the new commitment in the tree.
    function privateTransfer(
        Proof calldata proof,
        uint256 denominationIndex,
        uint256 root,
        uint256 nullifierHash,
        uint256 newCommitment
    ) external nonReentrant whenNotPaused returns (uint32 leafIndex) {
        if (denominationIndex >= denominations.length) revert UnknownDenomination();
        // Cheap explicit guard; the circuit also constrains this, so a proof
        // that reached here with a zero commitment could not exist.
        if (newCommitment == 0) revert InvalidCommitment();

        // The root must belong to this denomination's tree, so a note can only
        // be spent at the value it was deposited at.
        if (!trees[denominationIndex].isKnownRoot(root)) revert UnknownRoot();
        if (nullifierSpent[nullifierHash]) revert NoteAlreadySpent();

        uint256[3] memory publicSignals = [root, nullifierHash, newCommitment];

        if (!transferVerifier.verifyProof(proof.pA, proof.pB, proof.pC, publicSignals)) {
            revert InvalidProof();
        }

        // Effects before interactions. The nullifier set is shared with
        // `withdraw`, so a note cannot be spent once here and once there.
        nullifierSpent[nullifierHash] = true;
        leafIndex = trees[denominationIndex].insert(newCommitment, levels, zeros);

        emit PrivateTransfer(denominationIndex, nullifierHash, newCommitment, leafIndex, msg.sender);
    }

    /* ── Views ────────────────────────────────────────────────────────────── */

    function denominationCount() external view returns (uint256) {
        return denominations.length;
    }

    function currentRoot(uint256 denominationIndex) external view returns (uint256) {
        return trees[denominationIndex].currentRoot;
    }

    function leafCount(uint256 denominationIndex) external view returns (uint32) {
        return trees[denominationIndex].leafCount;
    }

    function isKnownRoot(uint256 denominationIndex, uint256 root) external view returns (bool) {
        return trees[denominationIndex].isKnownRoot(root);
    }

    /// @notice Convenience for relayers and clients: the default hashes the
    ///         circuit and the TypeScript tree must reproduce.
    function zeroHashes() external view returns (uint256[] memory) {
        return zeros;
    }

    /// @notice Total wei currently held, across all denominations. Used by tests
    ///         and monitoring to assert the solvency invariant.
    function totalPooledBalance() external view returns (uint256 total) {
        for (uint256 i = 0; i < denominations.length; i++) {
            total += pooledBalance[i];
        }
    }

    /* ── Administration ───────────────────────────────────────────────────── */

    /// @notice Halts deposits and withdrawals. Cannot move funds.
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Transfers the pause authority. Not a funds privilege.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /* ── Internals ────────────────────────────────────────────────────────── */

    function _sendValue(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @notice Rejects plain transfers, which would otherwise silently donate
    ///         funds to the pool and break the solvency invariant.
    receive() external payable {
        revert TransferFailed();
    }

    fallback() external payable {
        revert TransferFailed();
    }
}
