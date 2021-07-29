import hre, { waffle, ethers } from "hardhat";
import { expect, use } from "chai";
import { defaultAbiCoder, recoverAddress, toUtf8Bytes } from "ethers/lib/utils";
import { getApproveData, getBentoBoxApproveDigest, getDomainSeparator, signMasterContractApproval } from "./utils";
import { Contract, ContractTransaction } from "ethers";
import {
    ERC20Mock,
    MigratorTest,
    IUniswapV2Pair,
    BentoBoxV1,
    KashiPairMediumRiskV1,
    IUniswapV2Factory,
} from "../typechain";

use(require("chai-bignumber")());
const toWei = ethers.utils.parseEther;
const getEvents = async (contract: Contract, tx: ContractTransaction) => {
    const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
    return receipt.logs.reduce((parsedEvents, log) => {
        try {
            parsedEvents.push(contract.interface.parseLog(log));
        } catch (e) {}
        return parsedEvents;
    }, []);
};

describe("setMasterContractApproval", async function () {
    const [wallet, lp] = waffle.provider.getWallets();

    let token0: ERC20Mock; // Kashi asset
    let token1: ERC20Mock;
    let migrator: MigratorTest;
    let masterContract: KashiPairMediumRiskV1;
    let kashi0: KashiPairMediumRiskV1;
    let kashi1: KashiPairMediumRiskV1;
    let bentoBox: BentoBoxV1;
    let factory: IUniswapV2Factory;
    let pair: IUniswapV2Pair;
    let Token;
    let Migrator;
    let Oracle;
    let BentoBox;
    let Kashi;
    let UniswapV2Factory;
    let chainId;
    before(async function () {
        ({ chainId } = await ethers.provider.getNetwork());
        Migrator = await ethers.getContractFactory("MigratorTest");
        Oracle = await ethers.getContractFactory("PeggedOracleV1");
        BentoBox = await ethers.getContractFactory("BentoBoxV1");
        Kashi = await ethers.getContractFactory("KashiPairMediumRiskV1");
        Token = await ethers.getContractFactory("ERC20Mock");
        UniswapV2Factory = await ethers.getContractFactory("UniswapV2Factory");
    });
    beforeEach(async function () {
        const oracle = await Oracle.deploy();
        const collateral = (await Token.deploy("Colateral", "COL")) as ERC20Mock;
        token0 = (await Token.deploy("Token0", "TKN0")) as ERC20Mock;
        token1 = (await Token.deploy("Token1", "TKN1")) as ERC20Mock;

        factory = await UniswapV2Factory.deploy(ethers.constants.AddressZero);
        const createPairTx = await factory.createPair(token0.address, token1.address);
        const pairAddr = (await getEvents(factory, createPairTx)).find(e => e.name == "PairCreated").args[2];
        pair = (await ethers.getContractAt("UniswapV2Pair", pairAddr)) as IUniswapV2Pair;

        migrator = (await Migrator.deploy(
            factory.address,
            "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH
        )) as MigratorTest;

        bentoBox = (await BentoBox.deploy("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2")) as BentoBoxV1;
        masterContract = (await Kashi.deploy(bentoBox.address)) as KashiPairMediumRiskV1;
        // create kashi clone
        const data = defaultAbiCoder.encode(
            ["address", "address", "address", "bytes"],
            [collateral.address, token0.address, oracle.address, toUtf8Bytes("")],
        );
        const tx = await bentoBox.deploy(masterContract.address, data, true, { value: toWei("10") });
        const cloneAddress = (await getEvents(bentoBox, tx)).find(e => e.name === "LogDeploy").args[2];
        // get cloned kashi
        kashi0 = (await ethers.getContractAt("KashiPairMediumRiskV1", cloneAddress)) as KashiPairMediumRiskV1;
        expect(await bentoBox.masterContractOf(kashi0.address)).to.eq(masterContract.address);
    });

    it("check: DOMAIN_SEPARATOR", async function () {
        expect(await bentoBox.DOMAIN_SEPARATOR()).to.eq(getDomainSeparator("BentoBox V1", bentoBox.address, chainId));
    });
    it("check: setMasterContractApproval", async function () {
        const nonce = 0;
        const approved = true;
        const { v, r, s } = await signMasterContractApproval(
            "BentoBox V1",
            chainId,
            bentoBox.address,
            masterContract.address,
            wallet.address,
            approved,
            wallet,
            nonce,
        );
        const digest = getBentoBoxApproveDigest(
            "BentoBox V1",
            bentoBox.address,
            masterContract.address,
            chainId,
            approved,
            wallet.address,
            nonce,
        );
        expect(recoverAddress(digest, { v, r, s })).to.eq(wallet.address);
        await bentoBox.setMasterContractApproval(wallet.address, masterContract.address, approved, v, r, s);
    });
    it("cookWithData:call setMasterContractApproval", async function () {
        const nonce = 0;
        const approved = true;
        const { v, r, s } = await signMasterContractApproval(
            "BentoBox V1",
            chainId,
            bentoBox.address,
            masterContract.address,
            wallet.address,
            approved,
            wallet,
            nonce,
        );
        const data = getApproveData(wallet.address, masterContract.address, approved, v, r, s);

        await migrator.cookWithData(kashi0.address, [24], [0], [data]);
        expect(await bentoBox.masterContractApproved(masterContract.address, wallet.address)).to.be.true;
    });
});
