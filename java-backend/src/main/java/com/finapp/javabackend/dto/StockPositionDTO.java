package com.finapp.javabackend.dto;

import java.math.BigDecimal;

public record StockPositionDTO(
    Long stockId,
    Long userId,
    String ticker,
    String companyName,
    Boolean paysDividend,
    String dividendFrequency,
    BigDecimal dividendPerShare,
    BigDecimal sharesOwned,
    BigDecimal costBasis,
    BigDecimal avgCostPerShare,
    BigDecimal totalDividends,
    BigDecimal totalSaleProceeds,
    BigDecimal lastPrice,
    BigDecimal marketValue
) {}

