// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "./Migrator.sol";

contract MigratorTest is Migrator {
    constructor(address _factory, address _WETH) public Migrator(_factory, _WETH) {}

    function redeemLpToken(IUniswapV2Pair pair) public {
        uint256 amount = pair.balanceOf(msg.sender);
        pair.transferFrom(msg.sender, address(this), amount);
        _redeemLpToken(pair, amount);
    }

    function deposit(Kashi kashi, address asset) public {
        _deposit(kashi.bentoBox(), address(kashi), asset);
    }

    function depositAndAddAsset(Kashi kashi, address asset) public {
        (, , uint256 share) = _deposit(kashi.bentoBox(), address(kashi), asset);
        kashi.addAsset(msg.sender, true, share);
    }

    function cookWithData(
        Kashi kashi,
        uint8[] calldata actions,
        uint256[] calldata values,
        bytes[] calldata datas
    ) public payable {
        kashi.cook{ value: address(this).balance }(actions, values, datas);
    }

    function getAmountToDeposit(Kashi kashi, address asset)
        public
        view
        returns (
            uint256 value,
            uint256 amount,
            uint256 share
        )
    {
        return _getAmountToDeposit(kashi.bentoBox(), asset);
    }
}
