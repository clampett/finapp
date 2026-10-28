package com.finapp.javabackend.dto;

import com.finapp.javabackend.model.enums.AccountType;
import java.math.BigDecimal;

public record UpdateAccountRequest(
    String name,
    AccountType type,
    BigDecimal openingBalance,
    Boolean isActive
) {}

