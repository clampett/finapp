package com.finapp.javabackend.controller;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.config.SessionUser;
import com.finapp.javabackend.dto.UpdateUserProfileRequest;
import com.finapp.javabackend.dto.UserProfileDTO;
import com.finapp.javabackend.service.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    private Long getUserId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in to access user settings.");
        }
        return user.id();
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<UserProfileDTO>> getProfile(Authentication authentication) {
        Long userId = getUserId(authentication);
        UserProfileDTO profile = userService.getProfile(userId);
        return ResponseEntity.ok(ApiResponse.success(profile, "User profile retrieved successfully"));
    }

    @PutMapping("/me")
    public ResponseEntity<ApiResponse<UserProfileDTO>> updateProfile(
        @RequestBody UpdateUserProfileRequest request,
        Authentication authentication
    ) {
        Long userId = getUserId(authentication);
        UserProfileDTO updated = userService.updateProfile(userId, request);
        return ResponseEntity.ok(ApiResponse.success(updated, "User profile updated successfully"));
    }
}

