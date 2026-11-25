package com.finapp.javabackend.controller;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.dto.AuthRequest;
import com.finapp.javabackend.dto.GoogleAuthResult;
import com.finapp.javabackend.dto.GoogleUserInfo;
import com.finapp.javabackend.model.entity.AuthToken;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.repository.*;
import com.finapp.javabackend.service.EmailService;
import com.finapp.javabackend.service.GoogleAuthService;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

class LocalAuthTest {

    AuthController controller;
    UserRepository users;
    AuthTokenRepository tokens;
    UserSessionRepository sessions;
    EmailService emails;
    GoogleAuthService googleAuthService;
    BCryptPasswordEncoder passwords = new BCryptPasswordEncoder();
    User user;

    @BeforeEach
    void setup() {
        controller = new AuthController();
        users = mock(UserRepository.class);
        tokens = mock(AuthTokenRepository.class);
        sessions = mock(UserSessionRepository.class);
        emails = mock(EmailService.class);
        googleAuthService = mock(GoogleAuthService.class);
        ReflectionTestUtils.setField(controller, "userRepository", users);
        ReflectionTestUtils.setField(controller, "authTokenRepository", tokens);
        ReflectionTestUtils.setField(controller, "userSessionRepository", sessions);
        ReflectionTestUtils.setField(controller, "emailService", emails);
        ReflectionTestUtils.setField(controller, "passwordEncoder", passwords);
        ReflectionTestUtils.setField(controller, "googleAuthService", googleAuthService);
        user = new User();
        user.setId(10L);
        user.setUsername("testuser");
        user.setEmail("testuser@finapp.test");
        user.setPasswordHash(passwords.encode("test123"));
        when(users.findByUsername("testuser")).thenReturn(Optional.of(user));
    }

    AuthRequest login(String password) {
        AuthRequest request = new AuthRequest();
        request.setUsername("testuser");
        request.setPassword(password);
        return request;
    }

    @Test
    void testAccountUsesRealPasswordAndSessionCookie() {
        user.setIsEmailVerified(true);
        var result = controller.login(login("test123"), new MockHttpServletRequest());
        assertEquals(200, result.getStatusCode().value());
        assertTrue(result.getHeaders().getFirst("Set-Cookie").contains("HttpOnly"));
        assertFalse(result.getHeaders().getFirst("Set-Cookie").contains("Max-Age"));
        assertNotNull(result.getBody().getSessionToken());
        verify(sessions).save(any());
        assertEquals(
            401,
            controller.login(login("wrong"), new MockHttpServletRequest()).getStatusCode().value()
        );
    }

    @Test
    void unverifiedLoginDoesNotCreateSessionAndCanResumeVerification() {
        var result = controller.login(login("test123"), new MockHttpServletRequest());
        assertEquals(403, result.getStatusCode().value());
        assertEquals(10L, result.getBody().getUserId());
        verifyNoInteractions(sessions);
    }

    @Test
    void registrationHashesPasswordAndDeliversAccountBoundCode() {
        AuthRequest request = new AuthRequest();
        request.setUsername("newuser");
        request.setEmail("newuser@example.test");
        request.setPassword("new123");
        when(users.save(any())).thenAnswer(call -> {
            User u = call.getArgument(0);
            u.setId(11L);
            return u;
        });
        when(emails.generateSixDigitCode()).thenReturn("123456");
        assertEquals(200, controller.register(request).getStatusCode().value());
        verify(users).save(
            argThat(
                u -> passwords.matches("new123", u.getPasswordHash()) && !u.getIsEmailVerified()
            )
        );
        verify(tokens).save(
            argThat(t -> t.getUser().getId() == 11L && t.getToken().equals("123456"))
        );
        verify(emails).sendVerificationEmail("newuser@example.test", "123456");
    }

    @Test
    void verificationRejectsAnotherAccountsCodeAndExpiredCodes() {
        assertEquals(
            400,
            controller
                .verifyEmail(Map.of("userId", "10", "token", "123456"))
                .getStatusCode()
                .value()
        );
        AuthToken expired = new AuthToken();
        expired.setUser(user);
        expired.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        when(
            tokens.findByUserIdAndTokenAndTokenType(10L, "123456", "EMAIL_VERIFICATION")
        ).thenReturn(Optional.of(expired));
        assertEquals(
            400,
            controller
                .verifyEmail(Map.of("userId", "10", "token", "123456"))
                .getStatusCode()
                .value()
        );
        verify(users, never()).save(any());
    }

    @Test
    void validCodeVerifiesOnlyItsAccountAndClearsPendingCodes() {
        AuthToken token = new AuthToken();
        token.setUser(user);
        token.setExpiresAt(LocalDateTime.now().plusMinutes(15));
        when(
            tokens.findByUserIdAndTokenAndTokenType(10L, "123456", "EMAIL_VERIFICATION")
        ).thenReturn(Optional.of(token));
        assertEquals(
            200,
            controller
                .verifyEmail(Map.of("userId", "10", "token", "123456"))
                .getStatusCode()
                .value()
        );
        assertTrue(user.getIsEmailVerified());
        verify(tokens).deleteByUserIdAndTokenType(10L, "EMAIL_VERIFICATION");
    }

    @Test
    void resendReplacesOldCodes() {
        when(users.findById(10L)).thenReturn(Optional.of(user));
        when(emails.generateSixDigitCode()).thenReturn("654321");
        assertEquals(
            200,
            controller.resendVerification(Map.of("userId", "10")).getStatusCode().value()
        );
        var order = inOrder(tokens);
        order.verify(tokens).deleteByUserIdAndTokenType(10L, "EMAIL_VERIFICATION");
        order.verify(tokens).flush();
        order.verify(tokens).save(any());
        verify(emails).sendVerificationEmail(user.getEmail(), "654321");
    }

    @Test
    void logoutDeletesTheServerSessionAndExpiresTheCookie() {
        String token = "12345678-1234-1234-1234-123456789abc";
        var result = controller.logout(Map.of("sessionToken", token), token);
        assertEquals(204, result.getStatusCode().value());
        verify(sessions).deleteByToken(token);
        assertTrue(result.getHeaders().getFirst("Set-Cookie").contains("Max-Age=0"));
    }

    @Test
    void delayedLogoutDoesNotClearANewerLoginCookie() {
        String token = "12345678-1234-1234-1234-123456789abc";
        var result = controller.logout(
            Map.of("sessionToken", token),
            "abcdefab-1234-1234-1234-123456789abc"
        );
        assertNull(result.getHeaders().getFirst("Set-Cookie"));
        verify(sessions).deleteByToken(token);
    }

    @Test
    void googleAuthRejectsMissingToken() {
        var missing = controller.googleAuth(Map.of(), googleRequest());
        assertEquals(400, missing.getStatusCode().value());
        assertTrue(missing.getBody().getMessage().contains("Google ID token is required"));

        var empty = controller.googleAuth(Map.of("token", "   "), googleRequest());
        assertEquals(400, empty.getStatusCode().value());
    }

    @Test
    void googleAuthRejectsInvalidToken() {
        when(
            googleAuthService.verifyToken("bad-token", "00000000-0000-0000-0000-000000000001")
        ).thenReturn(Optional.empty());
        var result = controller.googleAuth(Map.of("token", "bad-token"), googleRequest());
        assertEquals(401, result.getStatusCode().value());
        assertTrue(result.getBody().getMessage().contains("Invalid or expired Google token"));
    }

    @Test
    void googleAuthRejectsUnverifiedEmail() {
        when(
            googleAuthService.verifyToken(
                "unverified-token",
                "00000000-0000-0000-0000-000000000001"
            )
        ).thenReturn(
            Optional.of(
                new GoogleUserInfo(
                    "google-test-subject",
                    "alice@example.com",
                    false,
                    "Alice",
                    null,
                    "example.com"
                )
            )
        );
        var result = controller.googleAuth(Map.of("token", "unverified-token"), googleRequest());
        assertEquals(400, result.getStatusCode().value());
        assertTrue(result.getBody().getMessage().contains("Unverified email"));
    }

    @Test
    void googleAuthLogsInSuccessfullyAndSetsHttpOnlyCookie() {
        GoogleUserInfo userInfo = new GoogleUserInfo(
            "google-test-subject",
            "alice@example.com",
            true,
            "Alice",
            "https://pic.url",
            "example.com"
        );
        when(
            googleAuthService.verifyToken("good-token", "00000000-0000-0000-0000-000000000001")
        ).thenReturn(Optional.of(userInfo));
        when(googleAuthService.authenticateOrCreateUser(eq(userInfo), any())).thenReturn(
            new GoogleAuthResult(25L, "mock-google-session-token")
        );

        var result = controller.googleAuth(Map.of("token", "good-token"), googleRequest());
        assertEquals(200, result.getStatusCode().value());
        assertEquals(25L, result.getBody().getUserId());
        assertEquals("mock-google-session-token", result.getBody().getSessionToken());
        assertTrue(
            result
                .getHeaders()
                .getFirst("Set-Cookie")
                .contains("finapp_session=mock-google-session-token")
        );
        assertTrue(result.getHeaders().getFirst("Set-Cookie").contains("HttpOnly"));
        assertTrue(result.getHeaders().getFirst("Set-Cookie").contains("SameSite=Strict"));
    }

    private MockHttpServletRequest googleRequest() {
        var request = new MockHttpServletRequest();
        request.setCookies(
            new jakarta.servlet.http.Cookie(
                "finapp_google_nonce",
                "00000000-0000-0000-0000-000000000001"
            )
        );
        return request;
    }

    @Test
    void googleConfigIssuedAnExpiringBrowserChallengeFromTheBackendClientId() {
        ReflectionTestUtils.setField(
            controller,
            "googleClientId",
            "test.apps.googleusercontent.com"
        );
        var response = controller.googleConfig();
        assertEquals("test.apps.googleusercontent.com", response.getBody().get("clientId"));
        assertEquals(true, response.getBody().get("enabled"));
        assertEquals("no-store", response.getHeaders().getCacheControl());
        String nonce = (String) response.getBody().get("nonce");
        assertNotNull(java.util.UUID.fromString(nonce));
        String cookie = response.getHeaders().getFirst("Set-Cookie");
        assertTrue(cookie.contains("finapp_google_nonce=" + nonce));
        assertTrue(cookie.contains("HttpOnly"));
        assertTrue(cookie.contains("Max-Age=600"));
    }

    @Test
    void googleAuthRejectedCredentialsWithoutTheInitiatingBrowserCookie() {
        var response = controller.googleAuth(
            Map.of("token", "signed-token"),
            new MockHttpServletRequest()
        );
        assertEquals(401, response.getStatusCode().value());
        verifyNoInteractions(googleAuthService);
    }

    @Test
    void googleConfigReportedDisabledWhenTheClientWasUnconfigured() {
        ReflectionTestUtils.setField(controller, "googleClientId", "");
        var response = controller.googleConfig();
        assertEquals(false, response.getBody().get("enabled"));
        assertFalse(response.getBody().containsKey("nonce"));
        assertNull(response.getHeaders().getFirst("Set-Cookie"));
    }

    @Test
    void googleAuthRetriedOneConcurrentAccountCreationAndExpiredTheChallengeOnSuccess() {
        var info = new GoogleUserInfo("google-subject", "user@gmail.com", true, "User", null, null);
        when(
            googleAuthService.verifyToken("signed-token", "00000000-0000-0000-0000-000000000001")
        ).thenReturn(Optional.of(info));
        when(googleAuthService.authenticateOrCreateUser(eq(info), any()))
            .thenThrow(
                new org.springframework.dao.DataIntegrityViolationException("Concurrent account")
            )
            .thenReturn(new GoogleAuthResult(25L, "mock-session"));
        var response = controller.googleAuth(Map.of("token", "signed-token"), googleRequest());
        assertEquals(200, response.getStatusCode().value());
        verify(googleAuthService, times(2)).authenticateOrCreateUser(eq(info), any());
        assertTrue(
            response
                .getHeaders()
                .get("Set-Cookie")
                .stream()
                .anyMatch(
                    cookie ->
                        cookie.contains("finapp_google_nonce=;") && cookie.contains("Max-Age=0")
                )
        );
    }
}
