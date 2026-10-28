import * as d3 from 'd3';
import { useEffect, useRef, useId, useState } from 'react';
import type { ReactNode } from 'react';
import { CanvasIcon } from './CanvasIcon';
import type { CanvasTool } from '../graph-workspace';
import { canvasWheelAction, shortcuts } from '../ui-platform';
import { colors, expenseAmount, money, typeLabel, types } from '../finance';
import type { GraphData, GraphNode } from '../finance';

export function Canvas({
  graph,
  selected,
  search,
  onSelect,
  scopeIds,
  onToggleScope,
  onEdgeSelect,
  onMove,
  compact,
  toolbar,
  panel,
  connecting,
  onConnect,
  feedback,
  onViewportCenter,
  tool,
  selectionIds,
  edgeSelectionIds,
  onGroupSelect,
}: {
  graph: GraphData;
  selected?: string;
  search: string;
  onSelect: (n: GraphNode) => void;
  scopeIds: string[];
  onToggleScope: (id: string) => void;
  onEdgeSelect: (id: string, additive?: boolean) => void;
  onMove: (positions: Record<string, { x: number; y: number }>) => void;
  compact: boolean;
  toolbar: ReactNode;
  panel: ReactNode;
  connecting: boolean;
  onConnect: (source: string, target: string) => void;
  feedback?: string;
  onViewportCenter: (center: { x: number; y: number }) => void;
  tool: CanvasTool;
  selectionIds: string[];
  edgeSelectionIds: string[];
  onGroupSelect: (ids: string[]) => void;
}) {
  // Kept D3 rendering inside one SVG subtree; React retained responsibility for
  // workspace state, controls, forms, and the selected account.
  const ref = useRef<SVGSVGElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const canvasFullscreen = fullscreen || expanded;
  useEffect(() => {
    if (!expanded) return;
    // Filled the browser viewport when native fullscreen was unavailable;
    // restored page scrolling and kept Escape available on every browser.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const exit = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', exit);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', exit);
    };
  }, [expanded]);
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === host.current);
    document.addEventListener('fullscreenchange', changed);
    return () => document.removeEventListener('fullscreenchange', changed);
  }, []);
  const fitRef = useRef<() => void>(() => {});
  const zoomRef = useRef<(factor: number) => void>(() => {});
  const transformRef = useRef(d3.zoomIdentity);
  const initialized = useRef(false);
  const sizeRef = useRef({ width: 0, height: 0 });
  const moveRef = useRef(onMove);
  const connectRef = useRef(onConnect);
  useEffect(() => {
    moveRef.current = onMove;
    connectRef.current = onConnect;
  }, [onMove, onConnect]);
  const markerId = `flow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  useEffect(() => {
    if (!ref.current || !host.current) return;
    const hostElement = host.current;
    const svg = d3.select(ref.current);
    svg.selectAll('*').remove();
    const defs = svg.append('defs');
    defs
      .append('marker')
      .attr('id', markerId)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 10)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('markerUnits', 'userSpaceOnUse')
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#52637a');
    const g = svg.append('g');
    const marquee = svg
      .append('rect')
      .attr('class', 'canvas-marquee')
      .attr('pointer-events', 'none')
      .style('display', 'none');
    let marqueeActive = false;
    // Grouped nodes by their financial role so the initial arrangement read
    // from income through reserves to expenses, loans, and investments.
    const groups = [
      graph.nodes.filter((n) => n.nodeType === 'INCOME'),
      graph.nodes.filter((n) => ['CHECKING', 'SAVINGS'].includes(n.nodeType)),
      graph.nodes.filter((n) => ['EXPENSE', 'DEBT', 'INVESTMENT'].includes(n.nodeType)),
    ];
    const positions = new Map<
      string,
      {
        x: number;
        y: number;
      }
    >();
    const cardWidth = compact ? 200 : 230,
      cardHeight = compact ? 90 : 104;
    // Copied stored coordinates before a gesture so previews could not mutate
    // React history in place and make a real group move appear to be a no-op.
    groups.forEach((group, col) =>
      group.forEach((n, i) =>
        positions.set(n.id, {
          ...(n.position ?? { x: col * 345, y: i * 130 - (group.length - 1) * 65 }),
        }),
      ),
    );
    const paths = g
      .append('g')
      .selectAll('path')
      .data(graph.edges)
      .join('path')
      .attr('fill', 'none')
      .attr(
        'stroke',
        (edge) => colors[graph.nodes.find((node) => node.id === edge.targetNodeId)!.nodeType],
      )
      .attr('stroke-opacity', 0.6)
      .attr('stroke-width', (edge) =>
        Math.min(6, 1.5 + Math.log1p(edge.monthlyFixedFlow ?? edge.percentageFlow ?? 0) / 2),
      )
      .attr('marker-end', `url(#${markerId})`)
      .attr('class', 'canvas-edge')
      .classed('edge-selected', (edge) => edgeSelectionIds.includes(edge.id))
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr(
        'aria-label',
        (edge) =>
          `Edit connection from ${graph.nodes.find((node) => node.id === edge.sourceNodeId)?.name} to ${graph.nodes.find((node) => node.id === edge.targetNodeId)?.name}`,
      )
      .on('click', (event, edge) => {
        if (tool === 'pan') return;
        event.stopPropagation();
        onEdgeSelect(edge.id, event.shiftKey || event.ctrlKey || event.metaKey);
      })
      .on('keydown', (event, edge) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdgeSelect(edge.id, event.shiftKey || event.ctrlKey || event.metaKey);
        }
      });
    const labels = g
      .append('g')
      .selectAll('text')
      .data(graph.edges)
      .join('text')
      .attr('fill', '#91a0b7')
      .attr('font-size', 10)
      .attr('text-anchor', 'middle')
      .attr('paint-order', 'stroke')
      .attr('stroke', '#0e131d')
      .attr('stroke-width', 5)
      .attr('class', 'canvas-edge-label')
      .on('click', (event, edge) => {
        if (tool === 'pan') return;
        event.stopPropagation();
        onEdgeSelect(edge.id, event.shiftKey || event.ctrlKey || event.metaKey);
      })
      .text((e) =>
        e.monthlyFixedFlow != null ? `${money(e.monthlyFixedFlow)}/mo` : `${e.percentageFlow}%`,
      );
    const cards = g
      .append('g')
      .selectAll<SVGGElement, GraphNode>('g')
      .data(graph.nodes)
      .join('g')
      .attr('class', 'canvas-node')
      .classed('is-selected', (node) => selectionIds.includes(node.id))
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr(
        'aria-label',
        (n) =>
          `Edit ${n.name}, ${money(n.nodeType === 'EXPENSE' ? expenseAmount(n, graph) : n.amountOrBalance)}`,
      )
      .attr('opacity', (n) =>
        !search || n.name.toLowerCase().includes(search.toLowerCase()) ? 1 : 0.2,
      )
      .on('click', (event, n) => {
        if (event.defaultPrevented) return;
        if (tool === 'pan') return;
        if (connecting) chooseEndpoint(n.id);
        else if (event.ctrlKey || event.metaKey || event.shiftKey) onToggleScope(n.id);
        else onSelect(n);
      })
      .on('keydown', (e, n) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (connecting) chooseEndpoint(n.id);
          else onSelect(n);
        }
      });
    cards
      .append('rect')
      .attr('width', cardWidth)
      .attr('height', cardHeight)
      .attr('rx', 12)
      .attr('fill', '#171f2e')
      .attr('stroke', (n) =>
        n.id === selected || scopeIds.includes(n.id) ? '#e0e7ff' : colors[n.nodeType],
      )
      .attr('stroke-opacity', (n) => (n.id === selected || scopeIds.includes(n.id) ? 1 : 0.6))
      .attr('stroke-width', (n) => (n.id === selected || scopeIds.includes(n.id) ? 2.5 : 1));
    cards
      .append('circle')
      .attr('cx', 15)
      .attr('cy', 17)
      .attr('r', 3)
      .attr('fill', (n) => colors[n.nodeType]);
    cards
      .append('text')
      .attr('x', 25)
      .attr('y', 21)
      .attr('fill', '#9caec7')
      .attr('font-size', 9)
      .attr('letter-spacing', '1px')
      .text((n) => n.nodeType);
    cards
      .append('text')
      .attr('x', 14)
      .attr('y', 40)
      .attr('fill', '#e7edf8')
      .attr('font-size', 12)
      .text((n) => (n.name.length > 23 ? `${n.name.slice(0, 22)}…` : n.name));
    cards
      .append('text')
      .attr('x', 14)
      .attr('y', 62)
      .attr('fill', (n) => colors[n.nodeType])
      .attr('font-size', 16)
      .attr('font-weight', 650)
      .text(
        (n) =>
          `${money(n.nodeType === 'EXPENSE' ? expenseAmount(n, graph) : n.amountOrBalance)}${['INCOME', 'EXPENSE'].includes(n.nodeType) ? ' /mo' : ''}`,
      );
    cards
      .append('text')
      .attr('x', 14)
      .attr('y', 79)
      .attr('fill', '#96a9c2')
      .attr('font-size', 9)
      .text((node) =>
        scopeIds.includes(node.id)
          ? '✓ SELECTED FOR SIMULATION'
          : node.nodeType === 'DEBT'
            ? `${node.interestRateApr}% APR · click to edit`
            : node.nodeType === 'INVESTMENT'
              ? 'Market-linked asset · click to edit'
              : `Click to edit · ${shortcuts.select} to select`,
      );
    cards
      .append('title')
      .text(
        (n) =>
          `${n.name}\n${typeLabel(n.nodeType)} · ${money(n.nodeType === 'EXPENSE' ? expenseAmount(n, graph) : n.amountOrBalance)}\nClick to edit`,
      );
    // Added dedicated ports with a live, snapped connector preview; kept link
    // gestures separate from card dragging and committed only valid destinations.
    let sourceId: string | null = null;
    const preview = g
      .append('path')
      .attr('class', 'connector-preview')
      .attr('fill', 'none')
      .attr('pointer-events', 'none');
    function chooseEndpoint(id: string) {
      if (tool === 'pan' || tool === 'box') return;
      if (!sourceId) {
        sourceId = id;
        cards.classed('connection-source', (node) => node.id === id);
      } else if (sourceId !== id) {
        const start = sourceId;
        sourceId = null;
        cards.classed('connection-source', false);
        connectRef.current(start, id);
      } else {
        sourceId = null;
        cards.classed('connection-source', false);
      }
    }
    cards
      .append('circle')
      .attr('class', 'node-port node-port-in')
      .attr('cx', 0)
      .attr('cy', cardHeight / 2)
      .attr('r', 5)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (node) => `Connect to ${node.name}`)
      .on('click', (event, node) => {
        event.stopPropagation();
        chooseEndpoint(node.id);
      })
      .on('keydown', (event, node) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation();
          event.preventDefault();
          chooseEndpoint(node.id);
        }
      });
    const ports = cards
      .append('circle')
      .attr('class', 'node-port node-port-out')
      .attr('cx', cardWidth)
      .attr('cy', cardHeight / 2)
      .attr('r', 6)
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (node) => `Connect from ${node.name}`)
      .on('click', (event, node) => {
        event.stopPropagation();
        if (!event.defaultPrevented) chooseEndpoint(node.id);
      })
      .on('keydown', (event, node) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation();
          event.preventDefault();
          chooseEndpoint(node.id);
        }
      });
    let dropTarget: string | null = null;
    let portStart = { x: 0, y: 0 };
    let cancelled = false;
    const cancelConnector = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      cancelled = true;
      sourceId = null;
      dropTarget = null;
      preview.style('display', 'none');
      cards.classed('connection-target', false).classed('connection-source', false);
      hostElement.classList.remove('is-linking');
      marqueeActive = false;
      marquee.style('display', 'none');
    };
    window.addEventListener('keydown', cancelConnector);
    function destination(x: number, y: number, source: string) {
      return graph.nodes.find((node) => {
        const position = positions.get(node.id)!;
        return (
          node.id !== source &&
          x >= position.x - 20 &&
          x <= position.x + cardWidth + 20 &&
          y >= position.y - 12 &&
          y <= position.y + cardHeight + 12
        );
      });
    }
    function connectorDrag<ElementType extends SVGElement>() {
      return d3
        .drag<ElementType, GraphNode>()
        .filter(
          (event) =>
            (tool === 'select' || tool === 'connect') &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.button,
        )
        .clickDistance(6)
        .container(() => g.node()!)
        .subject((event) => ({ x: event.x, y: event.y }))
        .on('start', (event) => {
          cancelled = false;
          event.sourceEvent.stopPropagation();
          portStart = { x: event.x, y: event.y };
          dropTarget = null;
          preview.attr('d', null).style('display', null);
          hostElement.classList.add('is-linking');
        })
        .on('drag', (event, node) => {
          if (cancelled) return;
          if (Math.hypot(event.x - portStart.x, event.y - portStart.y) * transformRef.current.k < 6)
            return;
          sourceId = null;
          cards.classed('connection-source', false);
          const from = positions.get(node.id)!;
          const target = destination(event.x, event.y, node.id);
          dropTarget = target?.id ?? null;
          const to = target
            ? { x: positions.get(target.id)!.x, y: positions.get(target.id)!.y + cardHeight / 2 }
            : { x: event.x, y: event.y };
          const startX = from.x + cardWidth,
            startY = from.y + cardHeight / 2;
          const bend = Math.max(60, Math.abs(to.x - startX) / 2);
          preview.attr(
            'd',
            `M${startX},${startY} C${startX + bend},${startY} ${to.x - bend},${to.y} ${to.x},${to.y}`,
          );
          cards.classed('connection-target', (item) => item.id === dropTarget);
        })
        .on('end', (_event, node) => {
          preview.style('display', 'none');
          hostElement.classList.remove('is-linking');
          cards.classed('connection-target', false);
          if (dropTarget) connectRef.current(node.id, dropTarget);
          dropTarget = null;
        });
    }
    ports.call(connectorDrag<SVGCircleElement>());
    function draw() {
      cards.attr('transform', (n) => {
        const p = positions.get(n.id)!;
        return `translate(${p.x},${p.y})`;
      });
      paths.attr('d', (e) => {
        const a = positions.get(e.sourceNodeId)!,
          b = positions.get(e.targetNodeId)!;
        const x1 = a.x + cardWidth,
          x2 = b.x,
          y1 = a.y + cardHeight / 2,
          y2 = b.y + cardHeight / 2;
        const bend = Math.max(60, Math.abs(x2 - x1) / 2);
        return `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`;
      });
      labels
        .attr(
          'x',
          (e) =>
            (positions.get(e.sourceNodeId)!.x + positions.get(e.targetNodeId)!.x + cardWidth) / 2,
        )
        .attr(
          'y',
          (e) => (positions.get(e.sourceNodeId)!.y + positions.get(e.targetNodeId)!.y) / 2 + 29,
        );
    }
    let dragged = false;
    let dragStart = { x: 0, y: 0 };
    let dragIds: string[] = [];
    let groupStarts = new Map<string, { x: number; y: number }>();
    cards.call(
      d3
        .drag<SVGGElement, GraphNode>()
        .clickDistance(6)
        .filter(
          (event) =>
            tool === 'select' &&
            !event.target.closest('.node-port') &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.button,
        )
        .on('start', (event, node) => {
          dragged = false;
          dragStart = { x: event.x, y: event.y };
          dragIds = selectionIds.includes(node.id) ? selectionIds : [node.id];
          groupStarts = new Map(
            dragIds.filter((id) => positions.has(id)).map((id) => [id, { ...positions.get(id)! }]),
          );
        })
        .on('drag', (event) => {
          const dx = event.x - dragStart.x,
            dy = event.y - dragStart.y;
          if (!dragged && Math.hypot(dx, dy) * transformRef.current.k < 6) return;
          dragged = true;
          for (const [id, start] of groupStarts) {
            const position = positions.get(id)!;
            position.x = start.x + dx;
            position.y = start.y + dy;
          }
          draw();
        })
        .on('end', (event) => {
          if (!event.active && dragged)
            moveRef.current(
              Object.fromEntries(
                [...groupStarts.keys()].map((id) => [id, { ...positions.get(id)! }]),
              ),
            );
        }),
    );
    draw();
    if (connecting) cards.call(connectorDrag<SVGGElement>());
    // Selected intersecting cards in graph coordinates, then moved the group
    // with one history entry; kept viewport panning exclusive to the hand tool.
    let boxStart = { x: 0, y: 0 };
    let boxed: string[] = [];
    svg.call(
      d3
        .drag<SVGSVGElement, unknown>()
        .container(() => svg.node()!)
        .filter(
          (event) =>
            tool === 'box' &&
            !event.button &&
            !(
              event.target instanceof Element &&
              event.target.closest('.canvas-node,.canvas-edge,.canvas-edge-label')
            ),
        )
        .clickDistance(6)
        .on('start', (event) => {
          boxStart = { x: event.x, y: event.y };
          boxed = event.sourceEvent.shiftKey ? selectionIds : [];
          marqueeActive = true;
          marquee
            .attr('x', event.x)
            .attr('y', event.y)
            .attr('width', 0)
            .attr('height', 0)
            .style('display', null);
        })
        .on('drag', (event) => {
          if (!marqueeActive) return;
          const left = Math.min(boxStart.x, event.x),
            top = Math.min(boxStart.y, event.y),
            right = Math.max(boxStart.x, event.x),
            bottom = Math.max(boxStart.y, event.y);
          marquee
            .attr('x', left)
            .attr('y', top)
            .attr('width', right - left)
            .attr('height', bottom - top);
          const [x1, y1] = transformRef.current.invert([left, top]),
            [x2, y2] = transformRef.current.invert([right, bottom]);
          const hit = graph.nodes
            .filter((node) => {
              const p = positions.get(node.id)!;
              return p.x < x2 && p.x + cardWidth > x1 && p.y < y2 && p.y + cardHeight > y1;
            })
            .map((node) => node.id);
          boxed = [...new Set([...(event.sourceEvent.shiftKey ? selectionIds : []), ...hit])];
          cards.classed('is-selected', (node) => boxed.includes(node.id));
        })
        .on('end', () => {
          if (!marqueeActive) return;
          marqueeActive = false;
          marquee.style('display', 'none');
          onGroupSelect(boxed);
        }),
    );
    svg.on('click.selection', (event) => {
      if (
        tool === 'select' &&
        !event.defaultPrevented &&
        !(
          event.target instanceof Element &&
          event.target.closest('.canvas-node,.canvas-edge,.canvas-edge-label,.node-port')
        )
      )
        onGroupSelect([]);
    });
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      // Restricted panning to empty canvas in move mode; ignored nodes, ports,
      // and routes so a connection click could never begin a viewport gesture.
      .filter((event) => {
        if (connecting || marqueeActive || hostElement.classList.contains('is-linking'))
          return false;
        if (event.type === 'wheel') return canvasWheelAction(tool, event.ctrlKey, false) === 'zoom';
        return (
          tool === 'pan' &&
          !event.button &&
          !event.ctrlKey &&
          !event.metaKey &&
          !(event.target instanceof Element && event.target.closest('.node-port'))
        );
      })
      .clickDistance(6)
      .scaleExtent([0.15, 2.5])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        g.attr('transform', event.transform);
        const [x, y] = event.transform.invert([
          hostElement.clientWidth / 2,
          hostElement.clientHeight / 2,
        ]);
        onViewportCenter({ x, y });
      });
    svg.call(zoom).on('dblclick.zoom', null);
    // Used two-finger scrolling to pan only with the hand tool; preserved
    // Control-wheel pinch events for D3 zoom and normalized line/page deltas.
    svg.on(
      'wheel.trackpad',
      (event: WheelEvent) => {
        const action = canvasWheelAction(
          tool,
          event.ctrlKey,
          marqueeActive || hostElement.classList.contains('is-linking'),
        );
        if (action === 'block') {
          event.preventDefault();
          return;
        }
        if (action !== 'pan') return;
        event.preventDefault();
        const unit =
          event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? hostElement.clientHeight : 1;
        const dx = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX;
        const dy = event.shiftKey && !event.deltaX ? 0 : event.deltaY;
        svg.call(
          zoom.translateBy,
          (-dx * unit) / transformRef.current.k,
          (-dy * unit) / transformRef.current.k,
        );
      },
      { passive: false },
    );
    function fit() {
      const bounds = g.node()?.getBBox();
      if (!bounds || !bounds.width) return;
      const w = host.current!.clientWidth,
        h = host.current!.clientHeight;
      const scale = Math.min(1.15, (w - 56) / bounds.width, (h - 70) / bounds.height);
      svg.call(
        zoom.transform,
        d3.zoomIdentity
          .translate(w / 2, h / 2)
          .scale(Math.max(0.15, scale))
          .translate(-bounds.x - bounds.width / 2, -bounds.y - bounds.height / 2),
      );
    }
    fitRef.current = fit;
    zoomRef.current = (factor) => svg.transition().duration(180).call(zoom.scaleBy, factor);
    const observer = new ResizeObserver(() => {
      const width = host.current?.clientWidth ?? 0,
        height = host.current?.clientHeight ?? 0;
      if (width !== sizeRef.current.width || height !== sizeRef.current.height) {
        sizeRef.current = { width, height };
        fit();
      }
    });
    // Refitted the graph when its host resized and removed the observer and
    // zoom listeners when React replaced or unmounted this canvas.
    observer.observe(host.current);
    if (!initialized.current) {
      fit();
      initialized.current = true;
    } else svg.call(zoom.transform, transformRef.current);
    return () => {
      window.removeEventListener('keydown', cancelConnector);
      hostElement.classList.remove('is-linking');
      observer.disconnect();
      svg.on('.zoom', null);
      svg.on('.trackpad', null);
      svg.on('.drag', null).on('.selection', null);
      svg.interrupt();
    };
  }, [
    graph,
    selected,
    search,
    onSelect,
    scopeIds,
    onToggleScope,
    onEdgeSelect,
    markerId,
    compact,
    connecting,
    onViewportCenter,
    selectionIds,
    edgeSelectionIds,
    onGroupSelect,
    tool,
  ]);
  return (
    <div
      className={`canvas-host relative border border-[#2a3448] rounded-xl overflow-hidden h-[clamp(510px,62vh,760px)] min-h-127.5 isolate ${expanded ? 'fixed inset-0 w-screen h-dvh min-h-0 max-h-none border-0 rounded-none z-1000' : ''} fullscreen:w-screen fullscreen:h-dvh fullscreen:min-h-0 fullscreen:max-h-none fullscreen:border-0 fullscreen:rounded-none tool-${tool}${connecting ? ' connect-mode' : ''}`}
      ref={host}
      tabIndex={0}
      onPointerDown={(event) => {
        if (!(
          event.target instanceof Element &&
          event.target.closest('input,textarea,select,button,summary,[data-editor-panel]')
        ))
          host.current?.focus({ preventScroll: true });
      }}
    >
      <div className="absolute top-3.5 left-3.5 z-12 max-xs:max-w-[calc(100%-77px)] max-xs:left-2.5">{toolbar}</div>
      <button
        className="w-11 h-11 absolute top-3.5 right-3.5 z-12 bg-[#152031ed] border border-[#34485c] rounded-xl shadow-[0_8px_25px_#0004] grid place-items-center cursor-pointer text-[#a8bbd2] hover:bg-[#2b3d52] hover:text-[#f0f7ff] max-xs:right-2.5 max-xs:w-7.25 max-xs:h-8"
        aria-label={canvasFullscreen ? 'Exit canvas fullscreen' : 'Enter canvas fullscreen'}
        title={canvasFullscreen ? 'Exit fullscreen · Esc' : 'Fullscreen canvas'}
        onClick={async () => {
          try {
            if (expanded) setExpanded(false);
            else if (document.fullscreenElement === host.current) await document.exitFullscreen();
            else if (host.current?.requestFullscreen) await host.current.requestFullscreen();
            else setExpanded(true);
          } catch {
            setExpanded(true);
          }
        }}
      >
        <CanvasIcon name={canvasFullscreen ? 'collapse' : 'expand'} />
      </button>
      <div className="absolute top-18.5 left-5 max-xs:top-26.25 text-[8px] text-[#7d95b0] flex items-center gap-1.5 pointer-events-none z-10">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#73d9af] align-middle mr-1" />{' '}
        {connecting
          ? 'CONNECT MODE'
          : tool === 'pan'
            ? 'PAN MODE'
            : tool === 'box'
              ? 'BOX SELECT'
              : 'SELECT MODE'}{' '}
        <span className="text-[#687e98] text-[10px] max-xs:hidden">
          {connecting
            ? 'Choose a source, then a destination · or drag a handle'
            : tool === 'pan'
              ? 'Drag or two-finger scroll to pan · pinch to zoom'
              : tool === 'box'
                ? 'Drag around nodes · Shift to extend selection'
                : 'Click to select · Shift-click for multiple · Delete to remove'}
        </span>
      </div>
      <svg ref={ref} aria-label="Financial account connections" className="financial-canvas w-full h-full block" />
      {(selectionIds.length > 0 || edgeSelectionIds.length > 0) && (
        <div className="absolute bottom-16 left-5 px-3 py-2 border border-[#386051] rounded-lg text-[#a2ead4] bg-[#132c29ed] text-[11px] pointer-events-none" role="status">
          {selectionIds.length} nodes · {edgeSelectionIds.length} lines selected{' '}
          <span className="ml-3.5 text-[#91a7bd] max-md:hidden">
            {shortcuts.remove} to remove · {shortcuts.undo} to restore
          </span>
        </div>
      )}
      {panel && <div data-editor-panel="true" className="absolute top-3.5 right-17 max-w-[calc(100%-28px)] w-95 max-h-[calc(100%-28px)] z-15 overflow-y-auto border border-[#3a4f68] rounded-[14px] bg-[#131e2ef5] backdrop-blur-[18px] shadow-[0_14px_45px_#0008] max-xs:top-17 max-xs:right-2.5 max-xs:left-2.5 max-xs:w-[calc(100%-20px)] max-xs:max-w-[calc(100%-20px)]">{panel}</div>}
      {feedback && (
        <div className="absolute bottom-16.25 left-5 right-5 text-xs text-[#f8cd91] pointer-events-none" role="status">
          {feedback}
        </div>
      )}
      {!graph.nodes.length && (
        <div className="absolute inset-0 flex flex-col justify-center items-center pointer-events-none p-12.5 text-center gap-2">
          <h3 className="text-[15px] font-semibold text-text m-0">Start with your first node</h3>
          <p className="text-[#7b8ea8] text-xs m-0">Add nodes for income, accounts, debts, and expenses to build your scenario.</p>
        </div>
      )}
      <div className="absolute right-4 bottom-4 flex bg-[#172030] border border-[#354056] rounded-[7px] overflow-hidden">
        <button className="border-0 border-r border-[#354056] bg-transparent px-2.75 py-1.75 text-[16px] text-[#a8bbd2] hover:bg-[#2a3750] cursor-pointer grid place-items-center" aria-label="Zoom in" title="Zoom in" onClick={() => zoomRef.current(1.25)}>
          <CanvasIcon name="plus" />
        </button>
        <button className="border-0 border-r border-[#354056] bg-transparent px-2.75 py-1.75 text-[16px] text-[#a8bbd2] hover:bg-[#2a3750] cursor-pointer grid place-items-center" aria-label="Zoom out" title="Zoom out" onClick={() => zoomRef.current(0.8)}>
          <CanvasIcon name="minus" />
        </button>
        <button
          className="border-0 bg-transparent px-2.75 py-1.75 text-[11px] text-[#a8bbd2] hover:bg-[#2a3750] cursor-pointer grid place-items-center"
          aria-label="Fit canvas to nodes"
          title="Fit to nodes"
          onClick={() => fitRef.current()}
        >
          <CanvasIcon name="fit" />
        </button>
      </div>
      <div className="absolute left-5 bottom-5 flex gap-3 flex-wrap pointer-events-none max-md:gap-2 max-md:left-3.5 max-md:bottom-14">
        {types.map((t) => (
          <span key={t} className="inline-flex gap-1.5 items-center text-[9px] text-[#96a7bf] max-md:text-[8px]">
            <i className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: colors[t] }} />
            {typeLabel(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
