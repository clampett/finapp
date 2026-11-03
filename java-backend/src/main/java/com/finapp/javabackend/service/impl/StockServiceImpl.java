package com.finapp.javabackend.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finapp.javabackend.dto.CreateStockRequest;
import com.finapp.javabackend.dto.StockDTO;
import com.finapp.javabackend.dto.UpdateStockRequest;
import com.finapp.javabackend.model.entity.Category;
import com.finapp.javabackend.model.entity.RecurringTransaction;
import com.finapp.javabackend.model.entity.Stock;
import com.finapp.javabackend.model.entity.StockTransaction;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.enums.DividendFrequency;
import com.finapp.javabackend.model.enums.RecurrenceFrequency;
import com.finapp.javabackend.model.enums.StockTxnType;
import com.finapp.javabackend.model.enums.TransactionKind;
import com.finapp.javabackend.repository.CategoryRepository;
import com.finapp.javabackend.repository.RecurringTransactionRepository;
import com.finapp.javabackend.repository.StockRepository;
import com.finapp.javabackend.repository.StockTransactionRepository;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.service.StockService;
import com.finapp.javabackend.service.mapper.EntityDtoMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.UriUtils;

@Service
@Transactional
public class StockServiceImpl implements StockService {

    private final StockRepository stockRepository;
    private final StockTransactionRepository stockTransactionRepository;
    private final UserRepository userRepository;
    private final RecurringTransactionRepository recurringTransactionRepository;
    private final CategoryRepository categoryRepository;
    private final RestTemplate restTemplate;
    private final String pythonBaseUrl;
    private final ObjectMapper objectMapper;

    public StockServiceImpl(
        StockRepository stockRepository,
        StockTransactionRepository stockTransactionRepository,
        UserRepository userRepository
    ) {
        this(
            stockRepository,
            stockTransactionRepository,
            userRepository,
            null,
            null,
            null,
            "http://localhost:5000",
            new ObjectMapper()
        );
    }

    public StockServiceImpl(
        StockRepository stockRepository,
        StockTransactionRepository stockTransactionRepository,
        UserRepository userRepository,
        RecurringTransactionRepository recurringTransactionRepository,
        CategoryRepository categoryRepository
    ) {
        this(
            stockRepository,
            stockTransactionRepository,
            userRepository,
            recurringTransactionRepository,
            categoryRepository,
            null,
            "http://localhost:5000",
            new ObjectMapper()
        );
    }

    @Autowired
    public StockServiceImpl(
        StockRepository stockRepository,
        StockTransactionRepository stockTransactionRepository,
        UserRepository userRepository,
        @Autowired(required = false) RecurringTransactionRepository recurringTransactionRepository,
        @Autowired(required = false) CategoryRepository categoryRepository,
        @Autowired(required = false) RestTemplateBuilder builder,
        @Value("${python.service.url:http://localhost:5000}") String pythonServiceUrl,
        @Autowired(required = false) ObjectMapper objectMapper
    ) {
        this.stockRepository = stockRepository;
        this.stockTransactionRepository = stockTransactionRepository;
        this.userRepository = userRepository;
        this.recurringTransactionRepository = recurringTransactionRepository;
        this.categoryRepository = categoryRepository;
        this.restTemplate =
            builder != null
                ? builder
                      .setConnectTimeout(Duration.ofSeconds(3))
                      .setReadTimeout(Duration.ofSeconds(12))
                      .build()
                : null;
        this.pythonBaseUrl = pythonServiceUrl.replaceAll("/+$", "");
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
    }

    @Override
    @Transactional(readOnly = true)
    public List<StockDTO> getStocks(Long userId) {
        return stockRepository.findByUserId(userId).stream().map(EntityDtoMapper::toDto).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public StockDTO getStock(Long userId, Long stockId) {
        Stock stock = stockRepository
            .findByIdAndUserId(stockId, userId)
            .orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Stock not found")
            );
        return EntityDtoMapper.toDto(stock);
    }

    @Override
    @Transactional(readOnly = true)
    public StockDTO getStockByTicker(Long userId, String ticker) {
        if (ticker == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ticker cannot be null");
        }
        List<Stock> stocks = stockRepository
            .findByUserIdAndTicker(userId, ticker.trim().toUpperCase());
        if (stocks.isEmpty()) {
            throw new ResponseStatusException(
                HttpStatus.NOT_FOUND,
                "Stock with ticker " + ticker + " not found"
            );
        }
        return EntityDtoMapper.toDto(stocks.get(0));
    }

    @Override
    public StockDTO createStock(Long userId, CreateStockRequest request) {
        if (request == null || request.ticker() == null || request.ticker().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stock ticker is required");
        }
        String ticker = request.ticker().trim().toUpperCase();

        User user = userRepository
            .findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        Stock stock = new Stock();
        stock.setUser(user);
        stock.setTicker(ticker);
        stock.setCompanyName(request.companyName());
        stock.setExchange(request.exchange());

        boolean paysDiv = Boolean.TRUE.equals(request.paysDividend());
        stock.setPaysDividend(paysDiv);
        if (paysDiv) {
            stock.setDividendFrequency(request.dividendFrequency());
            stock.setDividendPerShare(request.dividendPerShare());
        } else {
            stock.setDividendFrequency(null);
            stock.setDividendPerShare(null);
        }

        BigDecimal buyPrice =
            request.purchasePrice() != null
                ? request.purchasePrice()
                : request.lastPrice() != null
                  ? request.lastPrice()
                  : BigDecimal.ZERO;
        if (buyPrice.compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Stock purchase price must be >= 0"
            );
        }

        BigDecimal marketPrice = request.lastPrice() != null ? request.lastPrice() : buyPrice;
        if (marketPrice.compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Stock last price must be >= 0"
            );
        }
        stock.setLastPrice(marketPrice);
        stock.setLastPriceAt(OffsetDateTime.now());

        stock.setCreatedAt(OffsetDateTime.now());
        stock.setUpdatedAt(OffsetDateTime.now());
        Stock savedStock = stockRepository.save(stock);

        // If initial sharesOwned was provided and > 0, record a buy transaction
        if (request.sharesOwned() != null && request.sharesOwned().compareTo(BigDecimal.ZERO) > 0) {
            StockTransaction txn = new StockTransaction();
            txn.setUser(user);
            txn.setStock(savedStock);
            txn.setType(StockTxnType.buy);
            txn.setQuantity(request.sharesOwned());
            txn.setPricePerShare(buyPrice);
            txn.setFees(BigDecimal.ZERO);
            txn.setTotalAmount(request.sharesOwned().multiply(buyPrice));
            txn.setTransactionDate(LocalDate.now());
            txn.setNotes("Initial position");
            txn.setCreatedAt(OffsetDateTime.now());
            txn.setUpdatedAt(OffsetDateTime.now());
            stockTransactionRepository.save(txn);
        }

        // Auto-generate or update recurring dividend income transaction if stock pays dividends and shares > 0
        if (recurringTransactionRepository != null
                && Boolean.TRUE.equals(savedStock.getPaysDividend())
                && savedStock.getDividendPerShare() != null
                && savedStock.getDividendPerShare().compareTo(BigDecimal.ZERO) > 0
                && request.sharesOwned() != null
                && request.sharesOwned().compareTo(BigDecimal.ZERO) > 0) {
            String divDesc = ticker + " Dividend";
            List<RecurringTransaction> userRecurring = recurringTransactionRepository.findByUserId(userId);
            RecurringTransaction existing = userRecurring != null ? userRecurring.stream()
                .filter(r -> divDesc.equalsIgnoreCase(r.getDescription()))
                .findFirst()
                .orElse(null) : null;

            BigDecimal totalTickerShares = request.sharesOwned();
            if (stockRepository != null && stockTransactionRepository != null) {
                List<Stock> otherSameTicker = stockRepository.findByUserIdAndTicker(userId, ticker);
                if (otherSameTicker != null) {
                    for (Stock s : otherSameTicker) {
                        if (!s.getId().equals(savedStock.getId())) {
                            List<StockTransaction> sTxns = stockTransactionRepository.findByUserIdAndStockId(userId, s.getId());
                            if (sTxns != null) {
                                for (StockTransaction st : sTxns) {
                                    if (st.getType() == StockTxnType.buy) {
                                        totalTickerShares = totalTickerShares.add(st.getQuantity() != null ? st.getQuantity() : BigDecimal.ZERO);
                                    } else if (st.getType() == StockTxnType.sell) {
                                        totalTickerShares = totalTickerShares.subtract(st.getQuantity() != null ? st.getQuantity() : BigDecimal.ZERO);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            BigDecimal payoutAmount = totalTickerShares
                .multiply(savedStock.getDividendPerShare())
                .setScale(2, RoundingMode.HALF_UP);

            if (payoutAmount.compareTo(BigDecimal.ZERO) > 0) {
                RecurrenceFrequency recFreq;
                int intervalCount = 1;
                DividendFrequency divFreq = savedStock.getDividendFrequency();
                if (divFreq != null) {
                    switch (divFreq) {
                        case monthly -> recFreq = RecurrenceFrequency.monthly;
                        case semiannual -> {
                            recFreq = RecurrenceFrequency.monthly;
                            intervalCount = 6;
                        }
                        case annual -> recFreq = RecurrenceFrequency.yearly;
                        case quarterly, irregular -> recFreq = RecurrenceFrequency.quarterly;
                        default -> recFreq = RecurrenceFrequency.quarterly;
                    }
                } else {
                    recFreq = RecurrenceFrequency.quarterly;
                }

                if (existing != null) {
                    existing.setAmount(payoutAmount);
                    existing.setFrequency(recFreq);
                    existing.setIntervalCount(intervalCount);
                    existing.setIsActive(true);
                    existing.setNotes(String.format(
                        "Auto-generated dividend for %s (%s shares @ $%s/%s)",
                        ticker,
                        totalTickerShares,
                        savedStock.getDividendPerShare(),
                        savedStock.getDividendFrequency() != null ? savedStock.getDividendFrequency() : "quarterly"
                    ));
                    existing.setUpdatedAt(OffsetDateTime.now());
                    recurringTransactionRepository.save(existing);
                } else {
                    Category divCat = null;
                    if (categoryRepository != null) {
                        divCat = categoryRepository
                            .findByUserIdAndKindAndName(userId, TransactionKind.income, "Dividends")
                            .orElseGet(() -> {
                                Category newCat = new Category();
                                newCat.setUser(user);
                                newCat.setName("Dividends");
                                newCat.setKind(TransactionKind.income);
                                newCat.setCreatedAt(OffsetDateTime.now());
                                return categoryRepository.save(newCat);
                            });
                    }

                    RecurringTransaction recurring = new RecurringTransaction();
                    recurring.setUser(user);
                    recurring.setKind(TransactionKind.income);
                    recurring.setCategory(divCat);
                    recurring.setDescription(divDesc);
                    recurring.setAmount(payoutAmount);
                    recurring.setFrequency(recFreq);
                    recurring.setIntervalCount(intervalCount);
                    recurring.setStartDate(LocalDate.now());
                    recurring.setNextDueDate(RecurringTransactionServiceImpl.calculateNextDate(LocalDate.now(), recFreq, intervalCount));
                    recurring.setIsActive(Boolean.TRUE);
                    recurring.setNotes(String.format(
                        "Auto-generated dividend for %s (%s shares @ $%s/%s)",
                        ticker,
                        totalTickerShares,
                        savedStock.getDividendPerShare(),
                        savedStock.getDividendFrequency() != null ? savedStock.getDividendFrequency() : "quarterly"
                    ));
                    recurring.setCreatedAt(OffsetDateTime.now());
                    recurring.setUpdatedAt(OffsetDateTime.now());
                    recurringTransactionRepository.save(recurring);
                }
            }
        }

        return EntityDtoMapper.toDto(savedStock);
    }

    @Override
    public StockDTO updateStock(Long userId, Long stockId, UpdateStockRequest request) {
        Stock stock = stockRepository
            .findByIdAndUserId(stockId, userId)
            .orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Stock not found")
            );

        if (request.ticker() != null && !request.ticker().trim().isEmpty()) {
            String ticker = request.ticker().trim().toUpperCase();
            stock.setTicker(ticker);
        }

        if (request.companyName() != null) {
            stock.setCompanyName(request.companyName());
        }
        if (request.exchange() != null) {
            stock.setExchange(request.exchange());
        }

        if (request.paysDividend() != null) {
            boolean paysDiv = request.paysDividend();
            stock.setPaysDividend(paysDiv);
            if (!paysDiv) {
                stock.setDividendFrequency(null);
                stock.setDividendPerShare(null);
            }
        }

        if (Boolean.TRUE.equals(stock.getPaysDividend())) {
            if (request.dividendFrequency() != null) {
                stock.setDividendFrequency(request.dividendFrequency());
            }
            if (request.dividendPerShare() != null) {
                if (request.dividendPerShare().compareTo(BigDecimal.ZERO) < 0) {
                    throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Dividend per share must be >= 0"
                    );
                }
                stock.setDividendPerShare(request.dividendPerShare());
            }
        }

        // Rejected position rewrites so editing details could not alter historical purchases.
        if (request.purchasePrice() != null || request.sharesOwned() != null) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Use stock transactions to change holdings; stock detail edits cannot rewrite purchases."
            );
        }
        if (request.lastPrice() != null) {
            if (request.lastPrice().compareTo(BigDecimal.ZERO) < 0) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Stock last price must be >= 0"
                );
            }
            stock.setLastPrice(request.lastPrice());
            stock.setLastPriceAt(OffsetDateTime.now());
        }

        stock.setUpdatedAt(OffsetDateTime.now());
        Stock savedStock = stockRepository.save(stock);

        if (recurringTransactionRepository != null) {
            String divDesc = savedStock.getTicker() + " Dividend";
            List<RecurringTransaction> userRecurring = recurringTransactionRepository.findByUserId(userId);
            RecurringTransaction existing = userRecurring.stream()
                .filter(r -> divDesc.equalsIgnoreCase(r.getDescription()))
                .findFirst()
                .orElse(null);

            if (Boolean.TRUE.equals(savedStock.getPaysDividend())
                    && savedStock.getDividendPerShare() != null
                    && savedStock.getDividendPerShare().compareTo(BigDecimal.ZERO) > 0) {

                // Compute total shares owned from transactions across all dividend-paying lots of this ticker
                BigDecimal totalShares = BigDecimal.ZERO;
                if (stockRepository != null && stockTransactionRepository != null) {
                    List<Stock> payingSameTicker = stockRepository.findByUserIdAndTicker(userId, savedStock.getTicker());
                    if (payingSameTicker != null) {
                        for (Stock s : payingSameTicker) {
                            if (Boolean.TRUE.equals(s.getPaysDividend())) {
                                List<StockTransaction> txns = stockTransactionRepository.findByUserIdAndStockId(userId, s.getId());
                                if (txns != null) {
                                    for (StockTransaction t : txns) {
                                        if (t.getType() == StockTxnType.buy) {
                                            totalShares = totalShares.add(t.getQuantity() != null ? t.getQuantity() : BigDecimal.ZERO);
                                        } else if (t.getType() == StockTxnType.sell) {
                                            totalShares = totalShares.subtract(t.getQuantity() != null ? t.getQuantity() : BigDecimal.ZERO);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if (totalShares.compareTo(BigDecimal.ZERO) > 0) {
                    BigDecimal payoutAmount = totalShares
                        .multiply(savedStock.getDividendPerShare())
                        .setScale(2, RoundingMode.HALF_UP);

                    RecurrenceFrequency recFreq;
                    int intervalCount = 1;
                    DividendFrequency divFreq = savedStock.getDividendFrequency();
                    if (divFreq != null) {
                        switch (divFreq) {
                            case monthly -> recFreq = RecurrenceFrequency.monthly;
                            case semiannual -> {
                                recFreq = RecurrenceFrequency.monthly;
                                intervalCount = 6;
                            }
                            case annual -> recFreq = RecurrenceFrequency.yearly;
                            case quarterly, irregular -> recFreq = RecurrenceFrequency.quarterly;
                            default -> recFreq = RecurrenceFrequency.quarterly;
                        }
                    } else {
                        recFreq = RecurrenceFrequency.quarterly;
                    }

                    if (existing != null) {
                        existing.setAmount(payoutAmount);
                        existing.setFrequency(recFreq);
                        existing.setIntervalCount(intervalCount);
                        existing.setIsActive(true);
                        existing.setUpdatedAt(OffsetDateTime.now());
                        recurringTransactionRepository.save(existing);
                    } else {
                        Category divCat = null;
                        if (categoryRepository != null) {
                            divCat = categoryRepository
                                .findByUserIdAndKindAndName(userId, TransactionKind.income, "Dividends")
                                .orElseGet(() -> {
                                    Category newCat = new Category();
                                    newCat.setUser(stock.getUser());
                                    newCat.setName("Dividends");
                                    newCat.setKind(TransactionKind.income);
                                    newCat.setCreatedAt(OffsetDateTime.now());
                                    return categoryRepository.save(newCat);
                                });
                        }

                        RecurringTransaction recurring = new RecurringTransaction();
                        recurring.setUser(stock.getUser());
                        recurring.setKind(TransactionKind.income);
                        recurring.setCategory(divCat);
                        recurring.setDescription(divDesc);
                        recurring.setAmount(payoutAmount);
                        recurring.setFrequency(recFreq);
                        recurring.setIntervalCount(intervalCount);
                        recurring.setStartDate(LocalDate.now());
                        recurring.setNextDueDate(RecurringTransactionServiceImpl.calculateNextDate(LocalDate.now(), recFreq, intervalCount));
                        recurring.setIsActive(Boolean.TRUE);
                        recurring.setNotes(String.format(
                            "Auto-generated dividend for %s (%s shares @ $%s/%s)",
                            savedStock.getTicker(),
                            totalShares,
                            savedStock.getDividendPerShare(),
                            savedStock.getDividendFrequency() != null ? savedStock.getDividendFrequency() : "quarterly"
                        ));
                        recurring.setCreatedAt(OffsetDateTime.now());
                        recurring.setUpdatedAt(OffsetDateTime.now());
                        recurringTransactionRepository.save(recurring);
                    }
                } else if (existing != null) {
                    existing.setIsActive(false);
                    existing.setUpdatedAt(OffsetDateTime.now());
                    recurringTransactionRepository.save(existing);
                }
            } else if (existing != null) {
                List<Stock> remainingPaying = stockRepository != null
                    ? stockRepository.findByUserIdAndTicker(userId, savedStock.getTicker()).stream()
                        .filter(s -> !s.getId().equals(stockId) && Boolean.TRUE.equals(s.getPaysDividend()))
                        .toList()
                    : List.of();
                if (remainingPaying.isEmpty()) {
                    existing.setIsActive(false);
                    existing.setUpdatedAt(OffsetDateTime.now());
                    recurringTransactionRepository.save(existing);
                } else if (stockTransactionRepository != null) {
                    BigDecimal remainingShares = BigDecimal.ZERO;
                    for (Stock s : remainingPaying) {
                        List<StockTransaction> sTxns = stockTransactionRepository.findByUserIdAndStockId(userId, s.getId());
                        if (sTxns != null) {
                            for (StockTransaction st : sTxns) {
                                if (st.getType() == StockTxnType.buy) {
                                    remainingShares = remainingShares.add(st.getQuantity() != null ? st.getQuantity() : BigDecimal.ZERO);
                                } else if (st.getType() == StockTxnType.sell) {
                                    remainingShares = remainingShares.subtract(st.getQuantity() != null ? st.getQuantity() : BigDecimal.ZERO);
                                }
                            }
                        }
                    }
                    Stock samplePaying = remainingPaying.get(0);
                    BigDecimal divPerShare = samplePaying.getDividendPerShare() != null ? samplePaying.getDividendPerShare() : BigDecimal.ZERO;
                    BigDecimal remainingPayout = remainingShares.multiply(divPerShare).setScale(2, RoundingMode.HALF_UP);
                    if (remainingPayout.compareTo(BigDecimal.ZERO) > 0) {
                        existing.setAmount(remainingPayout);
                        existing.setNotes(String.format(
                            "Auto-generated dividend for %s (%s shares @ $%s/%s)",
                            savedStock.getTicker(),
                            remainingShares,
                            divPerShare,
                            samplePaying.getDividendFrequency() != null ? samplePaying.getDividendFrequency() : "quarterly"
                        ));
                        existing.setIsActive(true);
                        existing.setUpdatedAt(OffsetDateTime.now());
                        recurringTransactionRepository.save(existing);
                    } else {
                        existing.setIsActive(false);
                        existing.setUpdatedAt(OffsetDateTime.now());
                        recurringTransactionRepository.save(existing);
                    }
                }
            }
        }

        return EntityDtoMapper.toDto(savedStock);
    }

    @Override
    public void deleteStock(Long userId, Long stockId) {
        Stock stock = stockRepository
            .findByIdAndUserId(stockId, userId)
            .orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Stock not found")
            );
        if (recurringTransactionRepository != null) {
            String divDesc = stock.getTicker() + " Dividend";
            List<Stock> remainingSameTicker = stockRepository.findByUserIdAndTicker(userId, stock.getTicker());
            List<Stock> remainingPayingLots = remainingSameTicker != null ? remainingSameTicker.stream()
                .filter(s -> !s.getId().equals(stockId) && Boolean.TRUE.equals(s.getPaysDividend()))
                .toList() : List.of();

            List<RecurringTransaction> userRecurring = recurringTransactionRepository.findByUserId(userId);
            RecurringTransaction existing = userRecurring != null ? userRecurring.stream()
                .filter(r -> divDesc.equalsIgnoreCase(r.getDescription()))
                .findFirst()
                .orElse(null) : null;

            if (remainingPayingLots.isEmpty()) {
                if (userRecurring != null) {
                    for (RecurringTransaction r : userRecurring) {
                        if (divDesc.equalsIgnoreCase(r.getDescription())) {
                            recurringTransactionRepository.delete(r);
                        }
                    }
                }
            } else if (existing != null && stockTransactionRepository != null) {
                BigDecimal remainingShares = BigDecimal.ZERO;
                for (Stock s : remainingPayingLots) {
                    List<StockTransaction> sTxns = stockTransactionRepository.findByUserIdAndStockId(userId, s.getId());
                    if (sTxns != null) {
                        for (StockTransaction st : sTxns) {
                            if (st.getType() == StockTxnType.buy) {
                                remainingShares = remainingShares.add(st.getQuantity() != null ? st.getQuantity() : BigDecimal.ZERO);
                            } else if (st.getType() == StockTxnType.sell) {
                                remainingShares = remainingShares.subtract(st.getQuantity() != null ? st.getQuantity() : BigDecimal.ZERO);
                            }
                        }
                    }
                }
                Stock samplePaying = remainingPayingLots.get(0);
                BigDecimal divPerShare = samplePaying.getDividendPerShare() != null ? samplePaying.getDividendPerShare() : BigDecimal.ZERO;
                BigDecimal remainingPayout = remainingShares.multiply(divPerShare).setScale(2, RoundingMode.HALF_UP);
                if (remainingPayout.compareTo(BigDecimal.ZERO) > 0) {
                    existing.setAmount(remainingPayout);
                    existing.setNotes(String.format(
                        "Auto-generated dividend for %s (%s shares @ $%s/%s)",
                        stock.getTicker(),
                        remainingShares,
                        divPerShare,
                        samplePaying.getDividendFrequency() != null ? samplePaying.getDividendFrequency() : "quarterly"
                    ));
                    existing.setUpdatedAt(OffsetDateTime.now());
                    recurringTransactionRepository.save(existing);
                } else {
                    recurringTransactionRepository.delete(existing);
                }
            }
        }
        stockRepository.delete(stock);
    }

    @Override
    public void updateAllStockPricesForUser(Long userId) {
        if (userId == null) return;
        List<Stock> userStocks = stockRepository.findByUserId(userId);
        if (userStocks.isEmpty() || restTemplate == null) return;

        for (Stock stock : userStocks) {
            try {
                String ticker = stock.getTicker();
                if (ticker == null || ticker.trim().isEmpty()) continue;
                String encoded = UriUtils.encodePathSegment(
                    ticker.trim().toUpperCase(),
                    StandardCharsets.UTF_8
                );
                URI uri = URI.create(pythonBaseUrl + "/api/stocks/" + encoded);
                ResponseEntity<String> response = restTemplate.getForEntity(uri, String.class);
                if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                    JsonNode root = objectMapper.readTree(response.getBody());
                    if (root.has("latest_price") && !root.get("latest_price").isNull()) {
                        BigDecimal latestPrice = new BigDecimal(root.get("latest_price").asText());
                        stock.setLastPrice(latestPrice);
                        stock.setLastPriceAt(OffsetDateTime.now());
                        stock.setUpdatedAt(OffsetDateTime.now());
                        stockRepository.save(stock);
                    }
                }
            } catch (Exception e) {
                // If quote retrieval fails for a particular ticker, continue with the remaining stocks
            }
        }
    }
}
