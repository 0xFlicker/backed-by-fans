// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Independent integer reference: preserve division remainders before tolerance.
library BuybackModel {
    struct Balance {
        uint256 received;
        uint256 converted;
        uint256 spent;
        uint256 burned;
    }

    struct Book {
        mapping(address => mapping(uint8 => Balance)) balances;
    }

    function receiveFunds(Book storage book, address asset, uint8 bucket, uint256 amount) internal {
        book.balances[asset][bucket].received += amount;
    }

    function convert(
        Book storage book,
        address input,
        address output,
        uint8 bucket,
        uint256 spent,
        uint256 received
    ) internal {
        require(available(book, input, bucket) >= spent, "model overspend");
        book.balances[input][bucket].spent += spent;
        book.balances[output][bucket].converted += received;
    }

    function burn(Book storage book, address token, uint8 bucket, uint256 amount) internal {
        require(available(book, token, bucket) >= amount, "model burn overspend");
        book.balances[token][bucket].spent += amount;
        book.balances[token][bucket].burned += amount;
    }

    function available(Book storage book, address asset, uint8 bucket)
        internal
        view
        returns (uint256)
    {
        Balance storage balance = book.balances[asset][bucket];
        return balance.received + balance.converted - balance.spent;
    }

    function minimum(uint128 input, uint128 numerator, uint128 denominator, uint16 tolerance)
        internal
        pure
        returns (uint256)
    {
        require(denominator > 0 && numerator > 0 && tolerance <= 100);
        uint256 product = uint256(input) * numerator;
        uint256 quotient = product / denominator;
        uint256 remainder = product % denominator;
        uint256 factor = 10_000 - tolerance;
        // The remainder is retained separately below, so this division loses no precision.
        // forge-lint: disable-next-item(divide-before-multiply)
        uint256 whole = (quotient / 10_000) * factor;
        uint256 fraction = (quotient % 10_000) * factor * denominator + remainder * factor;
        uint256 divisor = uint256(denominator) * 10_000;
        return whole + fraction / divisor + (fraction % divisor == 0 ? 0 : 1);
    }
}
