package com.finapp.javabackend.dto;

import com.finapp.javabackend.model.enums.StockTxnType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

public record StockTransactionDTO(
    Long id,
    Long userId,
    Long stockId,
    String ticker,
    Long accountId,
    String accountName,
    StockTxnType type,
    BigDecimal quantity,
    BigDecimal pricePerShare,
    BigDecimal fees,
    BigDecimal totalAmount,
    LocalDate transactionDate,
    String notes,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {}

