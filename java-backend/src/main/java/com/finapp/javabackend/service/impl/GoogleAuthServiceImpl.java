package com.finapp.javabackend.service.impl;

import com.finapp.javabackend.dto.GoogleAuthResult;
import com.finapp.javabackend.dto.GoogleUserInfo;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.model.entity.UserSession;
import com.finapp.javabackend.repository.AuthTokenRepository;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.repository.UserSessionRepository;
import com.finapp.javabackend.service.GoogleAuthService;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class GoogleAuthServiceImpl implements GoogleAuthService {

    private static final Logger log = LoggerFactory.getLogger(GoogleAuthServiceImpl.class);

    private final GoogleIdTokenVerifier verifier;
    private final UserRepository userRepository;
    private final UserSessionRepository userSessionRepository;
    private final AuthTokenRepository authTokenRepository;
    private final PasswordEncoder passwordEncoder;

    @org.springframework.beans.factory.annotation.Autowired
    public GoogleAuthServiceImpl(
        @Value("${google.client.id:}") String googleClientId,
        UserRepository userRepository,
        UserSessionRepository userSessionRepository,
        AuthTokenRepository authTokenRepository,
        PasswordEncoder passwordEncoder
    ) {
        this.userRepository = userRepository;
        this.userSessionRepository = userSessionRepository;
        this.authTokenRepository = authTokenRepository;
        this.passwordEncoder = passwordEncoder;

        if (googleClientId != null && !googleClientId.isBlank()) {
            this.verifier = new GoogleIdTokenVerifier.Builder(
                new NetHttpTransport(),
                new GsonFactory()
            )
                .setAudience(Collections.singletonList(googleClientId))
                .build();
        } else {
            this.verifier = null;
        }
    }

    public GoogleAuthServiceImpl(
        GoogleIdTokenVerifier verifier,
        UserRepository userRepository,
        UserSessionRepository userSessionRepository,
        AuthTokenRepository authTokenRepository,
        PasswordEncoder passwordEncoder
    ) {
        this.verifier = verifier;
        this.userRepository = userRepository;
        this.userSessionRepository = userSessionRepository;
        this.authTokenRepository = authTokenRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public Optional<GoogleUserInfo> verifyToken(String idTokenString, String nonce) {
        // Required the browser's challenge before accepting a reusable signed Google credential.
        if (nonce == null || nonce.isBlank() || idTokenString == null || idTokenString.isBlank()) {
            return Optional.empty();
        }
        if (verifier == null) {
            log.warn("Google OAuth client ID is not configured; cannot verify token");
            return Optional.empty();
        }
        try {
            GoogleIdToken idToken = verifier.verify(idTokenString);
            if (idToken == null) {
                return Optional.empty();
            }
            GoogleIdToken.Payload payload = idToken.getPayload();
            if (
                !nonce.equals(payload.get("nonce")) ||
                payload.getSubject() == null ||
                payload.getSubject().isBlank() ||
                payload.getSubject().length() > 255 ||
                payload.getEmail() == null ||
                payload.getEmail().isBlank() ||
                payload.getEmail().length() > 255
            ) {
                return Optional.empty();
            }
            String email = payload.getEmail();
            Boolean emailVerified = payload.getEmailVerified();
            String name = (String) payload.get("name");
            String picture = (String) payload.get("picture");

            return Optional.of(
                new GoogleUserInfo(
                    payload.getSubject(),
                    email,
                    Boolean.TRUE.equals(emailVerified),
                    name,
                    picture,
                    payload.getHostedDomain()
                )
            );
        } catch (Exception e) {
            log.warn("Google ID token verification failed");
            return Optional.empty();
        }
    }

    @Override
    @Transactional
    public GoogleAuthResult authenticateOrCreateUser(GoogleUserInfo userInfo, String ipAddress) {
        // Rechecked trusted identity claims at the account-writing boundary.
        if (
            !userInfo.emailVerified() ||
            userInfo.subject() == null ||
            userInfo.subject().isBlank() ||
            userInfo.subject().length() > 255 ||
            userInfo.email() == null ||
            userInfo.email().isBlank() ||
            userInfo.email().length() > 255
        ) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "A verified Google account is required."
            );
        }
        String email = userInfo.email().trim().toLowerCase(Locale.ROOT);
        Optional<User> userOpt = userRepository.findByGoogleSubject(userInfo.subject());
        if (userOpt.isEmpty()) {
            List<User> matches = userRepository.findAllByEmailIgnoreCase(email);
            if (matches.size() > 1) {
                throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Sign in with your FinApp username and password for this email address."
                );
            }
            userOpt = matches.stream().findFirst();
            if (userOpt.isPresent()) {
                User existing = userOpt.get();
                // Linked by email only when Google was authoritative for the Gmail or Workspace address.
                boolean authoritative =
                    email.endsWith("@gmail.com") ||
                    (userInfo.hostedDomain() != null && !userInfo.hostedDomain().isBlank());
                if (existing.getGoogleSubject() != null || !authoritative) {
                    throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "Sign in with your FinApp username and password for this email address."
                    );
                }
            }
        }
        User user;

        if (userOpt.isPresent()) {
            user = userOpt.get();
            // Kept the public demo fixtures outside all provider account linking.
            if (Boolean.TRUE.equals(user.getIsArchetype())) {
                throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "This account cannot use Google sign-in."
                );
            }
            // Pre-Account Takeover Mitigation:
            // If the account was previously unverified, an attacker may have registered it with a password they know.
            // Invalidate any existing password hash and delete pending verification codes upon verified OAuth login.
            if (!Boolean.TRUE.equals(user.getIsEmailVerified())) {
                user.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString()));
                authTokenRepository.deleteByUserIdAndTokenType(user.getId(), "EMAIL_VERIFICATION");
                user.setIsEmailVerified(true);
            }
            if (
                user.getDisplayName() == null &&
                userInfo.name() != null &&
                !userInfo.name().isBlank()
            ) {
                user.setDisplayName(truncate(userInfo.name().trim(), 50));
            }
            if (
                user.getProfilePicture() == null &&
                userInfo.pictureUrl() != null &&
                !userInfo.pictureUrl().isBlank()
            ) {
                user.setProfilePicture(userInfo.pictureUrl().trim());
            }
        } else {
            user = new User();
            String baseUsername = email.contains("@") ? email.split("@")[0] : email;
            baseUsername = baseUsername.replaceAll("[^a-zA-Z0-9_-]", "");
            if (baseUsername.isBlank()) {
                baseUsername = "user";
            }
            // Clamp baseUsername to max 40 characters so numeric suffix fits well within VARCHAR(50)
            if (baseUsername.length() > 40) {
                baseUsername = baseUsername.substring(0, 40);
            }

            String username = baseUsername;
            int suffix = 1;
            while (userRepository.findByUsername(username).isPresent()) {
                username = baseUsername + suffix++;
            }

            user.setUsername(username);
            user.setEmail(email);
            // Non-usable password hash placeholder for OAuth accounts
            user.setPasswordHash(passwordEncoder.encode(UUID.randomUUID().toString()));
            user.setIsArchetype(false);
            user.setIsEmailVerified(true);
            if (userInfo.name() != null && !userInfo.name().isBlank()) {
                user.setDisplayName(truncate(userInfo.name().trim(), 50));
            }
            if (userInfo.pictureUrl() != null && !userInfo.pictureUrl().isBlank()) {
                user.setProfilePicture(userInfo.pictureUrl().trim());
            }
        }

        user.setGoogleSubject(userInfo.subject());
        user = userRepository.saveAndFlush(user);
        // Kept the Google subject and session in the same transaction for retry-safe account creation.
        String sessionToken = UUID.randomUUID().toString();
        UserSession session = new UserSession();
        session.setUser(user);
        session.setToken(sessionToken);
        session.setIpAddress(ipAddress);
        session.setExpiresAt(LocalDateTime.now().plusHours(24));
        userSessionRepository.save(session);

        return new GoogleAuthResult(user.getId(), sessionToken);
    }

    private String truncate(String text, int maxLength) {
        if (text == null) {
            return null;
        }
        return text.length() <= maxLength ? text : text.substring(0, maxLength);
    }
}
