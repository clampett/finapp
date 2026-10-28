package com.finapp.javabackend.dto;

import com.finapp.javabackend.model.enums.DividendFrequency;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record StockDTO(
    Long id,
    Long userId,
    String ticker,
    String companyName,
    String exchange,
    Boolean paysDividend,
    DividendFrequency dividendFrequency,
    BigDecimal dividendPerShare,
    BigDecimal lastPrice,
    OffsetDateTime lastPriceAt,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {}

