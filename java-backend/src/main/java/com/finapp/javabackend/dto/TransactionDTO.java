package com.finapp.javabackend.dto;

import com.finapp.javabackend.model.enums.TransactionKind;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

public record TransactionDTO(
    Long id,
    Long userId,
    Long accountId,
    String accountName,
    Long categoryId,
    String categoryName,
    Long recurringTransactionId,
    TransactionKind kind,
    String description,
    BigDecimal amount,
    LocalDate transactionDate,
    String notes,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {}

