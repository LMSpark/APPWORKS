/**
 * @module tests:support/helpers/page-service-host
 * 职责：为测试宿主装配 PAGE_SERVICE，与 App.vue 一样经 buildPageService 构建。
 * 边界：消息与确认仍走 Element Plus，既有 ElMessage/ElMessageBox 观察点继续有效；不替代页面自身的数据链。
 */
import {createMemoryHistory, createRouter, type Router} from 'vue-router'
import {PAGE_SERVICE, buildPageService, useSparkComponent, type PageServiceCapability} from '@spark-appworks/spark-component'

/** router 省略时使用无路由的内存路由，仅供 navigate 能力占位。已自行 sparkProvide 其他能力的宿主用它取得服务。 */
export function createTestPageService(router?: Router): PageServiceCapability {
  return buildPageService(router ?? createRouter({history: createMemoryHistory(), routes: []}))
}

/** 只能在尚未调用 useSparkComponent 的宿主 setup 中调用；同一 setup 再建上下文会遮蔽先前提供的能力。 */
export function provideTestPageService(router?: Router): PageServiceCapability {
  const service = createTestPageService(router)
  useSparkComponent({type: 'test-page-service-host'}).sparkProvide(PAGE_SERVICE, service)
  return service
}
