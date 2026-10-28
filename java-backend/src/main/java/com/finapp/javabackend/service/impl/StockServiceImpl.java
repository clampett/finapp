package com.finapp.javabackend.service.impl;

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
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class StockServiceImpl implements StockService {

    private final StockRepository stockRepository;
    private final StockTransactionRepository stockTransactionRepository;
    private final UserRepository userRepository;

    public StockServiceImpl(
        StockRepository stockRepository,
        StockTransactionRepository stockTransactionRepository,
        UserRepository userRepository
    ) {
        this.stockRepository = stockRepository;
        this.stockTransactionRepository = stockTransactionRepository;
        this.userRepository = userRepository;
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

        if (request.lastPrice() != null) {
            if (request.lastPrice().compareTo(BigDecimal.ZERO) < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stock last price must be >= 0");
            }
            stock.setLastPrice(request.lastPrice());
            stock.setLastPriceAt(OffsetDateTime.now());
        }

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
            BigDecimal price = request.lastPrice() != null ? request.lastPrice() : BigDecimal.ZERO;
            txn.setPricePerShare(price);
            txn.setFees(BigDecimal.ZERO);
            txn.setTotalAmount(request.sharesOwned().multiply(price));
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
}

