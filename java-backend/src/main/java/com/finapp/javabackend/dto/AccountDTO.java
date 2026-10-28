package com.finapp.javabackend.dto;

import com.finapp.javabackend.model.enums.AccountType;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record AccountDTO(
    Long id,
    Long userId,
    String name,
    AccountType type,
    BigDecimal openingBalance,
    Boolean isActive,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {}

