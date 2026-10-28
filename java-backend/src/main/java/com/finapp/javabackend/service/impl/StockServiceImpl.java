package com.finapp.javabackend.service.impl;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finapp.javabackend.dto.CreateStockRequest;
import com.finapp.javabackend.dto.StockDTO;
import com.finapp.javabackend.dto.UpdateStockRequest;
import com.finapp.javabackend.model.entity.Stock;
import com.finapp.javabackend.model.entity.StockTransaction;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.enums.StockTxnType;
import com.finapp.javabackend.repository.StockRepository;
import com.finapp.javabackend.repository.StockTransactionRepository;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.service.StockService;
import com.finapp.javabackend.service.mapper.EntityDtoMapper;
import java.math.BigDecimal;
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
    private final RestTemplate restTemplate;
    private final String pythonBaseUrl;
    private final ObjectMapper objectMapper;

    public StockServiceImpl(
        StockRepository stockRepository,
        StockTransactionRepository stockTransactionRepository,
        UserRepository userRepository
    ) {
        this(stockRepository, stockTransactionRepository, userRepository, null, "http://localhost:5000", new ObjectMapper());
    }

    @Autowired
    public StockServiceImpl(
        StockRepository stockRepository,
        StockTransactionRepository stockTransactionRepository,
        UserRepository userRepository,
        @Autowired(required = false) RestTemplateBuilder builder,
        @Value("${python.service.url:http://localhost:5000}") String pythonServiceUrl,
        @Autowired(required = false) ObjectMapper objectMapper
    ) {
        this.stockRepository = stockRepository;
        this.stockTransactionRepository = stockTransactionRepository;
        this.userRepository = userRepository;
        this.restTemplate = builder != null
            ? builder.setConnectTimeout(Duration.ofSeconds(3)).setReadTimeout(Duration.ofSeconds(12)).build()
            : null;
        this.pythonBaseUrl = pythonServiceUrl.replaceAll("/+$", "");
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
    }

    @Override
    @Transactional(readOnly = true)
    public List<StockDTO> getStocks(Long userId) {
        return stockRepository.findByUserId(userId).stream()
            .map(EntityDtoMapper::toDto)
            .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public StockDTO getStock(Long userId, Long stockId) {
        Stock stock = stockRepository.findByIdAndUserId(stockId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Stock not found"));
        return EntityDtoMapper.toDto(stock);
    }

    @Override
    @Transactional(readOnly = true)
    public StockDTO getStockByTicker(Long userId, String ticker) {
        if (ticker == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Ticker cannot be null");
        }
        Stock stock = stockRepository.findByUserIdAndTicker(userId, ticker.trim().toUpperCase())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Stock with ticker " + ticker + " not found"));
        return EntityDtoMapper.toDto(stock);
    }

    @Override
    public StockDTO createStock(Long userId, CreateStockRequest request) {
        if (request == null || request.ticker() == null || request.ticker().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stock ticker is required");
        }
        String ticker = request.ticker().trim().toUpperCase();
        if (stockRepository.existsByUserIdAndTicker(userId, ticker)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Stock with ticker " + ticker + " already exists for this user");
        }

        User user = userRepository.findById(userId)
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

        BigDecimal buyPrice = request.purchasePrice() != null
            ? request.purchasePrice()
            : (request.lastPrice() != null ? request.lastPrice() : BigDecimal.ZERO);
        if (buyPrice.compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stock purchase price must be >= 0");
        }

        BigDecimal marketPrice = request.lastPrice() != null ? request.lastPrice() : buyPrice;
        if (marketPrice.compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stock last price must be >= 0");
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

        return EntityDtoMapper.toDto(savedStock);
    }

    @Override
    public StockDTO updateStock(Long userId, Long stockId, UpdateStockRequest request) {
        Stock stock = stockRepository.findByIdAndUserId(stockId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Stock not found"));

        if (request.ticker() != null && !request.ticker().trim().isEmpty()) {
            String ticker = request.ticker().trim().toUpperCase();
            if (!ticker.equals(stock.getTicker()) && stockRepository.existsByUserIdAndTicker(userId, ticker)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Stock with ticker " + ticker + " already exists for this user");
            }
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
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Dividend per share must be >= 0");
                }
                stock.setDividendPerShare(request.dividendPerShare());
            }
        }

        if (request.purchasePrice() != null) {
            if (request.purchasePrice().compareTo(BigDecimal.ZERO) < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stock purchase price must be >= 0");
            }
            List<StockTransaction> txns = stockTransactionRepository.findByUserIdAndStockId(userId, stockId);
            for (StockTransaction t : txns) {
                if (t.getType() == StockTxnType.buy && "Initial position".equals(t.getNotes())) {
                    t.setPricePerShare(request.purchasePrice());
                    if (t.getQuantity() != null) {
                        t.setTotalAmount(t.getQuantity().multiply(request.purchasePrice()));
                    }
                    t.setUpdatedAt(OffsetDateTime.now());
                    stockTransactionRepository.save(t);
                    break;
                }
            }
        }

        if (request.sharesOwned() != null && request.sharesOwned().compareTo(BigDecimal.ZERO) >= 0) {
            List<StockTransaction> txns = stockTransactionRepository.findByUserIdAndStockId(userId, stockId);
            for (StockTransaction t : txns) {
                if (t.getType() == StockTxnType.buy && "Initial position".equals(t.getNotes())) {
                    t.setQuantity(request.sharesOwned());
                    if (t.getPricePerShare() != null) {
                        t.setTotalAmount(request.sharesOwned().multiply(t.getPricePerShare()));
                    }
                    t.setUpdatedAt(OffsetDateTime.now());
                    stockTransactionRepository.save(t);
                    break;
                }
            }
        }

        if (request.lastPrice() != null) {
            if (request.lastPrice().compareTo(BigDecimal.ZERO) < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stock last price must be >= 0");
            }
            stock.setLastPrice(request.lastPrice());
            stock.setLastPriceAt(OffsetDateTime.now());
        }

        stock.setUpdatedAt(OffsetDateTime.now());
        return EntityDtoMapper.toDto(stockRepository.save(stock));
    }

    @Override
    public void deleteStock(Long userId, Long stockId) {
        Stock stock = stockRepository.findByIdAndUserId(stockId, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Stock not found"));
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
                String encoded = UriUtils.encodePathSegment(ticker.trim().toUpperCase(), StandardCharsets.UTF_8);
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

