package com.finapp.javabackend.service.impl;

import com.finapp.javabackend.dto.EdgeDTO;
import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.dto.NodeDTO;
import com.finapp.javabackend.model.entity.FinancialNode;
import com.finapp.javabackend.model.entity.NodeEdge;
import com.finapp.javabackend.repository.FinancialNodeRepository;
import com.finapp.javabackend.repository.NodeEdgeRepository;
import com.finapp.javabackend.service.GraphService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class GraphServiceImpl implements GraphService {

    private final FinancialNodeRepository nodeRepository;
    private final NodeEdgeRepository edgeRepository;

    public GraphServiceImpl(FinancialNodeRepository nodeRepository, NodeEdgeRepository edgeRepository) {
        this.nodeRepository = nodeRepository;
        this.edgeRepository = edgeRepository;
    }

    @Override
    @Transactional
    public GraphDTO saveGraph(GraphDTO graphDTO) {
        // Map DTOs -> Entities for Nodes
        List<FinancialNode> nodesToSave = graphDTO.nodes().stream()
                .map(dto -> {
                    FinancialNode node = new FinancialNode(dto.name(), dto.nodeType(), dto.amountOrBalance(), dto.interestRateApr());
                    if (dto.id() != null) {
                        node.setId(dto.id());
                    }
                    return node;
                })
                .toList();

        List<FinancialNode> savedNodes = nodeRepository.saveAll(nodesToSave);

        // Map DTOs -> Entities for Edges using FinancialNode proxies
        List<NodeEdge> edgesToSave = graphDTO.edges().stream()
                .map(dto -> {
                    FinancialNode sourceNode = nodeRepository.getReferenceById(dto.sourceNodeId());
                    FinancialNode targetNode = nodeRepository.getReferenceById(dto.targetNodeId());
                    NodeEdge edge = new NodeEdge(sourceNode, targetNode, dto.monthlyFixedFlow(), dto.percentageFlow());
                    if (dto.id() != null) {
                        edge.setId(dto.id());
                    }
                    return edge;
                })
                .toList();

        List<NodeEdge> savedEdges = edgeRepository.saveAll(edgesToSave);

        // Map Entities -> DTOs
        List<NodeDTO> nodeDTOs = savedNodes.stream()
                .map(n -> new NodeDTO(n.getId(), n.getName(), n.getNodeType(), n.getAmountOrBalance(), n.getInterestRateApr()))
                .toList();

        List<EdgeDTO> edgeDTOs = savedEdges.stream()
                .map(e -> new EdgeDTO(e.getId(), e.getSourceNode().getId(), e.getTargetNode().getId(), e.getMonthlyFixedFlow(), e.getPercentageFlow()))
                .toList();

        return new GraphDTO(nodeDTOs, edgeDTOs);
    }

    @Override
    @Transactional(readOnly = true)
    public GraphDTO getFullGraph() {
        List<NodeDTO> nodeDTOs = nodeRepository.findAll().stream()
                .map(n -> new NodeDTO(n.getId(), n.getName(), n.getNodeType(), n.getAmountOrBalance(), n.getInterestRateApr()))
                .toList();

        List<EdgeDTO> edgeDTOs = edgeRepository.findAll().stream()
                .map(e -> new EdgeDTO(e.getId(), e.getSourceNode().getId(), e.getTargetNode().getId(), e.getMonthlyFixedFlow(), e.getPercentageFlow()))
                .toList();

        return new GraphDTO(nodeDTOs, edgeDTOs);
    }
}