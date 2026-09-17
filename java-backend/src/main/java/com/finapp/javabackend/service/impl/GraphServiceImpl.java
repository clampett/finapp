package com.finapp.javabackend.service.impl;

import com.finapp.javabackend.dto.EdgeDTO;
import com.finapp.javabackend.dto.GraphDTO;
import com.finapp.javabackend.dto.NodeDTO;
import com.finapp.javabackend.model.entity.FinancialNode;
import com.finapp.javabackend.model.entity.FinancialProfile;
import com.finapp.javabackend.model.entity.NodeEdge;
import com.finapp.javabackend.repository.FinancialNodeRepository;
import com.finapp.javabackend.repository.FinancialProfileRepository;
import com.finapp.javabackend.repository.NodeEdgeRepository;
import com.finapp.javabackend.service.GraphService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@Transactional
public class GraphServiceImpl implements GraphService {

    private final FinancialProfileRepository profileRepository;
    private final FinancialNodeRepository nodeRepository;
    private final NodeEdgeRepository edgeRepository;

    public GraphServiceImpl(FinancialProfileRepository profileRepository,
                            FinancialNodeRepository nodeRepository,
                            NodeEdgeRepository edgeRepository) {
        this.profileRepository = profileRepository;
        this.nodeRepository = nodeRepository;
        this.edgeRepository = edgeRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public GraphDTO getUserGraphByProfileId(Long profileId) {
        List<FinancialNode> nodes = nodeRepository.findByProfileId(profileId);

        List<NodeDTO> nodeDTOs = nodes.stream()
                .map(node -> new NodeDTO(
                        node.getId(),
                        node.getName(),
                        node.getNodeType(),
                        node.getCurrentBalance(),
                        node.getInterestRateApr()
                ))
                .collect(Collectors.toList());

        List<Long> nodeIds = nodes.stream().map(FinancialNode::getId).toList();

        List<NodeEdge> edges = nodeIds.stream()
                .flatMap(id -> edgeRepository.findAllByNodeId(id).stream())
                .distinct()
                .toList();

        List<EdgeDTO> edgeDTOs = edges.stream()
                .map(edge -> new EdgeDTO(
                        edge.getId(),
                        edge.getSourceNode().getId(),
                        edge.getTargetNode().getId(),
                        edge.getPercentageFlow(),
                        edge.getFixedAmountFlow()
                ))
                .collect(Collectors.toList());

        return new GraphDTO(profileId, nodeDTOs, edgeDTOs);
    }

    @Override
    public NodeDTO addNode(Long profileId, NodeDTO nodeDTO) {
        FinancialProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new IllegalArgumentException("Profile not found: " + profileId));

        FinancialNode node = new FinancialNode();
        node.setProfile(profile);
        node.setName(nodeDTO.name());
        node.setNodeType(nodeDTO.type());
        node.setCurrentBalance(nodeDTO.currentBalance());
        node.setInterestRateApr(nodeDTO.interestRateApr());

        FinancialNode saved = nodeRepository.save(node);

        return new NodeDTO(
                saved.getId(),
                saved.getName(),
                saved.getNodeType(),
                saved.getCurrentBalance(),
                saved.getInterestRateApr()
        );
    }

    @Override
    public NodeDTO updateNode(Long nodeId, NodeDTO nodeDTO) {
        FinancialNode node = nodeRepository.findById(nodeId)
                .orElseThrow(() -> new IllegalArgumentException("Node not found: " + nodeId));

        node.setName(nodeDTO.name());
        node.setNodeType(nodeDTO.type());
        node.setCurrentBalance(nodeDTO.currentBalance());
        node.setInterestRateApr(nodeDTO.interestRateApr());

        FinancialNode updated = nodeRepository.save(node);

        return new NodeDTO(
                updated.getId(),
                updated.getName(),
                updated.getNodeType(),
                updated.getCurrentBalance(),
                updated.getInterestRateApr()
        );
    }

    @Override
    public void deleteNode(Long nodeId) {
        List<NodeEdge> connectedEdges = edgeRepository.findAllByNodeId(nodeId);
        edgeRepository.deleteAll(connectedEdges);
        nodeRepository.deleteById(nodeId);
    }
}