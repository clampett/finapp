package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.StockTransaction;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StockTransactionRepository extends JpaRepository<StockTransaction, Long> {
    List<StockTransaction> findByUserId(Long userId);
    List<StockTransaction> findByStockId(Long stockId);
    List<StockTransaction> findByUserIdAndStockId(Long userId, Long stockId);
    Optional<StockTransaction> findByIdAndUserId(Long id, Long userId);
}
