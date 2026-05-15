import fetch from 'node-fetch';

async function testApi() {
  const baseUrl = 'http://localhost:3118/api/v1';

  try {
    const response = await fetch(`${baseUrl}/events/graph?page=1&limit=5`);
    const data = await response.json();

    console.log('API响应状态:', response.status);
    console.log('节点数量:', data.data?.nodes?.length || 0);
    console.log('链接数量:', data.data?.links?.length || 0);

    if (data.data?.nodes) {
      console.log('节点详情:');
      data.data.nodes.slice(0, 5).forEach(node => {
        console.log(`- 事件ID: ${node.id}`);
        console.log(`  名称: ${node.name}`);
        console.log(`  类型: ${node.type}`);
        console.log(`  新闻数量: ${node.total_news_count}`);
      });
    }

  } catch (error) {
    console.error('错误:', error);
  }
}

testApi().then(() => {
  process.exit(0);
});
