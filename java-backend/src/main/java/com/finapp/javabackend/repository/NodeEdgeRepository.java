package com.finapp.javabackend.repository;

import com.finapp.javabackend.model.entity.NodeEdge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NodeEdgeRepository extends JpaRepository<NodeEdge, Long> {

    @Query("SELECT e FROM NodeEdge e WHERE e.sourceNode.id = :nodeId OR e.targetNode.id = :nodeId")
    List<NodeEdge> findAllByNodeId(@Param("nodeId") Long nodeId);
}