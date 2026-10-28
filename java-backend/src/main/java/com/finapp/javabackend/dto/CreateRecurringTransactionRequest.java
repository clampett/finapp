package com.finapp.javabackend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.finapp.javabackend.model.enums.RecurrenceFrequency;
import com.finapp.javabackend.model.enums.TransactionKind;
import java.math.BigDecimal;
import java.time.LocalDate;

public record CreateRecurringTransactionRequest(
    Long accountId,
    String accountName,
    Long categoryId,
    String categoryName,
    TransactionKind kind,
    String description,
    BigDecimal amount,
    RecurrenceFrequency frequency,
    Integer intervalCount,
    @JsonProperty("startDate") LocalDate startDate,
    @JsonProperty("endDate") LocalDate endDate,
    @JsonProperty("nextDueDate") LocalDate nextDueDate,
    Boolean isActive,
    String notes
) {
    public int effectiveIntervalCount() {
        return (intervalCount == null || intervalCount < 1) ? 1 : intervalCount;
    }

    public LocalDate effectiveStartDate() {
        return startDate != null ? startDate : LocalDate.now();
    }

    public LocalDate effectiveNextDueDate() {
        if (nextDueDate != null) {
            return nextDueDate;
        }
        return effectiveStartDate();
    }
}

