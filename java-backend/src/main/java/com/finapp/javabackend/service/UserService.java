package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.UpdateUserProfileRequest;
import com.finapp.javabackend.dto.UserProfileDTO;

public interface UserService {
    UserProfileDTO getProfile(Long userId);
    UserProfileDTO updateProfile(Long userId, UpdateUserProfileRequest request);
}

