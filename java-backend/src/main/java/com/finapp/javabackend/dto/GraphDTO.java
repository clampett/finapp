package com.finapp.javabackend.dto;

import java.util.List;

public record GraphDTO(
        Long profileId,
        List<NodeDTO> nodes,
        List<EdgeDTO> edges
) {}