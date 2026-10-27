package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.Stock;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StockRepository extends JpaRepository<Stock, Long> {
    List<Stock> findByUserId(Long userId);
}
