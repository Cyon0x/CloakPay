// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";
import {Groth16VerifierTransfer} from "../src/Groth16VerifierTransfer.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {IWithdrawVerifier} from "../src/interfaces/IWithdrawVerifier.sol";
import {ITransferVerifier} from "../src/interfaces/ITransferVerifier.sol";

/// @title Deploy
/// @notice Deploys the withdraw verifier, the transfer verifier and the
///         shielded pool, then prints the addresses as machine-readable lines.
///         `scripts/chain.mjs` parses those lines and records the deployment;
///         nothing here writes to disk, so a dry run cannot leave a
///         half-written configuration behind.
///
/// Usage:
///   DEPLOYER_PRIVATE_KEY=0x... forge script script/Deploy.s.sol \
///     --rpc-url $ELYSIUM_RPC_URL --broadcast
contract Deploy is Script {
    /// Must match `DENOMINATIONS` in src/config/pool.ts. `scripts/chain.mjs`
    /// reads the deployed values back and compares them, so a drift between
    /// this list and the client is caught at deploy time rather than by a user
    /// whose deposit is refused.
    ///
    /// 0.01 HYPE is included deliberately: it is small enough that a real
    /// end-to-end run can be funded from a testnet faucet drip, which is what
    /// makes it possible to test a genuine deposit and withdrawal on chain
    /// instead of only against a fork.
    function denominations() internal pure returns (uint256[] memory denoms) {
        denoms = new uint256[](3);
        denoms[0] = 0.01 ether;
        denoms[1] = 0.1 ether;
        denoms[2] = 1 ether;
    }

    /// Must match `MERKLE_TREE_DEPTH` and the compiled circuits.
    uint32 internal constant DEPTH = 20;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address existingWithdrawVerifier = vm.envOr("WITHDRAW_VERIFIER_ADDRESS", address(0));
        address existingTransferVerifier = vm.envOr("TRANSFER_VERIFIER_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);

        address withdrawVerifier = existingWithdrawVerifier;
        if (withdrawVerifier == address(0)) {
            withdrawVerifier = address(new Groth16Verifier());
        }

        address transferVerifier = existingTransferVerifier;
        if (transferVerifier == address(0)) {
            transferVerifier = address(new Groth16VerifierTransfer());
        }

        ShieldedPool pool = new ShieldedPool(
            IWithdrawVerifier(withdrawVerifier),
            ITransferVerifier(transferVerifier),
            denominations(),
            DEPTH
        );

        vm.stopBroadcast();

        console2.log("CHAIN_ID", block.chainid);
        console2.log("VERIFIER", withdrawVerifier);
        console2.log("TRANSFER_VERIFIER", transferVerifier);
        console2.log("POOL", address(pool));
        console2.log("DEPLOYER", msg.sender);
    }
}
