/**
 * 事件演化桑基图组件 (D3.js Sankey Diagram)
 */

class EventSankey {
  constructor(containerId, apiClient) {
    this.container = document.getElementById(containerId);
    this.apiClient = apiClient;
    this.filters = {};
  }

  async init(options = {}) {
    this.filters = options;
    await this.update();
  }

  async update() {
    this.showLoading();
    try {
      const response = await this.apiClient.getEventGraph(this.filters);
      const graph = response.data || { nodes: [], links: [] };

      const nodes = [];
      const links = [];
      const nodeMap = new Map();

      function getOrCreateNode(name, category) {
        const id = `${category}:${name}`;
        if (!nodeMap.has(id)) {
          nodeMap.set(id, nodes.length);
          nodes.push({ name, category, id });
        }
        return nodeMap.get(id);
      }

      graph.links.forEach(link => {
        const sourceEvent = graph.nodes.find(node => node.id === link.source);
        const targetEvent = graph.nodes.find(node => node.id === link.target);
        if (!sourceEvent || !targetEvent) return;

        const fromNode = getOrCreateNode(sourceEvent.name, 'event');
        const relNode = getOrCreateNode(link.type, 'relationship');
        const toNode = getOrCreateNode(targetEvent.name, 'target');

        const weight = link.weight || link.confidence || 1;
        links.push({ source: fromNode, target: relNode, value: weight });
        links.push({ source: relNode, target: toNode, value: weight });
      });

      if (nodes.length > 0 && links.length > 0) {
        this.render({ nodes, links });
      } else {
        this.container.innerHTML = '<div class="loading"><span>暂无足够的关系数据生成桑基图</span></div>';
      }
    } catch (error) {
      console.error('[EventSankey] Load failed:', error);
    } finally {
      this.hideLoading();
    }
  }

  render(data) {
    this.container.innerHTML = '';
    const width = this.container.clientWidth || 800;
    const height = 500;

    const svg = d3.select(this.container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height);

    const sankey = d3.sankey()
      .nodeWidth(15)
      .nodePadding(10)
      .extent([[1, 1], [width - 1, height - 6]]);

    const { nodes, links } = sankey({
      nodes: data.nodes.map(d => Object.assign({}, d)),
      links: data.links.map(d => Object.assign({}, d))
    });

    const node = svg.append('g')
      .attr('stroke', '#000')
      .selectAll('rect')
      .data(nodes)
      .join('rect')
      .attr('x', d => d.x0)
      .attr('y', d => d.y0)
      .attr('height', d => d.y1 - d.y0)
      .attr('width', d => d.x1 - d.x0)
      .attr('fill', d => this.getColor(d.category))
      .append('title')
      .text(d => `${d.name}\n${d.value.toFixed(1)}`);

    svg.append('g')
      .attr('fill', 'none')
      .attr('stroke-opacity', 0.5)
      .selectAll('g')
      .data(links)
      .join('path')
      .attr('d', d3.sankeyLinkHorizontal())
      .attr('stroke', d => this.getColor(d.source.category))
      .attr('stroke-width', d => Math.max(1, d.width));

    svg.append('g')
      .style('font', '10px sans-serif')
      .style('fill', '#e0e0e0')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .attr('x', d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
      .attr('y', d => (d.y1 + d.y0) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
      .text(d => d.name);
  }

  getColor(cat) {
    const colors = {
      'event': '#00d4ff',
      'relationship': '#FF6B6B',
      'target': '#FF9F43'
    };
    return colors[cat] || '#888';
  }

  showLoading() {
    this.container.innerHTML = '<div class="loading"><div class="spinner"></div><span>生成桑基流转图中...</span></div>';
  }

  hideLoading() {
    const l = this.container.querySelector('.loading');
    if (l) l.remove();
  }
}
