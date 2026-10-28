package com.finapp.javabackend.service.impl;

import com.finapp.javabackend.dto.CreateStockTransactionRequest;
import com.finapp.javabackend.dto.StockTransactionDTO;
import com.finapp.javabackend.model.entity.*;
import com.finapp.javabackend.model.enums.AccountType;
import com.finapp.javabackend.model.enums.StockTxnType;
import com.finapp.javabackend.repository.*;
import com.finapp.javabackend.service.StockTransactionService;
import com.finapp.javabackend.service.mapper.EntityDtoMapper;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class StockTransactionServiceImpl implements StockTransactionService {

    private final StockTransactionRepository stockTransactionRepository;
    private final StockRepository stockRepository;
    private final AccountRepository accountRepository;
    private final UserRepository userRepository;

    public StockTransactionServiceImpl(
        StockTransactionRepository stockTransactionRepository,
        StockRepository stockRepository,
        AccountRepository accountRepository,
        UserRepository userRepository
    ) {
        this.stockTransactionRepository = stockTransactionRepository;
        this.stockRepository = stockRepository;
        this.accountRepository = accountRepository;
        this.userRepository = userRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<StockTransactionDTO> getStockTransactions(Long userId, Long stockId) {
        List<StockTransaction> list;
        if (stockId != null) {
            list = stockTransactionRepository.findByUserIdAndStockId(userId, stockId);
        } else {
            list = stockTransactionRepository.findByUserId(userId);
        }
        return list.stream().map(EntityDtoMapper::toDto).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public StockTransactionDTO getStockTransaction(Long userId, Long id) {
        StockTransaction txn = stockTransactionRepository.findByIdAndUserId(id, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Stock transaction not found"));
        return EntityDtoMapper.toDto(txn);
    }

    @Override
    public StockTransactionDTO createStockTransaction(Long userId, CreateStockTransactionRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request cannot be empty");
        }
        if (request.type() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stock transaction type is required (buy/sell/dividend/split)");
        }

        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        Stock stock = resolveStock(userId, user, request.stockId(), request.ticker());
        Account account = resolveAccount(userId, user, request.accountId(), request.accountName());

        StockTxnType type = request.type();
        BigDecimal quantity = request.quantity();
        BigDecimal pricePerShare = request.pricePerShare();
        BigDecimal fees = request.fees() != null ? request.fees() : BigDecimal.ZERO;
        BigDecimal totalAmount = request.totalAmount();

        if (fees.compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fees cannot be negative");
        }

        // Validate CHECK constraints according to schema:
        // (type IN ('buy','sell') AND quantity IS NOT NULL AND price_per_share IS NOT NULL)
        // OR (type = 'dividend' AND total_amount IS NOT NULL AND total_amount > 0)
        // OR (type = 'split' AND quantity IS NOT NULL)
        switch (type) {
            case buy, sell -> {
                if (quantity == null || quantity.compareTo(BigDecimal.ZERO) <= 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quantity must be strictly greater than 0 for " + type);
                }
                if (pricePerShare == null || pricePerShare.compareTo(BigDecimal.ZERO) < 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Price per share must be >= 0 for " + type);
                }
                if (totalAmount == null) {
                    totalAmount = quantity.multiply(pricePerShare).add(type == StockTxnType.buy ? fees : fees.negate());
                }
                // Update stock's last price
                stock.setLastPrice(pricePerShare);
                stock.setLastPriceAt(OffsetDateTime.now());
                stock.setUpdatedAt(OffsetDateTime.now());
                stockRepository.save(stock);
            }
            case dividend -> {
                if (totalAmount == null || totalAmount.compareTo(BigDecimal.ZERO) <= 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Total amount must be greater than 0 for dividend");
                }
            }
            case split -> {
                if (quantity == null || quantity.compareTo(BigDecimal.ZERO) <= 0) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Split ratio quantity must be strictly greater than 0");
                }
            }
        }

        StockTransaction txn = new StockTransaction();
        txn.setUser(user);
        txn.setStock(stock);
        txn.setAccount(account);
        txn.setType(type);
        txn.setQuantity(quantity);
        txn.setPricePerShare(pricePerShare);
        txn.setFees(fees);
        txn.setTotalAmount(totalAmount);
        txn.setTransactionDate(request.effectiveDate());
        txn.setNotes(request.notes());
        txn.setCreatedAt(OffsetDateTime.now());
        txn.setUpdatedAt(OffsetDateTime.now());

        return EntityDtoMapper.toDto(stockTransactionRepository.save(txn));
    }

    @Override
    public void deleteStockTransaction(Long userId, Long id) {
        StockTransaction txn = stockTransactionRepository.findByIdAndUserId(id, userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Stock transaction not found"));
        stockTransactionRepository.delete(txn);
    }

    private Stock resolveStock(Long userId, User user, Long stockId, String ticker) {
        if (stockId != null) {
            return stockRepository.findByIdAndUserId(stockId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stock not found for user"));
        }
        if (ticker != null && !ticker.trim().isEmpty()) {
            String symbol = ticker.trim().toUpperCase();
            return stockRepository.findByUserIdAndTicker(userId, symbol).orElseGet(() -> {
                Stock created = new Stock();
                created.setUser(user);
                created.setTicker(symbol);
                created.setCreatedAt(OffsetDateTime.now());
                created.setUpdatedAt(OffsetDateTime.now());
                return stockRepository.save(created);
            });
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stock ID or ticker is required");
    }

    private Account resolveAccount(Long userId, User user, Long accountId, String accountName) {
        if (accountId != null) {
            return accountRepository.findByIdAndUserId(accountId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Account not found for user"));
        }
        if (accountName != null && !accountName.trim().isEmpty()) {
            String name = accountName.trim();
            return accountRepository.findByUserIdAndName(userId, name).orElseGet(() -> {
                Account created = new Account();
                created.setUser(user);
                created.setName(name);
                created.setType(AccountType.brokerage);
                created.setOpeningBalance(BigDecimal.ZERO);
                created.setIsActive(true);
                created.setCreatedAt(OffsetDateTime.now());
                created.setUpdatedAt(OffsetDateTime.now());
                return accountRepository.save(created);
            });
        }
        return null;
    }
}

