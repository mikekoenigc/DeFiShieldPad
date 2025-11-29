import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy, execute, log } = hre.deployments;

  const czama = await deploy("ConfidentialZama", {
    from: deployer,
    log: true,
  });

  const cusdt = await deploy("ConfidentialUSDT", {
    from: deployer,
    log: true,
  });

  const vault = await deploy("ShieldPadVault", {
    from: deployer,
    args: [czama.address, cusdt.address],
    log: true,
  });

  await execute("ConfidentialZama", { from: deployer, log: true }, "setMinter", vault.address);
  await execute("ConfidentialUSDT", { from: deployer, log: true }, "setMinter", vault.address);

  log(`ConfidentialZama: ${czama.address}`);
  log(`ConfidentialUSDT: ${cusdt.address}`);
  log(`ShieldPadVault: ${vault.address}`);
};

export default func;
func.id = "deploy_shieldpad_vault";
func.tags = ["ShieldPadVault"];
