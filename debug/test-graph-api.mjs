import fetch from 'node-fetch';

async function testGraphApi() {
  const baseUrl = 'http://localhost:3118/api/v1';

  console.log('--- 1. 获取事件图数据 ---');
  try {
    const response = await fetch(`${baseUrl}/events/graph`);
    const data = await response.json();

    console.log('API响应状态:', response.status);
    console.log('节点数量:', data?.data?.nodes?.length || 0);
    console.log('链接数量:', data?.data?.links?.length || 0);

    if (data?.data?.nodes?.length > 0) {
      console.log('\n--- 前5个节点 ---');
      data.data.nodes.slice(0, 5).forEach(node => {
        console.log(`节点 ${node.id}:`);
        console.log(`  名称: ${node.name}`);
        console.log(`  类型: ${node.type}`);
        console.log(`  时间: ${node.start_time}`);
        console.log(`  新闻数量: ${node.total_news_count}`);
      });
    }

  } catch (error) {
    console.error('错误:', error);
  }
}

testGraphApi();
