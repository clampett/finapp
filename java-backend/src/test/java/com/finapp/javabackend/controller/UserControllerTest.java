package com.finapp.javabackend.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.common.ApiResponse;
import com.finapp.javabackend.config.SessionUser;
import com.finapp.javabackend.dto.UpdateUserProfileRequest;
import com.finapp.javabackend.dto.UserProfileDTO;
import com.finapp.javabackend.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class UserControllerTest {

    @Mock
    private UserService userService;

    @Mock
    private Authentication authentication;

    private UserController userController;

    private final SessionUser sessionUser = new SessionUser(15L, "johndoe");

    @BeforeEach
    void setUp() {
        userController = new UserController(userService);
    }

    @Test
    void getProfile_authenticated_returnsProfile() {
        when(authentication.getPrincipal()).thenReturn(sessionUser);
        UserProfileDTO mockProfile = new UserProfileDTO(15L, "johndoe", "john@example.com", "John Doe", null);
        when(userService.getProfile(15L)).thenReturn(mockProfile);

        ResponseEntity<ApiResponse<UserProfileDTO>> response = userController.getProfile(authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertTrue(response.getBody().isSuccess());
        assertEquals("John Doe", response.getBody().getData().displayName());
    }

    @Test
    void getProfile_unauthenticated_throwsUnauthorized() {
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
            userController.getProfile(null)
        );
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
    }

    @Test
    void updateProfile_authenticated_returnsUpdatedProfile() {
        when(authentication.getPrincipal()).thenReturn(sessionUser);
        UpdateUserProfileRequest request = new UpdateUserProfileRequest("Johnny", "data:image/png;base64,xyz");
        UserProfileDTO mockProfile = new UserProfileDTO(15L, "johndoe", "john@example.com", "Johnny", "data:image/png;base64,xyz");
        when(userService.updateProfile(15L, request)).thenReturn(mockProfile);

        ResponseEntity<ApiResponse<UserProfileDTO>> response = userController.updateProfile(request, authentication);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
        assertEquals("Johnny", response.getBody().getData().displayName());
        assertEquals("data:image/png;base64,xyz", response.getBody().getData().profilePicture());
    }

    @Test
    void updateProfile_unauthenticated_throwsUnauthorized() {
        UpdateUserProfileRequest request = new UpdateUserProfileRequest("Johnny", null);
        ResponseStatusException ex = assertThrows(ResponseStatusException.class, () ->
            userController.updateProfile(request, null)
        );
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatusCode());
    }
}

