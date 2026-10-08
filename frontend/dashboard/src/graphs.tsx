import * as d3 from 'd3';
import { useEffect, useRef } from 'react';

const API_BASE_URL = 'http://localhost:8080/api/v1';

// Define TypeScript interfaces for our graph data
interface GraphNode {
  id: string;
  name: string;
  amountOrBalance: number | string;
}

interface GraphEdge {
  sourceNodeId: string;
  targetNodeId: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphResponse {
  success: boolean;
  data?: GraphData;
  message?: string;
}

export function ArchetypeGraph({ userId }: { userId: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  console.log("running graph")
  
  useEffect(() => {
    const fetchAndRenderGraph = async () => {
      try {
        console.log(`Fetching graph for Archetype ${userId}...`);
        const response = await fetch(`${API_BASE_URL}/graph/${userId}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const responseBody: GraphResponse = await response.json();
        
        if (responseBody.success && responseBody.data) {
          const graphData = responseBody.data;
          console.log('Successfully extracted GraphDTO:', graphData);
          
          // Render the graph
          renderGraph(graphData);
        } else {
          console.error('Backend returned an error:', responseBody.message);
        }
      } catch (error) {
        console.error('Failed to fetch graph data:', error);
      }
    };

    fetchAndRenderGraph();

    // Cleanup function to remove SVG element when component unmounts
    return () => {
      if (containerRef.current) {
        d3.select(containerRef.current).selectAll("*").remove();
      }
    };
  }, [userId]);

  const renderGraph = (graphData: GraphData) => {
    // Clear any existing graph
    if (containerRef.current) {
      d3.select(containerRef.current).selectAll("*").remove();
    }

    // Get dimensions of the container
    const width = window.innerWidth;
    const height = window.innerHeight - 100; // Account for any header/footer
    
    // Setup SVG canvas
    const svg = d3.select(containerRef.current)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto;");

    // Format data for D3
    const nodes = graphData.nodes.map(d => Object.create(d));
    const links = graphData.edges.map(d => ({
      ...Object.create(d),
      source: d.sourceNodeId,
      target: d.targetNodeId
    }));

    // Setup physics simulation
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2));

    // Draw edges (links)
    const link = svg.append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 2);

    // Draw nodes
    const node = svg.append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 20)
      .attr("fill", "#69b3a2")
      .call(drag(simulation) as any);

    // Add labels (text)
    const labels = svg.append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .attr("dy", -25)
      .attr("text-anchor", "middle")
      .attr("fill", "#333")
      .attr("font-family", "sans-serif")
      .attr("font-weight", "bold")
      .attr("font-size", "14px")
      .text((d: any) => {
        // Format the amount with commas (e.g., 22000 -> 22,000)
        const formattedAmount = Number(d.amountOrBalance).toLocaleString();
        return `${d.name} ($${formattedAmount})`;
      });

    // Tick function to update positions
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);
        
      labels
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    // Handle zoom and pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on("zoom", (event) => {
        svg.select("g").attr("transform", event.transform);
      });

    svg.call(zoom);

    // Add drag behavior to nodes
    function drag(simulation: d3.Simulation<any, undefined>) {
      function dragstarted(event: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      }
      
      function dragged(event: any) {
        event.subject.fx = event.x;
        event.subject.fy = event.y;
      }
      
      function dragended(event: any) {
        if (!event.active) simulation.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }
      
      return d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);
    }
  };

  return <div ref={containerRef} />;
}

export async function loadArchetypeGraph(userId: number): Promise<void> {
  // This is a wrapper for the fetch functionality if needed elsewhere
  try {
    console.log(`Fetching graph for Archetype ${userId}...`);
    const response = await fetch(`${API_BASE_URL}/graph/${userId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const responseBody: GraphResponse = await response.json();
    
    if (responseBody.success) {
      const graphData = responseBody.data;
      console.log('Successfully extracted GraphDTO:', graphData);
      
      // This function would be used in other contexts where you need the raw data
      // For rendering, we use ArchetypeGraph component instead
    } else {
      console.error('Backend returned an error:', responseBody.message);
    }
    
  } catch (error) {
    console.error('Failed to fetch graph data:', error);
  }
}