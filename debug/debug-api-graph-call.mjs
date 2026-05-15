import fetch from 'node-fetch';

async function debugApiGraphCall() {
  const baseUrl = 'http://localhost:3118/api/v1';

  console.log('--- 调试事件图API ---');
  console.log('步骤1: 首先调用 /events/graph');
  const graphResponse = await fetch(`${baseUrl}/events/graph`);
  const graphData = await graphResponse.json();
  console.log(`节点数量: ${graphData.data?.nodes?.length || 0}`);

  const nodeIds = graphData.data?.nodes?.slice(0, 3).map(node => node.id) || [];
  console.log('前3个节点ID:', nodeIds);

  console.log('\n步骤2: 查询这些节点的原子事件');
  for (const nodeId of nodeIds) {
    const eventsResponse = await fetch(`${baseUrl}/events/${nodeId}`);
    const eventData = await eventsResponse.json();
    console.log(`\n事件 ${nodeId} 详情:`);
    console.log(`- 类型: ${eventData.data?.event_type}`);
    console.log(`- 规范化标题: ${eventData.data?.normalized_data?.title}`);
    console.log(`- 描述: ${eventData.data?.normalized_data?.description}`);
    console.log(`- 新闻数量: ${eventData.data?.total_news_count}`);
  }

  console.log('\n步骤3: 查询这些节点的原子事件');
  for (const nodeId of nodeIds) {
    const protoResponse = await fetch(`${baseUrl}/events/${nodeId}/proto-events`);
    const protoData = await protoResponse.json();
    console.log(`\n事件 ${nodeId} 的原子事件(${protoData.data?.length || 0}个):`);
    if (protoData.data) {
      protoData.data.slice(0, 2).forEach(pe => {
        console.log(`- ${pe.news_title || (pe.actor_raw + ' ' + pe.action_raw)}`);
      });
    }
  }
}

debugApiGraphCall().catch(console.error);
