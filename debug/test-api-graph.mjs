import fetch from 'node-fetch';

const r = await fetch('http://localhost:3118/api/v1/events/graph');
const d = await r.json();
const nodes = d.data?.nodes || [];
const links = d.data?.links || [];
console.log('API returned nodes:', nodes.length, 'links:', links.length);

const nodeIds = new Set(nodes.map(n => n.id));
const missing = [];
links.forEach(link => {
  if (!nodeIds.has(link.source)) missing.push(link.source);
  if (!nodeIds.has(link.target)) missing.push(link.target);
});
if (missing.length > 0) {
  console.log('MISSING node IDs in links but not in nodes:', [...new Set(missing)]);
} else {
  console.log('All link endpoints are present in nodes - OK');
}
