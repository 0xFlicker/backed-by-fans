// SPDX-License-Identifier: MIT
pragma solidity =0.8.36;

/// @notice Independent conservation ledger for each currency and source bucket.
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
}
