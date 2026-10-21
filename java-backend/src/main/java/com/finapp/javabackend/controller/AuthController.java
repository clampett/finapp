package com.finapp.javabackend.controller;

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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

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
    public ResponseEntity<AuthResponse> register(@RequestBody AuthRequest request) {
        // 1. Check if user already exists
        if (userRepository.findByUsername(request.getUsername()).isPresent() ||
                userRepository.findByEmail(request.getEmail()).isPresent()) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(new AuthResponse("Username or email already exists", null));
        }

        // 2. Create and hash the user
        User newUser = new User();
        newUser.setUsername(request.getUsername());
        newUser.setEmail(request.getEmail());
        newUser.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        newUser.setIsArchetype(false);
        newUser.setIsEmailVerified(false);

        User savedUser = userRepository.save(newUser);

        // 3. Generate verification token and send code (prints to terminal via EmailService)
        String code = emailService.generateSixDigitCode();
        AuthToken authToken = new AuthToken();
        authToken.setUser(savedUser);
        authToken.setToken(code);
        authToken.setTokenType("EMAIL_VERIFICATION");
        authToken.setExpiresAt(LocalDateTime.now().plusMinutes(15));
        authTokenRepository.save(authToken);

        emailService.sendVerificationEmail(savedUser.getEmail(), code);

        return ResponseEntity.ok(new AuthResponse("Registration successful. Please check your terminal/email for verification code.", savedUser.getId()));
    }

    @PostMapping("/verify-email")
    public ResponseEntity<AuthResponse> verifyEmail(@RequestBody Map<String, String> request) {
        String token = request.get("token");
        Optional<AuthToken> authTokenOpt = authTokenRepository.findByTokenAndTokenType(token, "EMAIL_VERIFICATION");

        if (authTokenOpt.isEmpty() || authTokenOpt.get().getExpiresAt().isBefore(LocalDateTime.now())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(new AuthResponse("Invalid or expired verification code", null));
        }

        AuthToken authToken = authTokenOpt.get();
        User user = authToken.getUser();
        user.setIsEmailVerified(true);
        userRepository.save(user);

        // Delete the token once used
        authTokenRepository.delete(authToken);

        return ResponseEntity.ok(new AuthResponse("Email successfully verified", user.getId()));
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

        return ResponseEntity.ok(new AuthResponse("If that email exists, a password reset code has been sent.", null));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody AuthRequest request, HttpServletRequest httpRequest) {
        // 1. Fetch user by username
        Optional<User> userOpt = userRepository.findByUsername(request.getUsername());

        if (userOpt.isEmpty()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new AuthResponse("Invalid credentials", null));
        }

        User user = userOpt.get();

        // 2. Validate BCrypt hash
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(new AuthResponse("Invalid credentials", null));
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
                .maxAge(24 * 60 * 60)
                .sameSite("Strict")
                .build();

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(new AuthResponse("Login successful", user.getId()));
    }
}
