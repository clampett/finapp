package com.finapp.javabackend.dto;

import com.finapp.javabackend.model.enums.RecurrenceFrequency;
import com.finapp.javabackend.model.enums.TransactionKind;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

public record RecurringTransactionDTO(
    Long id,
    Long userId,
    Long accountId,
    String accountName,
    Long categoryId,
    String categoryName,
    TransactionKind kind,
    String description,
    BigDecimal amount,
    RecurrenceFrequency frequency,
    Integer intervalCount,
    LocalDate startDate,
    LocalDate endDate,
    LocalDate nextDueDate,
    Boolean isActive,
    String notes,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {}

