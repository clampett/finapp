package com.finapp.javabackend.service.impl;

import com.finapp.javabackend.dto.StockPositionDTO;
import com.finapp.javabackend.model.entity.StockPosition;
import com.finapp.javabackend.repository.StockPositionRepository;
import com.finapp.javabackend.service.StockPositionService;
import com.finapp.javabackend.service.mapper.EntityDtoMapper;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class StockPositionServiceImpl implements StockPositionService {

    private final StockPositionRepository stockPositionRepository;

    public StockPositionServiceImpl(StockPositionRepository stockPositionRepository) {
        this.stockPositionRepository = stockPositionRepository;
    }

    @Override
    public List<StockPositionDTO> getPositions(Long userId) {
        return stockPositionRepository.findByUserId(userId).stream()
            .map(EntityDtoMapper::toDto)
            .toList();
    }

    @Override
    public StockPositionDTO getPositionForStock(Long userId, Long stockId) {
        StockPosition pos = stockPositionRepository.findByUserIdAndStockId(userId, stockId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Stock position not found"));
        return EntityDtoMapper.toDto(pos);
    }
}

