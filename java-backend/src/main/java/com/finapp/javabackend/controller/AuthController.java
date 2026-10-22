package com.finapp.javabackend.controller;

import com.finapp.javabackend.config.SessionUser;
import com.finapp.javabackend.dto.AuthRequest;
import com.finapp.javabackend.dto.AuthResponse;
import com.finapp.javabackend.model.entity.AuthToken;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.entity.UserSession;
import com.finapp.javabackend.repository.AuthTokenRepository;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.repository.UserSessionRepository;
import com.finapp.javabackend.services.EmailService;
import jakarta.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    @Value("${finapp.session.secure:false}")
    private boolean secureSessionCookie;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserSessionRepository userSessionRepository;

    @Autowired
    private EmailService emailService;

    @Autowired
    private AuthTokenRepository authTokenRepository;

    @PostMapping("/register")
    @Transactional
    public ResponseEntity<AuthResponse> register(@RequestBody AuthRequest request) {
        // Checked the same input limits enforced by the UI and database. The
        // BCrypt limit was measured in UTF-8 bytes rather than Java characters.
        if (
            request.getUsername() == null ||
            request.getEmail() == null ||
            request.getPassword() == null ||
            request.getUsername().isBlank() ||
            request.getUsername().trim().length() > 50 ||
            !request.getEmail().trim().matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") ||
            request.getEmail().trim().length() > 255 ||
            request.getPassword().length() < 6 ||
            request.getPassword().getBytes(StandardCharsets.UTF_8).length > 72
        ) {
            return ResponseEntity.badRequest().body(
                new AuthResponse(
                    "Enter a username, valid email, and password of 6 to 72 bytes.",
                    null
                )
            );
        }
        request.setUsername(request.getUsername().trim());
        request.setEmail(request.getEmail().trim());
        // 1. Check if user already exists
        if (
            userRepository.findByUsername(request.getUsername()).isPresent() ||
            userRepository.findByEmail(request.getEmail()).isPresent()
        ) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
                new AuthResponse("Username or email already exists", null)
            );
        }

        // 2. Create and hash the user
        User newUser = new User();
        newUser.setUsername(request.getUsername());
        newUser.setEmail(request.getEmail());
        newUser.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        newUser.setIsArchetype(false);
        newUser.setIsEmailVerified(false);

        User savedUser = userRepository.save(newUser);

        // Grouped account and verification-token writes in one transaction so
        // delivery failure could not commit an account without its pending code.

        // 3. Generate verification token and send code (prints to terminal via EmailService)
        String code = emailService.generateSixDigitCode();
        AuthToken authToken = new AuthToken();
        authToken.setUser(savedUser);
        authToken.setToken(code);
        authToken.setTokenType("EMAIL_VERIFICATION");
        authToken.setExpiresAt(LocalDateTime.now().plusMinutes(15));
        authTokenRepository.save(authToken);

        emailService.sendVerificationEmail(savedUser.getEmail(), code);

        return ResponseEntity.ok(
            new AuthResponse(
                "Registration successful. Please check your terminal/email for verification code.",
                savedUser.getId()
            )
        );
    }

    @PostMapping("/verify-email")
    @Transactional
    public ResponseEntity<AuthResponse> verifyEmail(@RequestBody Map<String, String> request) {
        // Required an account-bound, unexpired six-digit token. Equal code values
        // issued to different users therefore remained separate verification records.
        String token = request.get("token");
        Long userId = verificationUserId(request);
        if (userId == null || token == null || !token.matches("[0-9]{6}")) {
            return ResponseEntity.badRequest().body(
                new AuthResponse(
                    "Open verification from your registration or sign in again to continue.",
                    null
                )
            );
        }
        Optional<AuthToken> authTokenOpt = authTokenRepository.findByUserIdAndTokenAndTokenType(
            userId,
            token,
            "EMAIL_VERIFICATION"
        );

        if (
            authTokenOpt.isEmpty() ||
            authTokenOpt.get().getExpiresAt().isBefore(LocalDateTime.now())
        ) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(
                new AuthResponse("Invalid or expired verification code", null)
            );
        }

        AuthToken authToken = authTokenOpt.get();
        User user = authToken.getUser();
        user.setIsEmailVerified(true);
        userRepository.save(user);

        // Delete the token once used
        authTokenRepository.deleteByUserIdAndTokenType(user.getId(), "EMAIL_VERIFICATION");

        return ResponseEntity.ok(new AuthResponse("Email successfully verified", user.getId()));
    }

    private Long verificationUserId(Map<String, String> request) {
        try {
            long id = Long.parseLong(request.getOrDefault("userId", ""));
            return id > 0 ? id : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    @PostMapping("/resend-verification")
    @Transactional
    public ResponseEntity<AuthResponse> resendVerification(
        @RequestBody Map<String, String> request
    ) {
        // Replaced all pending email-verification tokens for this account before
        // issuing the new code, preventing older resends from remaining usable.
        Long userId = verificationUserId(request);
        Optional<User> found = userId == null ? Optional.empty() : userRepository.findById(userId);
        if (found.isEmpty() || Boolean.TRUE.equals(found.get().getIsEmailVerified())) {
            return ResponseEntity.badRequest().body(
                new AuthResponse("No pending verification. Register or sign in to continue.", null)
            );
        }
        User user = found.get();
        authTokenRepository.deleteByUserIdAndTokenType(userId, "EMAIL_VERIFICATION");
        authTokenRepository.flush();
        String code = emailService.generateSixDigitCode();
        AuthToken token = new AuthToken();
        token.setUser(user);
        token.setToken(code);
        token.setTokenType("EMAIL_VERIFICATION");
        token.setExpiresAt(LocalDateTime.now().plusMinutes(15));
        authTokenRepository.save(token);
        emailService.sendVerificationEmail(user.getEmail(), code);
        return ResponseEntity.ok(
            new AuthResponse(
                "New code sent. In local development, check the Spring Boot terminal.",
                userId
            )
        );
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<AuthResponse> forgotPassword(@RequestBody Map<String, String> request) {
        String email = request.get("email");
        Optional<User> userOpt = userRepository.findByEmail(email);

        // For security reasons, don't reveal if the email exists or not in the response message
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            String code = emailService.generateSixDigitCode();

            AuthToken authToken = new AuthToken();
            authToken.setUser(user);
            authToken.setToken(code);
            authToken.setTokenType("PASSWORD_RESET");
            authToken.setExpiresAt(LocalDateTime.now().plusMinutes(15));
            authTokenRepository.save(authToken);

            emailService.sendVerificationEmail(user.getEmail(), code);
        }

        return ResponseEntity.ok(
            new AuthResponse("If that email exists, a password reset code has been sent.", null)
        );
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
        @RequestBody AuthRequest request,
        HttpServletRequest httpRequest
    ) {
        // 1. Fetch user by username
        Optional<User> userOpt = userRepository.findByUsername(request.getUsername());

        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(
                new AuthResponse("Invalid credentials", null)
            );
        }

        User user = userOpt.get();

        // 2. Validate BCrypt hash
        if (
            request.getPassword() == null ||
            user.getPasswordHash() == null ||
            !passwordEncoder.matches(request.getPassword(), user.getPasswordHash())
        ) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(
                new AuthResponse("Invalid credentials", null)
            );
        }

        if (!Boolean.TRUE.equals(user.getIsEmailVerified())) {
            // Returned the pending account ID only after its password had been
            // checked, allowing the UI to resume verification without logging in.
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(
                new AuthResponse("Verify your account before signing in.", user.getId())
            );
        }

        // 3. Generate a secure session token
        String sessionToken = UUID.randomUUID().toString();

        // 4. Save session to database (expires in 24 hours)
        UserSession session = new UserSession();
        session.setUser(user);
        session.setToken(sessionToken);
        session.setIpAddress(httpRequest.getRemoteAddr());
        session.setExpiresAt(LocalDateTime.now().plusHours(24));
        userSessionRepository.save(session);

        // 5. Build Secure HttpOnly Cookie
        ResponseCookie cookie = ResponseCookie.from("finapp_session", sessionToken)
            .httpOnly(true)
            .secure(secureSessionCookie)
            .path("/")
            .sameSite("Strict")
            .build();

        return ResponseEntity.ok()
            .header(HttpHeaders.SET_COOKIE, cookie.toString())
            .body(
                new AuthResponse("Login successful", user.getId()).withSessionToken(sessionToken)
            );
    }

    @GetMapping("/session")
    public ResponseEntity<AuthResponse> currentSession(Authentication authentication) {
        // Confirmed the authenticated principal for the dashboard's startup and
        // history-cache checks, without trusting browser-stored account metadata.
        if (
            authentication == null || !(authentication.getPrincipal() instanceof SessionUser user)
        ) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(
                new AuthResponse("Sign in again.", null)
            );
        }
        return ResponseEntity.ok()
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .body(new AuthResponse("Signed in", user.id()));
    }

    @PostMapping("/logout")
    @Transactional
    public ResponseEntity<Void> logout(
        @RequestBody Map<String, String> request,
        @CookieValue(name = "finapp_session", required = false) String cookieToken
    ) {
        // Made logout repeatable: a token already deleted by an earlier request
        // still produced a successful empty response rather than a sign-out error.
        String token = request.get("sessionToken");
        // Revoke only the supplied tab session. A delayed request must not revoke a newer login.
        if (
            token == null || !token.matches("[a-fA-F0-9-]{36}")
        ) return ResponseEntity.noContent().build();
        userSessionRepository.deleteByToken(token);
        var response = ResponseEntity.noContent();
        if (token.equals(cookieToken)) {
            ResponseCookie expired = ResponseCookie.from("finapp_session", "")
                .httpOnly(true)
                .secure(secureSessionCookie)
                .path("/")
                .sameSite("Strict")
                .maxAge(0)
                .build();
            response.header(HttpHeaders.SET_COOKIE, expired.toString());
        }
        return response.build();
    }
}
