package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.dto.LoginRequest;
import com.finapp.javabackend.dto.LoginResponse;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.repository.UserRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Optional;

@RestController
@RequestMapping("/api/v1/auth")
@CrossOrigin(origins = "*")
public class AuthController {
package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
}
    private final UserRepository userRepository;

    public AuthController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<LoginResponse>> login(
            @RequestBody LoginRequest request) {

        if (!"demo123".equals(request.password())) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("Invalid username or password"));
        }

        Optional<User> user =
                userRepository.findByUsername(request.username());

        if (user.isEmpty()) {
            return ResponseEntity.status(401)
                    .body(ApiResponse.error("Invalid username or password"));
        }

        User foundUser = user.get();

        LoginResponse response = new LoginResponse(
                foundUser.getId(),
                foundUser.getUsername(),
                foundUser.getEmail()
        );

        return ResponseEntity.ok(
                ApiResponse.success(response, "Login successful")
        );
    }
}