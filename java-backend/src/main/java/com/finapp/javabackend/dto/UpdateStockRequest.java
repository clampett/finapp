package com.finapp.javabackend.dto;

import com.finapp.javabackend.model.enums.DividendFrequency;
import java.math.BigDecimal;

public record UpdateStockRequest(
    String ticker,
    String companyName,
    String exchange,
    Boolean paysDividend,
    DividendFrequency dividendFrequency,
    BigDecimal dividendPerShare,
    BigDecimal lastPrice,
    BigDecimal sharesOwned
) {}

