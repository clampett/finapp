package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.StockPositionDTO;
import java.util.List;

public interface StockPositionService {
    List<StockPositionDTO> getPositions(Long userId);
    StockPositionDTO getPositionForStock(Long userId, Long stockId);
}

