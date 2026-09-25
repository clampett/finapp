package com.finapp.javabackend.dto;

import java.util.List;

public record GraphDTO(
        List<NodeDTO> nodes,
        List<EdgeDTO> edges
) {}