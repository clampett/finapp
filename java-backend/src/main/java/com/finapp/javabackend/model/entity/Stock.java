package com.finapp.javabackend.model.entity;

import com.finapp.javabackend.model.enums.DividendFrequency;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

@Entity
@Table(name = "stocks", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"user_id", "ticker"}),
        @UniqueConstraint(columnNames = {"id", "user_id"})
})
public class Stock {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String ticker;

    @Column(name = "company_name")
    private String companyName;

    private String exchange;

    @Column(name = "pays_dividend", nullable = false)
    private Boolean paysDividend = Boolean.FALSE;

    @Enumerated(EnumType.STRING)
    @Column(name = "dividend_frequency")
    private DividendFrequency dividendFrequency;

    @Column(name = "dividend_per_share", precision = 14, scale = 6)
    private BigDecimal dividendPerShare;

    @Column(name = "last_price", precision = 14, scale = 4)
    private BigDecimal lastPrice;

    @Column(name = "last_price_at")
    private OffsetDateTime lastPriceAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    public Stock() {}

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
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

    public String getExchange() {
        return exchange;
    }

    public void setExchange(String exchange) {
        this.exchange = exchange;
    }

    public Boolean getPaysDividend() {
        return paysDividend;
    }

    public void setPaysDividend(Boolean paysDividend) {
        this.paysDividend = paysDividend;
    }

    public DividendFrequency getDividendFrequency() {
        return dividendFrequency;
    }

    public void setDividendFrequency(DividendFrequency dividendFrequency) {
        this.dividendFrequency = dividendFrequency;
    }

    public BigDecimal getDividendPerShare() {
        return dividendPerShare;
    }

    public void setDividendPerShare(BigDecimal dividendPerShare) {
        this.dividendPerShare = dividendPerShare;
    }

    public BigDecimal getLastPrice() {
        return lastPrice;
    }

    public void setLastPrice(BigDecimal lastPrice) {
        this.lastPrice = lastPrice;
    }

    public OffsetDateTime getLastPriceAt() {
        return lastPriceAt;
    }

    public void setLastPriceAt(OffsetDateTime lastPriceAt) {
        this.lastPriceAt = lastPriceAt;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
