package com.finapp.javabackend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.dto.UpdateUserProfileRequest;
import com.finapp.javabackend.dto.UserProfileDTO;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.service.impl.UserServiceImpl;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class UserServiceTest {

    @Mock
    private UserRepository userRepository;

    private UserService userService;

    private User user;

    @BeforeEach
    void setUp() {
        userService = new UserServiceImpl(userRepository);
        user = new User();
        user.setId(42L);
        user.setUsername("testuser");
        user.setEmail("testuser@example.com");
    }

    @Test
    void getProfile_success_defaultsDisplayNameToUsername() {
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));

        UserProfileDTO profile = userService.getProfile(42L);

        assertNotNull(profile);
        assertEquals(42L, profile.id());
        assertEquals("testuser", profile.username());
        assertEquals("testuser@example.com", profile.email());
        assertEquals("testuser", profile.displayName());
        assertNull(profile.profilePicture());
    }

    @Test
    void getProfile_userNotFound_throwsNotFound() {
        when(userRepository.findById(999L)).thenReturn(Optional.empty());

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
            userService.getProfile(999L)
        );
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    void updateProfile_success_updatesDisplayNameAndPicture() {
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        String photoUri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        UpdateUserProfileRequest request = new UpdateUserProfileRequest("Alex Developer", photoUri);

        UserProfileDTO updated = userService.updateProfile(42L, request);

        assertEquals("Alex Developer", updated.displayName());
        assertEquals(photoUri, updated.profilePicture());
        assertEquals("Alex Developer", user.getDisplayName());
        assertEquals(photoUri, user.getProfilePicture());
    }

    @Test
    void updateProfile_clearProfilePicture_setsNull() {
        user.setProfilePicture("data:image/png;base64,abc");
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));
        when(userRepository.save(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));

        UpdateUserProfileRequest request = new UpdateUserProfileRequest(null, "");

        UserProfileDTO updated = userService.updateProfile(42L, request);

        assertNull(updated.profilePicture());
        assertNull(user.getProfilePicture());
    }

    @Test
    void updateProfile_blankDisplayName_throwsBadRequest() {
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));

        UpdateUserProfileRequest request = new UpdateUserProfileRequest("   ", null);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
            userService.updateProfile(42L, request)
        );
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("cannot be empty"));
    }

    @Test
    void updateProfile_displayNameTooLong_throwsBadRequest() {
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));

        String tooLong = "A".repeat(51);
        UpdateUserProfileRequest request = new UpdateUserProfileRequest(tooLong, null);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
            userService.updateProfile(42L, request)
        );
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("cannot exceed 50 characters"));
    }

    @Test
    void updateProfile_invalidProfilePictureFormat_throwsBadRequest() {
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));

        UpdateUserProfileRequest request = new UpdateUserProfileRequest("Alex", "http://evil.com/pic.png");

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
            userService.updateProfile(42L, request)
        );
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("valid image data URI"));
    }

    @Test
    void updateProfile_svgProfilePicture_throwsBadRequest() {
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));

        UpdateUserProfileRequest request = new UpdateUserProfileRequest(
            "Alex",
            "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+"
        );

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
            userService.updateProfile(42L, request)
        );
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("valid image data URI"));
    }

    @Test
    void updateProfile_profilePictureTooLarge_throwsBadRequest() {
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));

        String hugePic = "data:image/png;base64," + "A".repeat(7_000_001);
        UpdateUserProfileRequest request = new UpdateUserProfileRequest("Alex", hugePic);

        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
            userService.updateProfile(42L, request)
        );
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
        assertTrue(ex.getReason().contains("Profile picture exceeds maximum allowed size"));
    }

    @Test
    void updateProfile_nullRequest_returnsCurrentProfileWithoutSaving() {
        when(userRepository.findById(42L)).thenReturn(Optional.of(user));

        UserProfileDTO updated = userService.updateProfile(42L, null);

        assertNotNull(updated);
        assertEquals("testuser", updated.displayName());
        verify(userRepository, never()).save(any(User.class));
    }
}

