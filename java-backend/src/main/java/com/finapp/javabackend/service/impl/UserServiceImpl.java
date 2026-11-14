package com.finapp.javabackend.service.impl;

import com.finapp.javabackend.dto.UpdateUserProfileRequest;
import com.finapp.javabackend.dto.UserProfileDTO;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.service.UserService;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Base64;
import java.util.Locale;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class UserServiceImpl implements UserService {

    private static final int MAX_DISPLAY_NAME_LENGTH = 50;
    private static final int MAX_PROFILE_PICTURE_BYTES = 3 * 1024 * 1024;
    private static final int MAX_PROFILE_PICTURE_DIMENSION = 2048;
    private static final int MAX_PROFILE_PICTURE_LENGTH =
        4 * ((MAX_PROFILE_PICTURE_BYTES + 2) / 3) + 23;
    private static final Pattern DATA_URI_PATTERN = Pattern.compile(
        "^data:image/(png|jpeg|gif);base64,[A-Za-z0-9+/=]+$"
    );

    private final UserRepository userRepository;

    public UserServiceImpl(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    private String effectiveDisplayName(User user) {
        return user.getDisplayName() != null && !user.getDisplayName().isBlank()
            ? user.getDisplayName()
            : user.getUsername();
    }

    private void validatePicture(String picture) {
        if (picture.length() > MAX_PROFILE_PICTURE_LENGTH) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "Profile picture exceeds maximum allowed size"
            );
        }

        var match = DATA_URI_PATTERN.matcher(picture);
        if (!match.matches()) {
            throw invalidPicture();
        }

        // Bounded decoded bytes and dimensions before the image was decompressed.
        try {
            byte[] bytes = Base64.getDecoder().decode(
                picture.substring(match.end(1) + ";base64,".length())
            );
            if (bytes.length > MAX_PROFILE_PICTURE_BYTES) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Profile picture exceeds maximum allowed size"
                );
            }
            try (var stream = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(stream);
                if (!readers.hasNext()) {
                    throw invalidPicture();
                }
                var reader = readers.next();
                try {
                    reader.setInput(stream, true, true);
                    String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                    if (!match.group(1).equals(format)) {
                        throw invalidPicture();
                    }
                    if (
                        reader.getWidth(0) > MAX_PROFILE_PICTURE_DIMENSION ||
                        reader.getHeight(0) > MAX_PROFILE_PICTURE_DIMENSION
                    ) {
                        throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Profile picture cannot exceed 2048 by 2048 pixels"
                        );
                    }
                    reader.read(0).flush();
                } finally {
                    reader.dispose();
                }
            }
        } catch (IOException | IllegalArgumentException e) {
            throw invalidPicture();
        }
    }

    private ResponseStatusException invalidPicture() {
        return new ResponseStatusException(
            HttpStatus.BAD_REQUEST,
            "Profile picture must be a valid image data URI"
        );
    }

    @Override
    @Transactional(readOnly = true)
    public UserProfileDTO getProfile(Long userId) {
        User user = userRepository
            .findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        return new UserProfileDTO(
            user.getId(),
            user.getUsername(),
            user.getEmail(),
            effectiveDisplayName(user),
            user.getProfilePicture()
        );
    }

    @Override
    @Transactional
    public UserProfileDTO updateProfile(Long userId, UpdateUserProfileRequest request) {
        User user = userRepository
            .findById(userId)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        if (request == null) {
            return new UserProfileDTO(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                effectiveDisplayName(user),
                user.getProfilePicture()
            );
        }

        if (request.displayName() != null) {
            String trimmed = request.displayName().trim();
            if (trimmed.isEmpty()) {
                throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Display name cannot be empty"
                );
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
                validatePicture(pic);
                user.setProfilePicture(pic);
            }
        }

        User saved = userRepository.save(user);

        return new UserProfileDTO(
            saved.getId(),
            saved.getUsername(),
            saved.getEmail(),
            effectiveDisplayName(saved),
            saved.getProfilePicture()
        );
    }
}
