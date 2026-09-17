package com.finapp.javabackend.service;

import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.dto.NodeDTO;

public interface GraphService {
    GraphDTO getUserGraphByProfileId(Long profileId);
    NodeDTO addNode(Long profileId, NodeDTO nodeDTO);
    NodeDTO updateNode(Long nodeId, NodeDTO nodeDTO);
    void deleteNode(Long nodeId);
}