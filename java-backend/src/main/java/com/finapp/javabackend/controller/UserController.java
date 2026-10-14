package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;

@RestController
@RequestMapping("/api/v1/user")
@CrossOrigin(origins = "*")
public class UserController {

    @Autowired
    private UserRepository userRepository;

    @GetMapping("/profile")
    public ResponseEntity<ApiResponse<User>> getProfile(Principal principal) {
        try {
            User user = userRepository.findByUsername(principal.getName())
                    .orElseThrow(() -> new RuntimeException("User not found"));
            return ResponseEntity.ok(
                    ApiResponse.success(user, "User profile retrieved successfully")
            );
        } catch (Exception e) {
            return ResponseEntity.status(404)
                    .body(ApiResponse.error("User profile not found"));
        }
    }

    // This endpoint is a placeholder that should be expanded to load financial data
    @GetMapping("/financial-data")
    public ResponseEntity<ApiResponse<String>> getFinancialData(Principal principal) {
        try {
            User user = userRepository.findByUsername(principal.getName())
                    .orElseThrow(() -> new RuntimeException("User not found"));
            
            // In a real implementation, this would return the complete user financial data
            // including nodes and graphs associated with this user
            return ResponseEntity.ok(
                    ApiResponse.success("Financial data loaded for user " + user.getUsername(), 
                                      "Data retrieved successfully")
            );
        } catch (Exception e) {
            return ResponseEntity.status(404)
                    .body(ApiResponse.error("User financial data not found"));
        }
    }
}