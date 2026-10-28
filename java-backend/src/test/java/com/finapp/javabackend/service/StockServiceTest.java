package com.finapp.javabackend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.dto.CreateStockRequest;
import com.finapp.javabackend.dto.StockDTO;
import com.finapp.javabackend.dto.UpdateStockRequest;
import com.finapp.javabackend.model.entity.Stock;
import com.finapp.javabackend.model.entity.StockTransaction;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.enums.DividendFrequency;
import com.finapp.javabackend.repository.StockRepository;
import com.finapp.javabackend.repository.StockTransactionRepository;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.service.impl.StockServiceImpl;
import java.math.BigDecimal;
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

    private StockService stockService;

    private User user;

    @BeforeEach
    void setUp() {
        stockService = new StockServiceImpl(stockRepository, stockTransactionRepository, userRepository);
        user = new User();
        user.setId(3L);
        user.setUsername("dave");
    }

    @Test
    void createStock_success() {
        when(stockRepository.existsByUserIdAndTicker(3L, "AAPL")).thenReturn(false);
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
    }

    @Test
    void createStock_duplicateTicker_throwsConflict() {
        when(stockRepository.existsByUserIdAndTicker(3L, "AAPL")).thenReturn(true);

        CreateStockRequest req = new CreateStockRequest(
            "aapl", null, null, false, null, null, null, null, 3L
        );

        assertThrows(ResponseStatusException.class, () -> stockService.createStock(3L, req));
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
            null, null, null, false, null, null, new BigDecimal("190.00"), null
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
}

