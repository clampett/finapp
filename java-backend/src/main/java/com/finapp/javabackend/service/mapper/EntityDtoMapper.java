package com.finapp.javabackend.service.mapper;

import com.finapp.javabackend.dto.*;
import com.finapp.javabackend.model.entity.*;

public final class EntityDtoMapper {

    private EntityDtoMapper() {}

    public static AccountDTO toDto(Account account) {
        if (account == null) return null;
        return new AccountDTO(
            account.getId(),
            account.getUser() != null ? account.getUser().getId() : null,
            account.getName(),
            account.getType(),
            account.getOpeningBalance(),
            account.getIsActive(),
            account.getCreatedAt(),
            account.getUpdatedAt()
        );
    }

    public static CategoryDTO toDto(Category category) {
        if (category == null) return null;
        return new CategoryDTO(
            category.getId(),
            category.getUser() != null ? category.getUser().getId() : null,
            category.getName(),
            category.getKind(),
            category.getParent() != null ? category.getParent().getId() : null,
            category.getParent() != null ? category.getParent().getName() : null,
            category.getCreatedAt()
        );
    }

    public static TransactionDTO toDto(Transaction transaction) {
        if (transaction == null) return null;
        return new TransactionDTO(
            transaction.getId(),
            transaction.getUser() != null ? transaction.getUser().getId() : null,
            transaction.getAccount() != null ? transaction.getAccount().getId() : null,
            transaction.getAccount() != null ? transaction.getAccount().getName() : null,
            transaction.getCategory() != null ? transaction.getCategory().getId() : null,
            transaction.getCategory() != null ? transaction.getCategory().getName() : null,
            transaction.getRecurringTransaction() != null ? transaction.getRecurringTransaction().getId() : null,
            transaction.getKind(),
            transaction.getDescription(),
            transaction.getAmount(),
            transaction.getTransactionDate(),
            transaction.getNotes(),
            transaction.getCreatedAt(),
            transaction.getUpdatedAt()
        );
    }

    public static RecurringTransactionDTO toDto(RecurringTransaction recurring) {
        if (recurring == null) return null;
        return new RecurringTransactionDTO(
            recurring.getId(),
            recurring.getUser() != null ? recurring.getUser().getId() : null,
            recurring.getAccount() != null ? recurring.getAccount().getId() : null,
            recurring.getAccount() != null ? recurring.getAccount().getName() : null,
            recurring.getCategory() != null ? recurring.getCategory().getId() : null,
            recurring.getCategory() != null ? recurring.getCategory().getName() : null,
            recurring.getKind(),
            recurring.getDescription(),
            recurring.getAmount(),
            recurring.getFrequency(),
            recurring.getIntervalCount(),
            recurring.getStartDate(),
            recurring.getEndDate(),
            recurring.getNextDueDate(),
            recurring.getIsActive(),
            recurring.getNotes(),
            recurring.getCreatedAt(),
            recurring.getUpdatedAt()
        );
    }

    public static StockDTO toDto(Stock stock) {
        if (stock == null) return null;
        return new StockDTO(
            stock.getId(),
            stock.getUser() != null ? stock.getUser().getId() : null,
            stock.getTicker(),
            stock.getCompanyName(),
            stock.getExchange(),
            stock.getPaysDividend(),
            stock.getDividendFrequency(),
            stock.getDividendPerShare(),
            stock.getLastPrice(),
            stock.getLastPriceAt(),
            stock.getCreatedAt(),
            stock.getUpdatedAt()
        );
    }

    public static StockTransactionDTO toDto(StockTransaction txn) {
        if (txn == null) return null;
        return new StockTransactionDTO(
            txn.getId(),
            txn.getUser() != null ? txn.getUser().getId() : null,
            txn.getStock() != null ? txn.getStock().getId() : null,
            txn.getStock() != null ? txn.getStock().getTicker() : null,
            txn.getAccount() != null ? txn.getAccount().getId() : null,
            txn.getAccount() != null ? txn.getAccount().getName() : null,
            txn.getType(),
            txn.getQuantity(),
            txn.getPricePerShare(),
            txn.getFees(),
            txn.getTotalAmount(),
            txn.getTransactionDate(),
            txn.getNotes(),
            txn.getCreatedAt(),
            txn.getUpdatedAt()
        );
    }

    public static StockPositionDTO toDto(StockPosition pos) {
        if (pos == null) return null;
        return new StockPositionDTO(
            pos.getStockId(),
            pos.getUserId(),
            pos.getTicker(),
            pos.getCompanyName(),
            pos.getPaysDividend(),
            pos.getDividendFrequency(),
            pos.getDividendPerShare(),
            pos.getSharesOwned(),
            pos.getCostBasis(),
            pos.getAvgCostPerShare(),
            pos.getTotalDividends(),
            pos.getTotalSaleProceeds(),
            pos.getLastPrice(),
            pos.getMarketValue()
        );
    }
}

