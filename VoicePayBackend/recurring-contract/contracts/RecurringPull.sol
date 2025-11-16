// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RecurringPull is Ownable {
    address public executor;

    event ExecutorSet(address indexed executor);
    event PaymentPulled(
        address indexed from,
        address indexed to,
        uint256 amount,
        bytes32 indexed scheduleId,
        address token,
        uint256 timestamp
    );

    constructor(address _executor) Ownable(msg.sender) {
        executor = _executor;
        emit ExecutorSet(_executor);
    }

    modifier onlyExecutor() {
        require(msg.sender == executor, "Only executor");
        _;
    }

    function setExecutor(address _executor) external onlyOwner {
        executor = _executor;
        emit ExecutorSet(_executor);
    }

    function pullPayment(
        address token,
        address from,
        address to,
        uint256 amount,
        bytes32 scheduleId
    ) external onlyExecutor returns (bool) {
        require(amount > 0, "amount=0");

        bool ok = IERC20(token).transferFrom(from, to, amount);
        require(ok, "transferFrom failed");

        emit PaymentPulled(
            from,
            to,
            amount,
            scheduleId,
            token,
            block.timestamp
        );

        return true;
    }
}