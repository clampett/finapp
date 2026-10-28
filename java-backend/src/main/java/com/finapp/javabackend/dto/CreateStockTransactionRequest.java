package com.finapp.javabackend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.finapp.javabackend.model.enums.StockTxnType;
import java.math.BigDecimal;
import java.time.LocalDate;

public record CreateStockTransactionRequest(
    Long stockId,
    String ticker,
    Long accountId,
    String accountName,
    StockTxnType type,
    BigDecimal quantity,
    BigDecimal pricePerShare,
    BigDecimal fees,
    BigDecimal totalAmount,
    @JsonProperty("transactionDate") LocalDate transactionDate,
    @JsonProperty("date") LocalDate date,
    String notes,
    Long userId
) {
    public LocalDate effectiveDate() {
        if (transactionDate != null) {
            return transactionDate;
        }
        if (date != null) {
            return date;
        }
        return LocalDate.now();
    }
}

