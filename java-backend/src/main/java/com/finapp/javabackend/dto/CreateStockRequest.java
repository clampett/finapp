package com.finapp.javabackend.dto;

import com.finapp.javabackend.model.enums.DividendFrequency;
import java.math.BigDecimal;

public record CreateStockRequest(
    String ticker,
    String companyName,
    String exchange,
    Boolean paysDividend,
    DividendFrequency dividendFrequency,
    BigDecimal dividendPerShare,
    BigDecimal lastPrice,
    BigDecimal sharesOwned,
    Long userId,
    BigDecimal purchasePrice
) {
    public CreateStockRequest(
        String ticker,
        String companyName,
        String exchange,
        Boolean paysDividend,
        DividendFrequency dividendFrequency,
        BigDecimal dividendPerShare,
        BigDecimal lastPrice,
        BigDecimal sharesOwned,
        Long userId
    ) {
        this(ticker, companyName, exchange, paysDividend, dividendFrequency, dividendPerShare, lastPrice, sharesOwned, userId, null);
    }
}

