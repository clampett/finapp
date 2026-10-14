import * as d3 from 'd3';
import { useEffect, useRef, useState } from 'react';
import { SimulationModal } from './SimulationModal';

const API_BASE_URL = 'http://localhost:8081/api/v1';

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

export function ArchetypeGraph({ userId }: { userId: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentGraph, setCurrentGraph] = useState<GraphData | null>(null);
  const [showModal, setShowModal] = useState(false);
  
  useEffect(() => {
    const fetchAndRenderGraph = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/graph/${userId}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const responseBody = await response.json();
        
        if (responseBody.success && responseBody.data) {
          setCurrentGraph(responseBody.data);
          renderGraph(responseBody.data);
          setShowModal(false); 
        }
      } catch (error) {
        console.error('Failed to fetch graph data:', error);
      }
    };

    fetchAndRenderGraph();

    return () => {
      if (containerRef.current) d3.select(containerRef.current).selectAll("*").remove();
    };
  }, [userId]);

  const renderGraph = (graphData: GraphData) => {
    if (containerRef.current) d3.select(containerRef.current).selectAll("svg").remove();

    const width = window.innerWidth;
    const height = window.innerHeight - 100;
    
    const svg = d3.select(containerRef.current)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto; outline: none; background-color: #0B0B10;");

    // ==========================================
    // 1. PREMIUM GRAPH PAPER BACKGROUND
    // ==========================================
    const defs = svg.append("defs");
    
    // Minor Grid (Faint 20px squares)
    const minorGrid = defs.append("pattern")
      .attr("id", "minorGrid")
      .attr("width", 20)
      .attr("height", 20)
      .attr("patternUnits", "userSpaceOnUse");
      
    minorGrid.append("path")
      .attr("d", "M 20 0 L 0 0 0 20")
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.03)") // 3% opacity
      .attr("stroke-width", 1);

    // Major Grid (Slightly brighter 100px squares)
    const majorGrid = defs.append("pattern")
      .attr("id", "majorGrid")
      .attr("width", 100)
      .attr("height", 100)
      .attr("patternUnits", "userSpaceOnUse");
      
    majorGrid.append("rect")
      .attr("width", 100)
      .attr("height", 100)
      .attr("fill", "url(#minorGrid)");
      
    majorGrid.append("path")
      .attr("d", "M 100 0 L 0 0 0 100")
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,0.06)") // 6% opacity
      .attr("stroke-width", 1);

    // Render the grid background to fill the screen
    svg.append("rect")
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("fill", "url(#majorGrid)");


    // ==========================================
    // 2. GRAPH NODES & EDGES
    // ==========================================
    const g = svg.append("g");
    const nodes = graphData.nodes.map(d => Object.create(d));
    const links = graphData.edges.map(d => ({ ...Object.create(d), source: d.sourceNodeId, target: d.targetNodeId }));

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(300)) 
      .force("charge", d3.forceManyBody().strength(-800)) 
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(110)); 

    const link = g.append("g")
      .attr("stroke", "#4b5563")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 2);

    const nodeWidth = 160;
    const nodeHeight = 70;

    const node = g.append("g")
      .selectAll("foreignObject")
      .data(nodes)
      .join("foreignObject")
      .attr("width", nodeWidth)
      .attr("height", nodeHeight)
      .attr("overflow", "visible")
      .call(drag(simulation) as any);

    node.append("xhtml:div")
      .attr("class", "w-full h-full bg-[#1A1A1F] border border-gray-700 rounded-lg shadow-lg flex flex-col justify-center items-center text-white cursor-grab active:cursor-grabbing hover:border-indigo-400 transition-colors duration-200 select-none")
      .html((d: any) => {
        const formattedAmount = Number(d.amountOrBalance).toLocaleString();
        return `
          <div class="text-sm text-gray-400 font-semibold truncate w-11/12 text-center tracking-wide uppercase">${d.name}</div>
          <div class="text-lg font-bold text-indigo-400 mt-1">$${formattedAmount}</div>
        `;
      });

    simulation.on("tick", () => {
      link.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y).attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
      node.attr("x", (d: any) => d.x - nodeWidth / 2).attr("y", (d: any) => d.y - nodeHeight / 2);
    });

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        // Dynamically translate and scale the grid pattern to perfectly match the user's view
        majorGrid.attr("patternTransform", `translate(${event.transform.x}, ${event.transform.y}) scale(${event.transform.k})`);
      });

    svg.call(zoom);

    // Dynamic zoom based on screen size (Updated to be slightly larger: 0.65/0.95)
    const initialScale = width < 1024 ? 0.65 : 0.95;
    svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(initialScale).translate(-width / 2, -height / 2));

    function drag(simulation: d3.Simulation<any, undefined>) {
      function dragstarted(event: any) { if (!event.active) simulation.alphaTarget(0.3).restart(); event.subject.fx = event.subject.x; event.subject.fy = event.subject.y; }
      function dragged(event: any) { event.subject.fx = event.x; event.subject.fy = event.y; }
      function dragended(event: any) { if (!event.active) simulation.alphaTarget(0); event.subject.fx = null; event.subject.fy = null; }
      return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute top-4 right-4 z-10">
        <button 
          onClick={() => setShowModal(true)}
          disabled={!currentGraph}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg transition-colors disabled:opacity-50"
        >
          Run 30-Year Forecast
        </button>
      </div>

      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {showModal && currentGraph && (
        <SimulationModal 
          graphData={currentGraph} 
          onClose={() => setShowModal(false)} 
        />
      )}
    </div>
  );
}