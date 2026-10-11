import * as d3 from 'd3';
import { useEffect, useRef } from 'react';

const API_BASE_URL = 'http://localhost:8081/api/v1';

// Define TypeScript interfaces for our graph data
interface GraphNode {
  id: string;
  name: string;
  amountOrBalance: number | string;
  nodeType?: string;
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
      .attr("style", "max-width: 100%; height: auto; outline: none;");

    // Create a master group for zooming so nodes and links zoom together
    const g = svg.append("g");

    // Format data for D3
    const nodes = graphData.nodes.map(d => Object.create(d));
    const links = graphData.edges.map(d => ({
      ...Object.create(d),
      source: d.sourceNodeId,
      target: d.targetNodeId
    }));

    // Setup physics simulation
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(200)) // Increased distance for wider cards
      .force("charge", d3.forceManyBody().strength(-500)) // Push them apart slightly more
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(85)); // Prevent cards from overlapping

    // Draw edges (links) inside the zoom group
    const link = g.append("g")
      .attr("stroke", "#4b5563") // Darker slate gray for the connecting lines
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 2);

    // Setup node dimensions
    const nodeWidth = 140;
    const nodeHeight = 65;

    // Draw nodes as HTML containers using foreignObject
    const node = g.append("g")
      .selectAll("foreignObject")
      .data(nodes)
      .join("foreignObject")
      .attr("width", nodeWidth)
      .attr("height", nodeHeight)
      .attr("overflow", "visible")
      .call(drag(simulation) as any);

    // Inject Tailwind HTML into the SVG with a sleek, uniform Indigo theme
    node.append("xhtml:div")
      .attr("class", "w-full h-full bg-[#1A1A1F] border border-gray-700 rounded-lg shadow-lg flex flex-col justify-center items-center text-white cursor-grab active:cursor-grabbing hover:border-indigo-400 transition-colors duration-200 select-none")
      .html((d: any) => {
        const formattedAmount = Number(d.amountOrBalance).toLocaleString();
        return `
          <div class="text-[11px] text-gray-400 font-semibold truncate w-11/12 text-center tracking-wide uppercase">${d.name}</div>
          <div class="text-sm font-bold text-indigo-400 mt-1">$${formattedAmount}</div>
        `;
      });

    // Tick function to update positions on every animation frame
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      // Offset the X and Y so the links connect exactly to the center of the card
      node
        .attr("x", (d: any) => d.x - (nodeWidth / 2))
        .attr("y", (d: any) => d.y - (nodeHeight / 2));
    });

    // Handle zoom and pan (now targeting the master 'g' group)
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
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

  return <div ref={containerRef} className="w-full h-full" />;
}