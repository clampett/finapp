package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.CreateStockRequest;
import com.finapp.javabackend.dto.StockDTO;
import com.finapp.javabackend.dto.UpdateStockRequest;
import java.util.List;

public interface StockService {
    List<StockDTO> getStocks(Long userId);
    StockDTO getStock(Long userId, Long stockId);
    StockDTO getStockByTicker(Long userId, String ticker);
    StockDTO createStock(Long userId, CreateStockRequest request);
    StockDTO updateStock(Long userId, Long stockId, UpdateStockRequest request);
    void deleteStock(Long userId, Long stockId);
    void updateAllStockPricesForUser(Long userId);
}

