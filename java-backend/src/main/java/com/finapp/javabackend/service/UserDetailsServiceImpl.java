package com.finapp.javabackend.service;

import com.finapp.javabackend.model.entity.User;
import com.finapp.javabackend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;

@Service
public class UserDetailsServiceImpl implements UserDetailsService {

    @Autowired
    private UserRepository userRepository;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
        
        // Create a basic UserDetails object with placeholder password
        // In a real implementation with proper DB schema, we would retrieve the actual password
        return org.springframework.security.core.userdetails.User
                .withUsername(user.getUsername())
                .password("{noop}" + user.getEmail()) // Using {noop} for demo only
                .authorities(new ArrayList<>()) 
                .build();
    }
}