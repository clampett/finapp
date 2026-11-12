package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.GraphDTO;

public interface GraphService {
    GraphDTO saveGraph(Long userId, GraphDTO graphDTO);
    GraphDTO getFullGraph();
    GraphDTO getGraphForUser(Long userId);
}
