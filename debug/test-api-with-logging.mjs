import fetch from 'node-fetch';

async function testApi() {
  const baseUrl = 'http://localhost:3118/api/v1';

  console.log('--- 测试 API ---');
  console.log('等待服务器处理请求...');

  // 首先让我们直接调用一次API，然后检查日志
  const response = await fetch(`${baseUrl}/events/graph`);
  const data = await response.json();

  console.log('\nAPI响应:');
  console.log('节点数量:', data.data?.nodes?.length);

  if (data.data?.nodes?.length > 0) {
    console.log('\n前3个节点:');
    data.data.nodes.slice(0, 3).forEach(node => {
      console.log(`- ID: ${node.id}`);
      console.log(`  类型: ${node.type}`);
      console.log(`  名称: ${node.name}`);
    });
  }
}

testApi().catch(console.error);
