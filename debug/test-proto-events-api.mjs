import fetch from 'node-fetch';

async function testApi() {
  const baseUrl = 'http://localhost:3118/api/v1';

  // 1. 获取事件列表
  console.log('--- 1. 获取事件列表 ---');
  try {
    const response = await fetch(`${baseUrl}/events?page=1&limit=5`);
    const data = await response.json();

    if (data.data && data.data.length > 0) {
      console.log(`成功获取 ${data.data.length} 个事件`);

      // 2. 尝试获取第一个事件的原子事件
      const event = data.data[0];
      console.log(`\n--- 2. 获取事件 ${event.id} 的原子事件 ---`);

      const protoEventsResponse = await fetch(`${baseUrl}/events/${event.id}/proto-events`);
      const protoEventsData = await protoEventsResponse.json();

      console.log('API 响应状态:', protoEventsResponse.status);
      console.log('完整响应:', JSON.stringify(protoEventsData, null, 2));

      if (protoEventsData.data && protoEventsData.data.length > 0) {
        console.log(`成功获取 ${protoEventsData.data.length} 个原子事件`);

        // 显示一些详细信息
        protoEventsData.data.forEach(pe => {
          console.log(`\n原子事件 ${pe.id}:`);
          console.log(`  原始数据: ${pe.actor_raw} ${pe.action_raw} ${pe.object_raw}`);
          console.log(`  新闻标题: ${pe.news_title}`);
          console.log(`  事件时间: ${pe.event_time}`);
        });
      } else {
        console.log('没有找到原子事件数据');
      }

    } else {
      console.log('没有找到事件数据');
    }

  } catch (error) {
    console.error('错误:', error);
  }
}

testApi();
