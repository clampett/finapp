package com.finapp.javabackend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.dto.GoogleAuthResult;
import com.finapp.javabackend.dto.GoogleUserInfo;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.entity.UserSession;
import com.finapp.javabackend.repository.AuthTokenRepository;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.repository.UserSessionRepository;
import com.finapp.javabackend.service.impl.GoogleAuthServiceImpl;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import java.security.GeneralSecurityException;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class GoogleAuthServiceTest {

    private GoogleIdTokenVerifier verifier;
    private UserRepository userRepository;
    private UserSessionRepository userSessionRepository;
    private AuthTokenRepository authTokenRepository;
    private BCryptPasswordEncoder passwordEncoder;
    private GoogleAuthServiceImpl service;

    @BeforeEach
    void setUp() {
        verifier = mock(GoogleIdTokenVerifier.class);
        userRepository = mock(UserRepository.class);
        userSessionRepository = mock(UserSessionRepository.class);
        authTokenRepository = mock(AuthTokenRepository.class);
        passwordEncoder = new BCryptPasswordEncoder();

        service = new GoogleAuthServiceImpl(
            verifier,
            userRepository,
            userSessionRepository,
            authTokenRepository,
            passwordEncoder
        );
    }

    @Test
    void verifyTokenReturnsEmptyWhenVerifierIsNull() {
        GoogleAuthServiceImpl unconfiguredService = new GoogleAuthServiceImpl(
            "",
            userRepository,
            userSessionRepository,
            authTokenRepository,
            passwordEncoder
        );
        Optional<GoogleUserInfo> result = unconfiguredService.verifyToken("dummy-token");
        assertTrue(result.isEmpty());
    }

    @Test
    void verifyTokenReturnsEmptyWhenTokenVerificationFailsOrThrows() throws Exception {
        when(verifier.verify("invalid-token")).thenReturn(null);
        assertTrue(service.verifyToken("invalid-token").isEmpty());

        when(verifier.verify("error-token")).thenThrow(new GeneralSecurityException("Signature invalid"));
        assertTrue(service.verifyToken("error-token").isEmpty());
    }

    @Test
    void verifyTokenReturnsUserInfoWhenVerificationSucceeds() throws Exception {
        GoogleIdToken idToken = mock(GoogleIdToken.class);
        GoogleIdToken.Payload payload = new GoogleIdToken.Payload();
        payload.setEmail("alice@example.com");
        payload.setEmailVerified(true);
        payload.set("name", "Alice Wonder");
        payload.set("picture", "https://example.com/alice.jpg");

        when(verifier.verify("valid-token")).thenReturn(idToken);
        when(idToken.getPayload()).thenReturn(payload);

        Optional<GoogleUserInfo> result = service.verifyToken("valid-token");
        assertTrue(result.isPresent());
        GoogleUserInfo info = result.get();
        assertEquals("alice@example.com", info.email());
        assertTrue(info.emailVerified());
        assertEquals("Alice Wonder", info.name());
        assertEquals("https://example.com/alice.jpg", info.pictureUrl());
    }

    @Test
    void authenticateOrCreateUserCreatesNewUserWithSanitizedUsernameAndProfile() {
        GoogleUserInfo userInfo = new GoogleUserInfo(
            "john.doe.very.long.email.address.exceeding.forty.characters@example.com",
            true,
            "John Doe With A Super Very Long Display Name Exceeding Fifty Characters Long",
            "https://example.com/johndoe.png"
        );

        when(userRepository.findByEmail(userInfo.email())).thenReturn(Optional.empty());
        when(userRepository.findByUsername(any())).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            u.setId(42L);
            return u;
        });

        GoogleAuthResult result = service.authenticateOrCreateUser(userInfo, "127.0.0.1");

        assertNotNull(result);
        assertEquals(42L, result.userId());
        assertNotNull(result.sessionToken());

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(userCaptor.capture());
        User savedUser = userCaptor.getValue();

        assertEquals(userInfo.email(), savedUser.getEmail());
        assertTrue(savedUser.getIsEmailVerified());
        assertFalse(savedUser.getIsArchetype());
        assertTrue(savedUser.getUsername().length() <= 50);
        assertTrue(savedUser.getDisplayName().length() <= 50);
        assertEquals("https://example.com/johndoe.png", savedUser.getProfilePicture());

        verify(userSessionRepository).save(any(UserSession.class));
    }

    @Test
    void authenticateOrCreateUserMitigatesPreAccountTakeoverOnUnverifiedUser() {
        User existingUnverifiedUser = new User();
        existingUnverifiedUser.setId(99L);
        existingUnverifiedUser.setEmail("victim@example.com");
        existingUnverifiedUser.setUsername("victim");
        String attackerPasswordHash = passwordEncoder.encode("attacker-secret-password");
        existingUnverifiedUser.setPasswordHash(attackerPasswordHash);
        existingUnverifiedUser.setIsEmailVerified(false);

        when(userRepository.findByEmail("victim@example.com")).thenReturn(Optional.of(existingUnverifiedUser));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        GoogleUserInfo userInfo = new GoogleUserInfo(
            "victim@example.com",
            true,
            "Victim Real",
            "https://example.com/pic.jpg"
        );

        GoogleAuthResult result = service.authenticateOrCreateUser(userInfo, "192.168.1.1");
        assertEquals(99L, result.userId());

        // Verify attacker's password was invalidated
        assertNotEquals(attackerPasswordHash, existingUnverifiedUser.getPasswordHash());
        assertFalse(passwordEncoder.matches("attacker-secret-password", existingUnverifiedUser.getPasswordHash()));
        assertTrue(existingUnverifiedUser.getIsEmailVerified());

        // Verify pending verification tokens were deleted
        verify(authTokenRepository).deleteByUserIdAndTokenType(99L, "EMAIL_VERIFICATION");
        verify(userSessionRepository).save(any(UserSession.class));
    }

    @Test
    void authenticateOrCreateUserPreservesExistingVerifiedUserPassword() {
        User existingVerifiedUser = new User();
        existingVerifiedUser.setId(101L);
        existingVerifiedUser.setEmail("owner@example.com");
        existingVerifiedUser.setUsername("owner");
        String legitimatePasswordHash = passwordEncoder.encode("legit-user-password");
        existingVerifiedUser.setPasswordHash(legitimatePasswordHash);
        existingVerifiedUser.setIsEmailVerified(true);

        when(userRepository.findByEmail("owner@example.com")).thenReturn(Optional.of(existingVerifiedUser));
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));

        GoogleUserInfo userInfo = new GoogleUserInfo(
            "owner@example.com",
            true,
            "Legit Owner",
            null
        );

        GoogleAuthResult result = service.authenticateOrCreateUser(userInfo, "10.0.0.1");
        assertEquals(101L, result.userId());

        // Password hash must NOT be changed for an already-verified user
        assertEquals(legitimatePasswordHash, existingVerifiedUser.getPasswordHash());
        assertTrue(passwordEncoder.matches("legit-user-password", existingVerifiedUser.getPasswordHash()));
        verify(authTokenRepository, never()).deleteByUserIdAndTokenType(any(), any());
    }

    @Test
    void authenticateOrCreateUserIncrementsSuffixWhenUsernameCollides() {
        when(userRepository.findByEmail("bob@example.com")).thenReturn(Optional.empty());
        when(userRepository.findByUsername("bob")).thenReturn(Optional.of(new User()));
        when(userRepository.findByUsername("bob1")).thenReturn(Optional.of(new User()));
        when(userRepository.findByUsername("bob2")).thenReturn(Optional.empty());
        when(userRepository.save(any(User.class))).thenAnswer(inv -> {
            User u = inv.getArgument(0);
            u.setId(77L);
            return u;
        });

        GoogleUserInfo userInfo = new GoogleUserInfo("bob@example.com", true, "Bob", null);
        GoogleAuthResult result = service.authenticateOrCreateUser(userInfo, "127.0.0.1");
        assertNotNull(result);

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        assertEquals("bob2", captor.getValue().getUsername());
    }
}
