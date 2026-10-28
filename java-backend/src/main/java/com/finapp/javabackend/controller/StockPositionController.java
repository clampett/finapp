package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.config.SessionUser;
import com.finapp.javabackend.dto.StockPositionDTO;
import com.finapp.javabackend.service.StockPositionService;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
public class StockPositionController {

    private final StockPositionService stockPositionService;

    public StockPositionController(StockPositionService stockPositionService) {
        this.stockPositionService = stockPositionService;
    }

    private Long getUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to access stock positions.");
        }
        return user.id();
    }

    @GetMapping({"/api/v1/positions", "/api/v1/stocks/positions"})
    public ResponseEntity<ApiResponse<List<StockPositionDTO>>> getPositions(Authentication authentication) {
        Long userId = getUserId(authentication);
        List<StockPositionDTO> positions = stockPositionService.getPositions(userId);
        return ResponseEntity.ok(ApiResponse.success(positions, "Stock positions fetched successfully"));
    }

    @GetMapping({"/api/v1/positions/{stockId}", "/api/v1/stocks/positions/{stockId}"})
    public ResponseEntity<ApiResponse<StockPositionDTO>> getPositionForStock(
        @PathVariable Long stockId,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        StockPositionDTO position = stockPositionService.getPositionForStock(userId, stockId);
        return ResponseEntity.ok(ApiResponse.success(position, "Stock position fetched successfully"));
    }
}

