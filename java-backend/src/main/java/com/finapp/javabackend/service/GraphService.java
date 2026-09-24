package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.GraphDTO;

public interface GraphService {
    GraphDTO saveGraph(GraphDTO graphDTO);
    GraphDTO getFullGraph();
}