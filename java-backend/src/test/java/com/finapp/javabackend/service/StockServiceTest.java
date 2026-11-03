package com.finapp.javabackend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.dto.CreateStockRequest;
import com.finapp.javabackend.dto.StockDTO;
import com.finapp.javabackend.dto.UpdateStockRequest;
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
import com.finapp.javabackend.service.impl.StockServiceImpl;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class StockServiceTest {

    @Mock
    private StockRepository stockRepository;

    @Mock
    private StockTransactionRepository stockTransactionRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private RecurringTransactionRepository recurringTransactionRepository;

    @Mock
    private CategoryRepository categoryRepository;

    private StockService stockService;

    private User user;

    @BeforeEach
    void setUp() {
        stockService = new StockServiceImpl(
            stockRepository,
            stockTransactionRepository,
            userRepository,
            recurringTransactionRepository,
            categoryRepository
        );
        user = new User();
        user.setId(3L);
        user.setUsername("dave");
    }

    @Test
    void createStock_success() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));
        when(stockRepository.save(any(Stock.class))).thenAnswer(i -> {
            Stock s = i.getArgument(0);
            s.setId(10L);
            return s;
        });

        CreateStockRequest req = new CreateStockRequest(
            "AAPL",
            "Apple Inc.",
            "NASDAQ",
            true,
            DividendFrequency.quarterly,
            new BigDecimal("0.25"),
            new BigDecimal("185.50"),
            new BigDecimal("10"),
            3L
        );

        StockDTO dto = stockService.createStock(3L, req);

        assertNotNull(dto);
        assertEquals(10L, dto.id());
        assertEquals("AAPL", dto.ticker());
        assertEquals("Apple Inc.", dto.companyName());
        assertTrue(dto.paysDividend());
        verify(stockTransactionRepository).save(any(StockTransaction.class));
        verify(recurringTransactionRepository).save(any(RecurringTransaction.class));
    }

    @Test
    void createStock_withPurchasePriceAndCurrentPrice_setsBothCorrectly() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));
        when(stockRepository.save(any(Stock.class))).thenAnswer(i -> {
            Stock s = i.getArgument(0);
            s.setId(20L);
            return s;
        });

        CreateStockRequest req = new CreateStockRequest(
            "NVDA",
            "NVIDIA Corporation",
            "NASDAQ",
            false,
            null,
            null,
            new BigDecimal("130.00"), // current last price
            new BigDecimal("5"),
            3L,
            new BigDecimal("100.00") // price at purchase
        );

        StockDTO dto = stockService.createStock(3L, req);

        assertNotNull(dto);
        assertEquals(new BigDecimal("130.00"), dto.lastPrice());
        verify(stockTransactionRepository).save(
            argThat(
                txn ->
                    txn.getPricePerShare().compareTo(new BigDecimal("100.00")) == 0 &&
                    txn.getTotalAmount().compareTo(new BigDecimal("500.00")) == 0 &&
                    txn.getQuantity().compareTo(new BigDecimal("5")) == 0
            )
        );
    }

    @Test
    void createStock_duplicateTicker_allowed() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));
        when(stockRepository.save(any(Stock.class))).thenAnswer(i -> {
            Stock s = i.getArgument(0);
            s.setId(99L);
            return s;
        });

        CreateStockRequest req = new CreateStockRequest(
            "AAPL",
            "Apple Second Lot",
            null,
            false,
            null,
            null,
            new BigDecimal("210.00"),
            new BigDecimal("5"),
            3L,
            new BigDecimal("205.00")
        );

        StockDTO dto = stockService.createStock(3L, req);
        assertNotNull(dto);
        assertEquals(99L, dto.id());
        assertEquals("AAPL", dto.ticker());
        assertEquals("Apple Second Lot", dto.companyName());
    }

    @Test
    void getStockByTicker_withMultipleLots_returnsFirst() {
        Stock s1 = new Stock();
        s1.setId(10L);
        s1.setUser(user);
        s1.setTicker("AAPL");
        s1.setCompanyName("Apple Lot 1");

        Stock s2 = new Stock();
        s2.setId(20L);
        s2.setUser(user);
        s2.setTicker("AAPL");
        s2.setCompanyName("Apple Lot 2");

        when(stockRepository.findByUserIdAndTicker(3L, "AAPL")).thenReturn(java.util.List.of(s1, s2));

        StockDTO dto = stockService.getStockByTicker(3L, "AAPL");
        assertNotNull(dto);
        assertEquals(10L, dto.id());
        assertEquals("Apple Lot 1", dto.companyName());
    }

    @Test
    void updateStock_clearsDividendsWhenPaysDividendFalse() {
        Stock s = new Stock();
        s.setId(10L);
        s.setUser(user);
        s.setTicker("AAPL");
        s.setPaysDividend(true);
        s.setDividendFrequency(DividendFrequency.quarterly);
        s.setDividendPerShare(new BigDecimal("0.25"));

        when(stockRepository.findByIdAndUserId(10L, 3L)).thenReturn(Optional.of(s));
        when(stockRepository.save(any(Stock.class))).thenAnswer(i -> i.getArgument(0));

        UpdateStockRequest req = new UpdateStockRequest(
            null,
            null,
            null,
            false,
            null,
            null,
            new BigDecimal("190.00"),
            null
        );

        StockDTO updated = stockService.updateStock(3L, 10L, req);

        assertFalse(updated.paysDividend());
        assertNull(updated.dividendFrequency());
        assertNull(updated.dividendPerShare());
        assertEquals(new BigDecimal("190.00"), updated.lastPrice());
    }

    @Test
    void deleteStock_success() {
        Stock s = new Stock();
        s.setId(10L);
        when(stockRepository.findByIdAndUserId(10L, 3L)).thenReturn(Optional.of(s));

        stockService.deleteStock(3L, 10L);
        verify(stockRepository).delete(s);
    }

    @Test
    void detailEditsNeverRewriteExistingPurchases() {
        Stock stock = new Stock();
        stock.setId(10L);
        stock.setUser(user);
        stock.setTicker("AAPL");
        when(stockRepository.findByIdAndUserId(10L, 3L)).thenReturn(Optional.of(stock));
        when(stockRepository.save(any(Stock.class))).thenAnswer(i -> i.getArgument(0));
        stockService.updateStock(
            3L,
            10L,
            new UpdateStockRequest(null, "Apple", null, null, null, null, null, null)
        );
        verifyNoInteractions(stockTransactionRepository);
        assertEquals("Apple", stock.getCompanyName());
    }

    @Test
    void aggregateHoldingsCannotBeWrittenIntoTheInitialPurchase() {
        Stock stock = new Stock();
        stock.setId(10L);
        stock.setTicker("AAPL");
        when(stockRepository.findByIdAndUserId(10L, 3L)).thenReturn(Optional.of(stock));
        var error = assertThrows(ResponseStatusException.class, () ->
            stockService.updateStock(
                3L,
                10L,
                new UpdateStockRequest(
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    new BigDecimal("15"),
                    new BigDecimal("100")
                )
            )
        );
        assertEquals(400, error.getStatusCode().value());
        verifyNoInteractions(stockTransactionRepository);
        verify(stockRepository, never()).save(any());
    }

    @Test
    void createStock_withDividendAndShares_createsRecurringIncomeTransaction() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));
        when(stockRepository.save(any(Stock.class))).thenAnswer(i -> {
            Stock s = i.getArgument(0);
            s.setId(100L);
            return s;
        });

        CreateStockRequest req = new CreateStockRequest(
            "KO",
            "The Coca-Cola Company",
            "NYSE",
            true,
            DividendFrequency.quarterly,
            new BigDecimal("0.53"),
            new BigDecimal("60.00"),
            new BigDecimal("20"), // 20 shares * $0.53 = $10.60 per quarter
            3L
        );

        StockDTO dto = stockService.createStock(3L, req);
        assertNotNull(dto);

        verify(recurringTransactionRepository).save(
            argThat(r ->
                r.getUser().equals(user) &&
                r.getKind() == TransactionKind.income &&
                r.getDescription().equals("KO Dividend") &&
                r.getAmount().compareTo(new BigDecimal("10.60")) == 0 &&
                r.getFrequency() == RecurrenceFrequency.quarterly &&
                r.getIntervalCount() == 1 &&
                r.getIsActive() &&
                r.getStartDate() != null &&
                r.getNextDueDate() != null
            )
        );
    }

    @Test
    void createStock_withMonthlyDividend_setsMonthlyRecurrence() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));
        when(stockRepository.save(any(Stock.class))).thenAnswer(i -> {
            Stock s = i.getArgument(0);
            s.setId(101L);
            return s;
        });

        CreateStockRequest req = new CreateStockRequest(
            "O",
            "Realty Income",
            "NYSE",
            true,
            DividendFrequency.monthly,
            new BigDecimal("0.26"),
            new BigDecimal("55.00"),
            new BigDecimal("50"), // 50 shares * $0.26 = $13.00 monthly
            3L
        );

        stockService.createStock(3L, req);

        verify(recurringTransactionRepository).save(
            argThat(r ->
                r.getKind() == TransactionKind.income &&
                r.getDescription().equals("O Dividend") &&
                r.getAmount().compareTo(new BigDecimal("13.00")) == 0 &&
                r.getFrequency() == RecurrenceFrequency.monthly &&
                r.getIntervalCount() == 1
            )
        );
    }

    @Test
    void createStock_withSemiannualDividend_setsIntervalCount6() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));
        when(stockRepository.save(any(Stock.class))).thenAnswer(i -> {
            Stock s = i.getArgument(0);
            s.setId(102L);
            return s;
        });

        CreateStockRequest req = new CreateStockRequest(
            "BOND",
            "Bond Fund",
            "NYSE",
            true,
            DividendFrequency.semiannual,
            new BigDecimal("1.50"),
            new BigDecimal("100.00"),
            new BigDecimal("10"), // 10 shares * $1.50 = $15.00 semiannually
            3L
        );

        stockService.createStock(3L, req);

        verify(recurringTransactionRepository).save(
            argThat(r ->
                r.getFrequency() == RecurrenceFrequency.monthly &&
                r.getIntervalCount() == 6 &&
                r.getAmount().compareTo(new BigDecimal("15.00")) == 0
            )
        );
    }

    @Test
    void createStock_withZeroShares_doesNotCreateRecurringTransaction() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));
        when(stockRepository.save(any(Stock.class))).thenAnswer(i -> {
            Stock s = i.getArgument(0);
            s.setId(103L);
            return s;
        });

        CreateStockRequest req = new CreateStockRequest(
            "AAPL",
            "Apple Inc.",
            "NASDAQ",
            true,
            DividendFrequency.quarterly,
            new BigDecimal("0.25"),
            new BigDecimal("180.00"),
            BigDecimal.ZERO, // 0 shares
            3L
        );

        stockService.createStock(3L, req);

        verify(recurringTransactionRepository, never()).save(any());
    }

    @Test
    void createStock_withoutDividend_doesNotCreateRecurringTransaction() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));
        when(stockRepository.save(any(Stock.class))).thenAnswer(i -> {
            Stock s = i.getArgument(0);
            s.setId(104L);
            return s;
        });

        CreateStockRequest req = new CreateStockRequest(
            "TSLA",
            "Tesla Inc.",
            "NASDAQ",
            false,
            null,
            null,
            new BigDecimal("220.00"),
            new BigDecimal("15"),
            3L
        );

        stockService.createStock(3L, req);

        verify(recurringTransactionRepository, never()).save(any());
    }

    @Test
    void createStock_secondLot_updatesExistingRecurringDividendWithTotalShares() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(user));

        Stock lot1 = new Stock();
        lot1.setId(10L);
        lot1.setUser(user);
        lot1.setTicker("AAPL");
        lot1.setPaysDividend(true);
        lot1.setDividendPerShare(new BigDecimal("0.50"));

        Stock lot2 = new Stock();
        lot2.setId(20L);
        lot2.setUser(user);
        lot2.setTicker("AAPL");
        lot2.setPaysDividend(true);
        lot2.setDividendPerShare(new BigDecimal("0.50"));

        when(stockRepository.save(any(Stock.class))).thenReturn(lot2);
        when(stockRepository.findByUserIdAndTicker(3L, "AAPL")).thenReturn(List.of(lot1, lot2));

        // Lot 1 has 10 shares from buy transaction
        StockTransaction t1 = new StockTransaction();
        t1.setType(StockTxnType.buy);
        t1.setQuantity(new BigDecimal("10"));
        when(stockTransactionRepository.findByUserIdAndStockId(3L, 10L)).thenReturn(List.of(t1));

        RecurringTransaction existingDiv = new RecurringTransaction();
        existingDiv.setId(500L);
        existingDiv.setDescription("AAPL Dividend");
        existingDiv.setAmount(new BigDecimal("5.00"));
        existingDiv.setIsActive(true);
        when(recurringTransactionRepository.findByUserId(3L)).thenReturn(List.of(existingDiv));

        // Adding second lot with 5 shares
        CreateStockRequest req = new CreateStockRequest(
            "AAPL",
            "Apple Lot 2",
            "NASDAQ",
            true,
            DividendFrequency.quarterly,
            new BigDecimal("0.50"),
            new BigDecimal("180.00"),
            new BigDecimal("5"),
            3L
        );

        stockService.createStock(3L, req);

        // Total shares = 10 (lot 1) + 5 (lot 2) = 15. Total dividend = 15 * 0.50 = 7.50
        assertEquals(new BigDecimal("7.50"), existingDiv.getAmount());
        verify(recurringTransactionRepository).save(existingDiv);
    }

    @Test
    void deleteStock_whenOtherPayingLotRemains_updatesRecurringDividend() {
        Stock lot1 = new Stock();
        lot1.setId(10L);
        lot1.setUser(user);
        lot1.setTicker("AAPL");
        lot1.setPaysDividend(true);
        lot1.setDividendPerShare(new BigDecimal("0.50"));

        Stock lot2 = new Stock();
        lot2.setId(20L);
        lot2.setUser(user);
        lot2.setTicker("AAPL");
        lot2.setPaysDividend(true);
        lot2.setDividendPerShare(new BigDecimal("0.50"));

        when(stockRepository.findByIdAndUserId(10L, 3L)).thenReturn(Optional.of(lot1));
        when(stockRepository.findByUserIdAndTicker(3L, "AAPL")).thenReturn(List.of(lot1, lot2));

        // Remaining lot2 has 5 shares
        StockTransaction t2 = new StockTransaction();
        t2.setType(StockTxnType.buy);
        t2.setQuantity(new BigDecimal("5"));
        when(stockTransactionRepository.findByUserIdAndStockId(3L, 20L)).thenReturn(List.of(t2));

        RecurringTransaction existingDiv = new RecurringTransaction();
        existingDiv.setId(500L);
        existingDiv.setDescription("AAPL Dividend");
        existingDiv.setAmount(new BigDecimal("7.50"));
        existingDiv.setIsActive(true);
        when(recurringTransactionRepository.findByUserId(3L)).thenReturn(List.of(existingDiv));

        stockService.deleteStock(3L, 10L);

        // After deleting lot 1, remaining dividend for lot 2 (5 shares * $0.50) is $2.50
        assertEquals(new BigDecimal("2.50"), existingDiv.getAmount());
        verify(recurringTransactionRepository).save(existingDiv);
        verify(stockRepository).delete(lot1);
    }
}
