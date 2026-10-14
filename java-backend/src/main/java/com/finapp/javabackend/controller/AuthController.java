package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.dto.LoginRequest;
import com.finapp.javabackend.dto.LoginResponse;
import com.finapp.javabackend.dto.RegistrationRequest;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.service.AuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final AuthService authService;
    //private final UserRepository userRepository;

    public AuthController(AuthService authService, UserRepository userRepository) {
        this.authService = authService;
        //this.userRepository = userRepository;
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(
            @RequestBody LoginRequest request) {

        try {
            LoginResponse response = authService.authenticate(request);
            return ResponseEntity.ok(
                    ApiResponse.success(response, "Login successful")
            );
        } catch (Exception e) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("Invalid username or password"));
        }
    }

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<User>> register(
            @RequestBody RegistrationRequest request) {

        try {
            User user = authService.register(request);
            return ResponseEntity.ok(
                    ApiResponse.success(user, "Registration successful")
            );
        } catch (Exception e) {
            return ResponseEntity.status(400)
                    .body(ApiResponse.error(e.getMessage()));
        }
    }
}