package com.finapp.javabackend.config;

import java.security.Principal;

public record SessionUser(Long id, String username) implements Principal {
    @Override
    public String getName() {
        return username;
    }
}
