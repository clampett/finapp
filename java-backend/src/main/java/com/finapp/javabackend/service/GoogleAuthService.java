package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.GoogleAuthResult;
import com.finapp.javabackend.dto.GoogleUserInfo;
import java.util.Optional;

public interface GoogleAuthService {
    Optional<GoogleUserInfo> verifyToken(String idTokenString);
    GoogleAuthResult authenticateOrCreateUser(GoogleUserInfo userInfo, String ipAddress);
}
