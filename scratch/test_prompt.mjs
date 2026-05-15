import { socksFetch } from '../lib/utils/socks-fetch.mjs';

const newsContent = `
特朗普近日在佛罗里达州发表讲话，批评拜登政府的移民政策导致边境危机。他指出，过去三年有超过800万非法移民进入美国，给社会福利和公共安全带来巨大压力。特朗普承诺如果当选将在24小时内解决边境问题。
`;

const prompt = `
你是一个事件抽取系统。

任务：从新闻中提取"客观发生的事件"，不要总结。

事件的定义：
- 任何已经发生、正在发生、或已被当事人公开宣布的动作/行为都是事件
- 公众人物的声明、批评、表态本身是事件
- 已宣布的未来计划也是事件

输出必须是一个 JSON 对象，格式如下：
{
  "events": [
    {
      "actors": ["行为主体"],
      "action": "核心动词",
      "objects": ["作用对象"],
      "event_type": "political",
      "temporal_status": "past",
      "confidence": 0.9
    }
  ]
}

新闻标题：特朗普批评拜登移民政策
新闻正文：${newsContent}
`;

async function testChinaMobile() {
  const url = 'https://maas.gd.chinamobile.com:36007/ai/uifm/open/v1/chat/completions';

  for (let i = 1; i <= 2; i++) {
    console.log(`\n=== China Mobile test ${i} ===`);
    const start = Date.now();
    try {
      const resp = await socksFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer sk-I4OefiOzqPvKeZ4tCsN5DzeK9EIxNZGiuPPuZv5ESrZBM'
        },
        body: JSON.stringify({
          model: 'minimax-m25',
          messages: [
            { role: 'system', content: 'You are an expert intelligence analyst. Extract atomic facts.' },
            { role: 'user', content: prompt }
          ]
        }),
        timeout: 120
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log('Status:', resp.status, 'Time:', elapsed + 's');
      const data = await resp.json();
      if (data.choices?.[0]?.message?.content) {
        console.log('Response length:', data.choices[0].message.content.length, 'chars');
      }
    } catch (e) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log('FAIL after', elapsed + 's:', e.message?.substring(0, 200));
    }
  }
}

async function testFreemodel() {
  const url = 'https://api.freemodel.dev/v1/chat/completions';

  for (let i = 1; i <= 2; i++) {
    console.log(`\n=== Freemodel test ${i} ===`);
    const start = Date.now();
    try {
      const resp = await socksFetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer fe_oa_64ed1f817802046cef35f42430f759ab23cb731f3cbcad83'
        },
        body: JSON.stringify({
          model: 'gpt-5.5',
          messages: [
            { role: 'system', content: 'You are an expert intelligence analyst. Extract atomic facts.' },
            { role: 'user', content: prompt }
          ]
        }),
        timeout: 120
      });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log('Status:', resp.status, 'Time:', elapsed + 's');
      const data = await resp.json();
      if (data.choices?.[0]?.message?.content) {
        console.log('Response length:', data.choices[0].message.content.length, 'chars');
      }
    } catch (e) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log('FAIL after', elapsed + 's:', e.message?.substring(0, 200));
    }
  }
}

console.log('=== Testing with REALISTIC prompt ===');
testChinaMobile().then(() => testFreemodel());
