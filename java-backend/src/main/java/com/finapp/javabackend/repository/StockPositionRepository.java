package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.StockPosition;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StockPositionRepository extends JpaRepository<StockPosition, Long> {
    List<StockPosition> findByUserId(Long userId);
    Optional<StockPosition> findByUserIdAndStockId(Long userId, Long stockId);
}
