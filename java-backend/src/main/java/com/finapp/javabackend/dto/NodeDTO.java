package com.finapp.javabackend.dto;

import java.math.BigDecimal;

public record NodeDTO(
        Long id,
        String name,
        String nodeType,
        BigDecimal amountOrBalance,
        BigDecimal interestRateApr
) {}