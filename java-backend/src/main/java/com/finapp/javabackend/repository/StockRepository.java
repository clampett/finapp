package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.Stock;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StockRepository extends JpaRepository<Stock, Long> {
    List<Stock> findByUserId(Long userId);
    Optional<Stock> findByIdAndUserId(Long id, Long userId);
    Optional<Stock> findByUserIdAndTicker(Long userId, String ticker);
    boolean existsByUserIdAndTicker(Long userId, String ticker);
}
