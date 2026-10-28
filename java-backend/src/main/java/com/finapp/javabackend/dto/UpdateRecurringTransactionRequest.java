package com.finapp.javabackend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.finapp.javabackend.model.enums.RecurrenceFrequency;
import com.finapp.javabackend.model.enums.TransactionKind;
import java.math.BigDecimal;
import java.time.LocalDate;

public record UpdateRecurringTransactionRequest(
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
) {}

