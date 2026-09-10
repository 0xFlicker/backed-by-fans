// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

import {ISafeL2} from "../../script/CreateSafe.s.sol";
import {DeployForkProtocol} from "../../script/DeployForkProtocol.s.sol";
import {MembershipTier} from "../../src/MembershipTier.sol";
import {MembershipTierDeployer} from "../../src/MembershipTierDeployer.sol";
import {ProtocolBuybackVault} from "../../src/ProtocolBuybackVault.sol";
import {MembershipTypes} from "../../src/types/MembershipTypes.sol";
import {MembershipTestConfig} from "../helpers/MembershipTestConfig.sol";
import {PonsForkFixture} from "./helpers/PonsForkFixture.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ProtocolForkDeploymentTest is PonsForkFixture {
    function test_scriptCreatesFreshPonsTokenAndCanonicalSafeOwnedMembershipGraph() public {
        vm.setEnv("BBF_FORK_DEVELOPER_KEY", "20817");
        vm.setEnv("BBF_FORK_SAFE_KEY_A", "40961");
        vm.setEnv("BBF_FORK_SAFE_KEY_B", "40962");
        vm.setEnv("BBF_FORK_SAFE_KEY_C", "40963");
        vm.setEnv("BBF_FORK_RUN_ID", "test-fresh-safe-owned-protocol");
        vm.setEnv("BBF_FORK_INITIAL_BUY_WEI", "10000000000000000");
        address purchaser = vm.addr(20_817);
        vm.deal(purchaser, 20 ether);
        DeployForkProtocol deployment = _script();
        DeployForkProtocol.Deployment memory graph = deployment.run();
        string memory outputPath = string.concat(
            vm.projectRoot(),
            "/deployments/protocol-fork/test-fresh-safe-owned-protocol/bootstrap.json"
        );
        string memory output = vm.readFile(outputPath);
        assertEq(vm.parseJsonAddress(output, ".factory"), address(graph.factory));
        assertEq(vm.parseJsonAddress(output, ".buybackVault"), graph.factory.buybackVault());
        assertEq(vm.parseJsonAddress(output, ".safe"), graph.safe);
        MembershipTypes.TierCodeConfig memory tierCode = deployment.tierCodeConfiguration();
        MembershipTierDeployer tierDeployer = MembershipTierDeployer(graph.factory.deployer());
        assertEq(vm.parseJsonAddress(output, ".tierCodeStoreA"), tierCode.storeA);
        assertEq(vm.parseJsonAddress(output, ".tierCodeStoreB"), tierCode.storeB);
        assertEq(vm.parseJsonAddress(output, ".tierDeployer"), address(tierDeployer));
        assertEq(tierDeployer.factory(), address(graph.factory));
        assertEq(tierDeployer.tierCreationCodeHash(), keccak256(type(MembershipTier).creationCode));
        assertEq(tierDeployer.creationCodeStoreAHash(), tierCode.storeA.codehash);
        assertEq(tierDeployer.creationCodeStoreBHash(), tierCode.storeB.codehash);
        assertEq(
            vm.parseJsonString(output, ".developerTokensPurchased"),
            vm.toString(graph.developerTokensPurchased)
        );
        vm.removeFile(outputPath);
        assertEq(graph.developer, purchaser);
        assertEq(graph.factory.owner(), graph.safe);
        assertEq(graph.factory.pendingOwner(), address(0));
        assertEq(ISafeL2(graph.safe).getOwners().length, 3);
        assertEq(ISafeL2(graph.safe).getThreshold(), 2);
        ProtocolBuybackVault vault = ProtocolBuybackVault(payable(graph.factory.buybackVault()));
        assertEq(vault.factory(), address(graph.factory));
        assertEq(vault.protocolToken(), graph.protocolToken);
        assertEq(IERC20(graph.protocolToken).balanceOf(purchaser), graph.developerTokensPurchased);
        assertEq(graph.developerETHSpent, 0.01 ether);
        assertEq(graph.factory.paymentTokenCount(), 1);
        address asset = graph.factory.paymentTokens(0, 1)[0];
        vm.prank(purchaser);
        vm.expectRevert();
        graph.factory.setPaymentTokenEnabled(graph.protocolToken, true);
        MembershipTypes.TierConfig memory config =
            MembershipTestConfig.defaultConfig(purchaser, address(graph.renderer), asset);
        config.minimumPayment = graph.factory.minimumPayment(asset);
        vm.prank(purchaser);
        address tierAddress = graph.factory.createTier(config);
        MembershipTier tier = MembershipTier(tierAddress);
        assertEq(tier.owner(), purchaser);
        assertEq(tier.buybackVault(), address(vault));
        assertEq(address(tier.paymentToken()), asset);
        assertEq(tier.protocolFeeBps(), 100);
    }

    function test_scriptRefusesPublicOriginBeforeAnyTransaction() public {
        vm.chainId(4663);
        DeployForkProtocol deployment = _script();
        vm.expectRevert(DeployForkProtocol.LocalForkOnly.selector);
        deployment.run();
    }

    function _script() private returns (DeployForkProtocol deployment) {
        // Foundry scripts run offchain and embed several deployment artifacts.
        // Load only this local script harness; no authentic dependency is patched.
        address scriptHarness = makeAddr("local-offchain-deployment-script");
        vm.etch(scriptHarness, vm.getDeployedCode("DeployForkProtocol.s.sol:DeployForkProtocol"));
        vm.allowCheatcodes(scriptHarness);
        deployment = DeployForkProtocol(scriptHarness);
    }
}
