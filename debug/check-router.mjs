// 直接检查路由定义
import eventsRouter from '../api/v1/events.mjs';

console.log('=== 检查加载的路由 ===');

// 获取所有已定义的路由
const stack = eventsRouter.stack || [];

console.log(`路由栈深度: ${stack.length}`);

stack.forEach((layer, index) => {
  if (layer.route) {
    const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
    const path = layer.route.path;
    console.log(`[${index}] ${methods} ${path}`);

    // 检查是否有我们的调试日志
    if (layer.route.stack) {
      const hasDebug = layer.route.stack.some(m =>
        m.handle && m.handle.toString().includes('[API /graph]')
      );
      console.log(`    包含调试代码: ${hasDebug}`);
    }
  } else if (layer.name === 'router') {
    console.log(`[${index}] 嵌套路由: ${layer.regexp}`);
  }
});