// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Groth16Verifier} from "../src/Groth16Verifier.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {IWithdrawVerifier} from "../src/interfaces/IWithdrawVerifier.sol";

/// @title Deploy
/// @notice Deploys the withdraw verifier and the shielded pool, then prints the
///         addresses as machine-readable lines. `scripts/chain.mjs` parses those
///         lines and records the deployment; nothing here writes to disk, so a
///         dry run cannot leave a half-written configuration behind.
///
/// Usage:
///   DEPLOYER_PRIVATE_KEY=0x... forge script script/Deploy.s.sol \
///     --rpc-url $ELYSIUM_RPC_URL --broadcast
contract Deploy is Script {
    /// Must match `DENOMINATIONS` in src/config/pool.ts and the supported set
    /// the client offers. Ascending order is enforced by the pool constructor.
    uint256[] internal denoms;

    /// Must match `MERKLE_TREE_DEPTH` and the compiled circuit.
    uint32 internal constant DEPTH = 20;

    function run() external {
        denoms.push(0.1 ether);
        denoms.push(1 ether);
        denoms.push(10 ether);

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address existingVerifier = vm.envOr("VERIFIER_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);

        address verifier = existingVerifier;
        if (verifier == address(0)) {
            verifier = address(new Groth16Verifier());
        }
        ShieldedPool pool = new ShieldedPool(IWithdrawVerifier(verifier), denoms, DEPTH);

        vm.stopBroadcast();

        console2.log("CHAIN_ID", block.chainid);
        console2.log("VERIFIER", verifier);
        console2.log("POOL", address(pool));
        console2.log("DEPLOYER", msg.sender);
    }
}
