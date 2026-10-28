package com.finapp.javabackend.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.Immutable;
import java.math.BigDecimal;

@Entity
@Immutable
@Table(name = "stock_positions")
public class StockPosition {

    @Id
    @Column(name = "stock_id")
    private Long stockId;

    @Column(name = "user_id")
    private Long userId;

    private String ticker;

    @Column(name = "company_name")
    private String companyName;

    @Column(name = "pays_dividend")
    private Boolean paysDividend;

    @Column(name = "dividend_frequency")
    private String dividendFrequency;

    @Column(name = "dividend_per_share")
    private BigDecimal dividendPerShare;

    @Column(name = "shares_owned")
    private BigDecimal sharesOwned;

    @Column(name = "cost_basis")
    private BigDecimal costBasis;

    @Column(name = "avg_cost_per_share")
    private BigDecimal avgCostPerShare;

    @Column(name = "total_dividends")
    private BigDecimal totalDividends;

    @Column(name = "total_sale_proceeds")
    private BigDecimal totalSaleProceeds;

    @Column(name = "last_price")
    private BigDecimal lastPrice;

    @Column(name = "market_value")
    private BigDecimal marketValue;

    public Long getStockId() {
        return stockId;
    }

    public void setStockId(Long stockId) {
        this.stockId = stockId;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getTicker() {
        return ticker;
    }

    public void setTicker(String ticker) {
        this.ticker = ticker;
    }

    public String getCompanyName() {
        return companyName;
    }

    public void setCompanyName(String companyName) {
        this.companyName = companyName;
    }

    public Boolean getPaysDividend() {
        return paysDividend;
    }

    public void setPaysDividend(Boolean paysDividend) {
        this.paysDividend = paysDividend;
    }

    public String getDividendFrequency() {
        return dividendFrequency;
    }

    public void setDividendFrequency(String dividendFrequency) {
        this.dividendFrequency = dividendFrequency;
    }

    public BigDecimal getDividendPerShare() {
        return dividendPerShare;
    }

    public void setDividendPerShare(BigDecimal dividendPerShare) {
        this.dividendPerShare = dividendPerShare;
    }

    public BigDecimal getSharesOwned() {
        return sharesOwned;
    }

    public void setSharesOwned(BigDecimal sharesOwned) {
        this.sharesOwned = sharesOwned;
    }

    public BigDecimal getCostBasis() {
        return costBasis;
    }

    public void setCostBasis(BigDecimal costBasis) {
        this.costBasis = costBasis;
    }

    public BigDecimal getAvgCostPerShare() {
        return avgCostPerShare;
    }

    public void setAvgCostPerShare(BigDecimal avgCostPerShare) {
        this.avgCostPerShare = avgCostPerShare;
    }

    public BigDecimal getTotalDividends() {
        return totalDividends;
    }

    public void setTotalDividends(BigDecimal totalDividends) {
        this.totalDividends = totalDividends;
    }

    public BigDecimal getTotalSaleProceeds() {
        return totalSaleProceeds;
    }

    public void setTotalSaleProceeds(BigDecimal totalSaleProceeds) {
        this.totalSaleProceeds = totalSaleProceeds;
    }

    public BigDecimal getLastPrice() {
        return lastPrice;
    }

    public void setLastPrice(BigDecimal lastPrice) {
        this.lastPrice = lastPrice;
    }

    public BigDecimal getMarketValue() {
        return marketValue;
    }

    public void setMarketValue(BigDecimal marketValue) {
        this.marketValue = marketValue;
    }
}
