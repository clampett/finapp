package com.finapp.javabackend.service.impl;

import com.finapp.javabackend.dto.UpdateUserProfileRequest;
import com.finapp.javabackend.dto.UserProfileDTO;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.service.UserService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class UserServiceImpl implements UserService {

    private static final int MAX_DISPLAY_NAME_LENGTH = 100;
    private static final int MAX_PROFILE_PICTURE_LENGTH = 7_000_000; // ~5MB base64

    private final UserRepository userRepository;

    public UserServiceImpl(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public UserProfileDTO getProfile(Long userId) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        String effectiveDisplayName = user.getDisplayName() != null && !user.getDisplayName().isBlank()
            ? user.getDisplayName()
            : user.getUsername();

        return new UserProfileDTO(
            user.getId(),
            user.getUsername(),
            user.getEmail(),
            effectiveDisplayName,
            user.getProfilePicture()
        );
    }

    @Override
    @Transactional
    public UserProfileDTO updateProfile(Long userId, UpdateUserProfileRequest request) {
        User user = userRepository.findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        if (request != null) {
            if (request.displayName() != null) {
                String trimmed = request.displayName().trim();
                if (trimmed.isEmpty()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Display name cannot be empty");
                }
                if (trimmed.length() > MAX_DISPLAY_NAME_LENGTH) {
                    throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Display name cannot exceed " + MAX_DISPLAY_NAME_LENGTH + " characters"
                    );
                }
                user.setDisplayName(trimmed);
            }

            if (request.profilePicture() != null) {
                String pic = request.profilePicture().trim();
                if (pic.isEmpty()) {
                    user.setProfilePicture(null);
                } else {
                    if (pic.length() > MAX_PROFILE_PICTURE_LENGTH) {
                        throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Profile picture exceeds maximum allowed size"
                        );
                    }
                    if (!pic.startsWith("data:image/")) {
                        throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Profile picture must be a valid image data URI"
                        );
                    }
                    user.setProfilePicture(pic);
                }
            }
        }

        User saved = userRepository.save(user);

        String effectiveDisplayName = saved.getDisplayName() != null && !saved.getDisplayName().isBlank()
            ? saved.getDisplayName()
            : saved.getUsername();

        return new UserProfileDTO(
            saved.getId(),
            saved.getUsername(),
            saved.getEmail(),
            effectiveDisplayName,
            saved.getProfilePicture()
        );
    }
}

