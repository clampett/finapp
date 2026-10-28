package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.CreateStockTransactionRequest;
import com.finapp.javabackend.dto.StockTransactionDTO;
import java.util.List;

public interface StockTransactionService {
    List<StockTransactionDTO> getStockTransactions(Long userId, Long stockId);
    StockTransactionDTO getStockTransaction(Long userId, Long id);
    StockTransactionDTO createStockTransaction(Long userId, CreateStockTransactionRequest request);
    void deleteStockTransaction(Long userId, Long id);
}

