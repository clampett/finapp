package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.StockTransaction;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StockTransactionRepository extends JpaRepository<StockTransaction, Long> {
    List<StockTransaction> findByUserId(Long userId);
    List<StockTransaction> findByStockId(Long stockId);
}
