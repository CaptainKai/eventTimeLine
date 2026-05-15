import fetch from 'node-fetch';
const r = await fetch('http://localhost:3118/api/v1/events/graph');
const d = await r.json();
console.log('nodes:', d.data?.nodes?.length, 'links:', d.data?.links?.length);
if (d.data?.links?.length > 0) {
  console.log('前5条links:', JSON.stringify(d.data.links.slice(0,5), null, 2));
} else {
  console.log('WARNING: links 为空!');
}
if (d.data?.nodes?.length > 0) {
  console.log('node[0]:', JSON.stringify(d.data.nodes[0], null, 2));
}
