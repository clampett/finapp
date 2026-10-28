package com.finapp.javabackend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.finapp.javabackend.model.enums.TransactionKind;
import java.math.BigDecimal;
import java.time.LocalDate;

public record UpdateTransactionRequest(
    Long accountId,
    String accountName,
    Long categoryId,
    String categoryName,
    Long recurringTransactionId,
    TransactionKind kind,
    String description,
    BigDecimal amount,
    @JsonProperty("transactionDate") LocalDate transactionDate,
    @JsonProperty("date") LocalDate date,
    String notes
) {
    public LocalDate effectiveDate() {
        if (transactionDate != null) {
            return transactionDate;
        }
        return date;
    }
}

