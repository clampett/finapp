package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.LoginRequest;
import com.finapp.javabackend.dto.LoginResponse;
import com.finapp.javabackend.dto.RegistrationRequest;
import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.repository.UserRepository;
import com.finapp.javabackend.util.JwtUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserService userService;

    @Autowired
    private AuthenticationManager authenticationManager;

    @Autowired
    private JwtUtil jwtUtil;

    public LoginResponse authenticate(LoginRequest request) {
        // Authenticate user credentials using Spring Security
        Authentication authentication = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.username(), request.password())
        );

        SecurityContextHolder.getContext().setAuthentication(authentication);
        UserDetails userDetails = (UserDetails) authentication.getPrincipal();
        
        // Generate JWT token
        String token = jwtUtil.generateToken(userDetails);
        
        // Return user information along with the token
        User user = userRepository.findByUsername(request.username()).orElseThrow();
        return new LoginResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                token
        );
    }

    public User register(RegistrationRequest request) {
        // Check if username or email already exists
        if (userRepository.findByUsername(request.username()).isPresent()) {
            throw new RuntimeException("Username already exists");
        }
        if (userRepository.findByEmail(request.email()).isPresent()) {
            throw new RuntimeException("Email already registered");
        }
        
        // Create and save the user with encoded password
        User user = new User(request.username(), request.email());
        user.setPassword(userService.encodePassword(request.password()));
        userRepository.save(user);
        return user;
    }
}