<!--
@module app:views/platform/HomePage
职责：提供主应用 HomePage 能力，围绕 模块入口、副作用注册或内部组合逻辑 连接视图、服务、布局、路由或平台租户流程。
边界：只处理 app 层编排和 UI 入口，不定义底层包的核心协议，也不绕过配置真源。
AI用途：需要理解应用入口、平台视图或业务服务接线时，用本模块定位 views/platform/HomePage。
-->
<template>
  <div class="home-page">
    <header class="hero">
      <nav class="hero-nav">
        <router-link to="/" class="hero-logo" aria-label="SPARK AppWorks">
          <span class="hero-logo__mark"><DisplayIcon icon="Lightning" :icon-size="18" /></span>
          <span>SPARK AppWorks</span>
        </router-link>
        <div class="hero-nav__links" aria-label="首页导航">
          <a href="#era" class="nav-link">意图时代</a>
          <a href="#center" class="nav-link">中枢能力</a>
          <a href="#governance" class="nav-link">治理闭环</a>
          <a href="#scenarios" class="nav-link">场景</a>
        </div>
        <router-link to="/login" class="nav-link nav-link--primary">登录</router-link>
      </nav>

      <div class="hero-body">
        <div class="hero-copy">
          <h1 class="hero-title">
            从界面时代<br>
            进入意图时代
          </h1>
          <p class="hero-desc">
            SPARK AppWorks 是企业 AI 中枢。它把人的业务意图接入数据、流程、权限和决策，
            让企业不再靠人穿梭系统搬运信息，而是由 AI 在受治理的链路中直接执行业务。
          </p>
          <div class="hero-actions">
            <router-link to="/login" class="btn btn--primary">进入平台</router-link>
            <router-link to="/login" class="btn btn--ghost" @click="setRegisterTab">预约演示</router-link>
          </div>
        </div>

        <div class="hero-console" aria-label="企业 AI 中枢示意">
          <div class="console-header">
            <span class="console-dot"></span>
            <span>Enterprise AI Center</span>
            <span class="console-status">governed</span>
          </div>
          <div class="console-core">
            <div class="intent-stream">
              <span v-for="signal in intentSignals" :key="signal">{{ signal }}</span>
            </div>
            <div class="center-node">
              <DisplayIcon icon="Lightning" :icon-size="30" />
              <strong>AI 中枢</strong>
              <span>理解意图 · 调度系统 · 写回业务</span>
            </div>
            <div class="capability-ring">
              <span
                v-for="capability in capabilityNodes"
                :key="capability.title"
                class="capability-node"
              >
                {{ capability.title }}
              </span>
            </div>
          </div>
          <div class="console-footer">
            <span v-for="item in heroFooterItems" :key="item">{{ item }}</span>
          </div>
        </div>
      </div>
    </header>

    <main>
      <section id="era" class="section era-section">
        <div class="section-heading">
          <span class="section-kicker">01</span>
          <h2>企业软件的入口正在改变</h2>
          <p>过去是人理解系统，再用手操作系统；意图时代，是系统理解人，再由 AI 调度企业资源。</p>
        </div>
        <div class="era-grid">
          <article class="era-panel era-panel--past">
            <h3>界面时代</h3>
            <div class="era-flow">
              <span>找菜单</span>
              <span>点页面</span>
              <span>搬数据</span>
              <span>等审批</span>
            </div>
            <p>系统越来越多，流程越来越长，人被迫成为 ERP、CRM、报表和审批之间的总线。</p>
          </article>
          <article class="era-panel era-panel--future">
            <h3>意图时代</h3>
            <div class="era-flow">
              <span>说意图</span>
              <span>查约束</span>
              <span>调系统</span>
              <span>改业务</span>
            </div>
            <p>人表达目标，AI 中枢理解上下文、检查权限与前置条件，再把动作落到企业数据和流程里。</p>
          </article>
        </div>
      </section>

      <section id="center" class="section center-section">
        <div class="section-heading section-heading--left">
          <span class="section-kicker">02</span>
          <h2>一个中枢，连接企业核心能力</h2>
          <p>SPARK 不把 AI 困在写代码这件事上。它面向企业运行状态，把数据、流程、权限、报表、页面与 API 变成可理解、可验证、可执行的能力网络。</p>
        </div>
        <div class="center-map">
          <div class="map-axis map-axis--horizontal"></div>
          <div class="map-axis map-axis--vertical"></div>
          <div class="map-core">
            <DisplayIcon icon="Connection" :icon-size="28" />
            <strong>SPARK AI Center</strong>
            <span>业务意图进入企业系统的统一入口</span>
          </div>
          <article
            v-for="capability in capabilityCards"
            :key="capability.title"
            class="map-node"
            :class="`map-node--${capability.position}`"
          >
            <DisplayIcon :icon="capability.icon" :icon-size="20" />
            <h3>{{ capability.title }}</h3>
            <p>{{ capability.description }}</p>
          </article>
        </div>
      </section>

      <section id="governance" class="section governance-section">
        <div class="section-heading">
          <span class="section-kicker">03</span>
          <h2>企业 AI 需要的不是自由发挥，而是可治理的执行链路</h2>
          <p>每一次业务动作都要先通过语义、数据、权限和审计门控。AI 可以直接办事，但不能绕过企业规则。</p>
        </div>
        <div class="governance-rail">
          <article
            v-for="(step, index) in governanceSteps"
            :key="step.title"
            class="governance-step"
          >
            <span class="step-index">0{{ index + 1 }}</span>
            <h3>{{ step.title }}</h3>
            <p>{{ step.description }}</p>
          </article>
        </div>
      </section>

      <section id="scenarios" class="section scenario-section">
        <div class="section-heading section-heading--left">
          <span class="section-kicker">04</span>
          <h2>同一个中枢，服务不同层级的企业判断</h2>
          <p>老板看运行效率，CIO 看治理边界，伙伴看平台外延。SPARK 的价值不止在页面生成，而在企业运行方式升级。</p>
        </div>
        <div class="scenario-grid">
          <article v-for="scenario in executiveScenarios" :key="scenario.title" class="scenario-card">
            <DisplayIcon :icon="scenario.icon" :icon-size="24" />
            <h3>{{ scenario.title }}</h3>
            <p>{{ scenario.description }}</p>
          </article>
        </div>
      </section>

      <section class="final-cta">
        <div class="final-cta__inner">
          <h2>让企业从使用系统，走向调度系统</h2>
          <p>当业务意图能够被 AI 理解、验证、执行和追踪，企业软件就不再只是界面集合，而成为可被智能中枢持续调动的运行体系。</p>
          <div class="final-actions">
            <router-link to="/login" class="btn btn--primary">进入平台</router-link>
            <router-link to="/login" class="btn btn--ghost" @click="setRegisterTab">预约演示</router-link>
          </div>
          <div class="final-tags" aria-label="SPARK 价值标签">
            <span v-for="tag in finalTags" :key="tag">{{ tag }}</span>
          </div>
        </div>
      </section>
    </main>

    <footer class="home-footer">
      <span>© {{ year }} SPARK AppWorks</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 平台首页，展示 SPARK 企业 AI 中枢定位；属于平台路由页，不允许作为 SparkNode 组件配置生成。
 */
import {DisplayIcon} from '@spark-appworks/spark-component'

const year = new Date().getFullYear()

const intentSignals = ['文本意图', '语音指令', '图片证据', '草图方案'] as const
const heroFooterItems = ['战略决策', '治理可控', '生态协同', '业务直达'] as const
const finalTags = ['战略决策', '治理可控', '生态协同', '业务直达'] as const

const capabilityNodes = [
  { title: 'DataSet' },
  { title: 'Workflow' },
  { title: 'API' },
  { title: '权限' },
  { title: '报表' },
  { title: '页面' },
] as const

const capabilityCards = [
  {
    title: 'DataSet',
    description: '企业数据不再只是表单后的记录，而是 AI 可读取、可约束、可写回的业务事实。',
    icon: 'DataBoard',
    position: 'top-left',
  },
  {
    title: 'Workflow',
    description: '审批、协同、状态流转进入同一个调度面，让意图可以沿流程推进。',
    icon: 'Share',
    position: 'top-right',
  },
  {
    title: 'API',
    description: '外部系统能力以受控接口接入，AI 不绕路，不猜测，不越权。',
    icon: 'Connection',
    position: 'middle-left',
  },
  {
    title: '权限',
    description: '身份、角色、数据域和操作边界在执行前校验，企业规则优先于模型自由度。',
    icon: 'Lock',
    position: 'middle-right',
  },
  {
    title: '报表',
    description: '管理层用自然语言提出判断，AI 直接拉取指标、生成视图、解释变化。',
    icon: 'Monitor',
    position: 'bottom-left',
  },
  {
    title: '页面配置',
    description: '当确实需要新界面，SPARK 生成的是可治理配置，而不是一次性的代码孤岛。',
    icon: 'SetUp',
    position: 'bottom-right',
  },
] as const

const governanceSteps = [
  {
    title: '语义理解',
    description: '把人说的话、上传的图、画出的草图收敛成明确业务意图。',
  },
  {
    title: '前置校验',
    description: '检查数据、流程、权限、必填信息和业务上下文是否具备。',
  },
  {
    title: '结构验证',
    description: '用 schema、模型协议和工具参数校验动作是否合法。',
  },
  {
    title: '执行追踪',
    description: '记录调用链、结果、审计信息和可回滚线索。',
  },
] as const

const executiveScenarios = [
  {
    title: '董事会与经营层',
    description: '不用等待层层汇总，直接用意图触发分析、追问指标、下达业务动作。',
    icon: 'OfficeBuilding',
  },
  {
    title: 'CIO 与治理团队',
    description: '把 AI 纳入权限、审计、数据口径和流程边界，而不是放任模型接管系统。',
    icon: 'Lock',
  },
  {
    title: '生态伙伴与平台方',
    description: '围绕同一个中枢扩展行业能力、业务插件和系统连接，形成可复用平台资产。',
    icon: 'Connection',
  },
] as const

function setRegisterTab() {
  sessionStorage.setItem('spark_login_tab', 'register-tenant')
}
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  overflow-x: hidden;
  color: #101827;
  background: #f7f9fc;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

.hero {
  position: relative;
  min-height: min(920px, 100vh);
  padding: 22px clamp(20px, 4vw, 64px) 44px;
  color: #eaf4ff;
  background:
    linear-gradient(120deg, rgba(45, 212, 191, 0.08), transparent 38%),
    linear-gradient(150deg, #04101a 0%, #071522 54%, #0a1824 100%);
  overflow: hidden;
}

.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.7), transparent 86%);
  pointer-events: none;
}

.hero-nav,
.hero-body,
.section,
.final-cta,
.home-footer {
  position: relative;
  z-index: 1;
}

.hero-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  max-width: 1240px;
  margin: 0 auto;
}

.hero-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #f8fbff;
  font-size: 16px;
  font-weight: 760;
  text-decoration: none;
  letter-spacing: 0;
}

.hero-logo__mark {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(125, 211, 252, 0.32);
  border-radius: 8px;
  color: #67e8f9;
  background: rgba(8, 47, 73, 0.46);
}

.hero-nav__links {
  display: flex;
  align-items: center;
  gap: clamp(12px, 2vw, 28px);
}

.nav-link {
  color: rgba(226, 232, 240, 0.76);
  font-size: 13px;
  font-weight: 650;
  text-decoration: none;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
}

.nav-link:hover {
  color: #ffffff;
}

.nav-link--primary {
  padding: 9px 16px;
  border: 1px solid rgba(125, 211, 252, 0.42);
  border-radius: 8px;
  color: #e0faff;
  background: rgba(14, 165, 233, 0.12);
}

.nav-link--primary:hover {
  border-color: rgba(103, 232, 249, 0.82);
  background: rgba(14, 165, 233, 0.2);
}

.hero-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 0.88fr);
  gap: clamp(40px, 6vw, 92px);
  align-items: center;
  max-width: 1240px;
  min-height: calc(min(920px, 100vh) - 96px);
  margin: 0 auto;
  padding: 56px 0 68px;
}

.hero-copy {
  max-width: 680px;
}

.hero-title {
  margin: 0 0 26px;
  color: #f8fbff;
  font-size: clamp(46px, 6.5vw, 82px);
  font-weight: 820;
  line-height: 1.03;
  letter-spacing: 0;
}

.hero-desc {
  max-width: 620px;
  margin: 0 0 36px;
  color: rgba(226, 232, 240, 0.78);
  font-size: 18px;
  line-height: 1.9;
}

.hero-actions,
.final-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.btn {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  padding: 0 22px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 720;
  line-height: 1;
  text-decoration: none;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.btn:hover {
  transform: translateY(-1px);
}

.btn--primary {
  border: 1px solid #67e8f9;
  color: #051018;
  background: linear-gradient(135deg, #67e8f9 0%, #38bdf8 100%);
  box-shadow: 0 16px 36px rgba(14, 165, 233, 0.26);
}

.btn--ghost {
  border: 1px solid rgba(148, 163, 184, 0.36);
  color: #e2e8f0;
  background: rgba(15, 23, 42, 0.24);
}

.btn--ghost:hover {
  border-color: rgba(103, 232, 249, 0.72);
  background: rgba(14, 165, 233, 0.14);
}

.hero-console {
  border: 1px solid rgba(125, 211, 252, 0.26);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(15, 23, 42, 0.82), rgba(2, 6, 23, 0.74)),
    rgba(15, 23, 42, 0.72);
  box-shadow: 0 30px 90px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(18px);
}

.console-header {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  color: rgba(226, 232, 240, 0.72);
  font-size: 12px;
  font-weight: 700;
}

.console-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #2dd4bf;
  box-shadow: 0 0 14px rgba(45, 212, 191, 0.7);
}

.console-status {
  margin-left: auto;
  color: #67e8f9;
}

.console-core {
  display: grid;
  gap: 28px;
  padding: clamp(24px, 4vw, 38px);
}

.intent-stream,
.capability-ring,
.console-footer,
.final-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.intent-stream span,
.capability-node,
.console-footer span,
.final-tags span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 8px;
  color: rgba(226, 232, 240, 0.78);
  background: rgba(15, 23, 42, 0.62);
  font-size: 12px;
  font-weight: 700;
}

.center-node {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 210px;
  border: 1px solid rgba(103, 232, 249, 0.26);
  border-radius: 8px;
  color: #e0faff;
  background:
    linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.1), transparent),
    linear-gradient(180deg, rgba(8, 47, 73, 0.34), rgba(15, 23, 42, 0.18));
  text-align: center;
}

.center-node strong {
  font-size: 28px;
  font-weight: 800;
}

.center-node span {
  color: rgba(226, 232, 240, 0.64);
  font-size: 13px;
}

.capability-ring {
  justify-content: center;
}

.console-footer {
  padding: 18px;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  justify-content: space-between;
}

.section {
  max-width: 1180px;
  margin: 0 auto;
  padding: 104px clamp(20px, 4vw, 48px);
}

.section-heading {
  max-width: 760px;
  margin: 0 auto 48px;
  text-align: center;
}

.section-heading--left {
  margin-left: 0;
  text-align: left;
}

.section-kicker {
  display: block;
  margin-bottom: 16px;
  color: #0284c7;
  font-size: 13px;
  font-weight: 800;
}

.section-heading h2 {
  margin: 0;
  color: #0f172a;
  font-size: clamp(32px, 4vw, 48px);
  font-weight: 800;
  line-height: 1.18;
  letter-spacing: 0;
}

.section-heading p {
  margin: 18px 0 0;
  color: #475569;
  font-size: 16px;
  line-height: 1.85;
}

.era-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
}

.era-panel,
.scenario-card,
.governance-step,
.map-node {
  border: 1px solid #dbe4ee;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.06);
}

.era-panel {
  padding: clamp(24px, 4vw, 38px);
}

.era-panel--future {
  border-color: rgba(14, 165, 233, 0.32);
  background: linear-gradient(180deg, #ffffff, #f0fbff);
}

.era-panel h3 {
  margin: 0 0 20px;
  color: #0f172a;
  font-size: 26px;
  font-weight: 780;
}

.era-flow {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 22px;
}

.era-flow span {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  border: 1px solid #dbe4ee;
  border-radius: 8px;
  color: #334155;
  background: #f8fafc;
  font-weight: 720;
}

.era-panel--future .era-flow span {
  border-color: rgba(14, 165, 233, 0.24);
  color: #075985;
  background: #e0f7ff;
}

.era-panel p,
.scenario-card p,
.governance-step p,
.map-node p {
  margin: 0;
  color: #475569;
  line-height: 1.75;
}

.center-section {
  max-width: 1260px;
}

.center-map {
  position: relative;
  min-height: 720px;
  border: 1px solid #dbe4ee;
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(248, 250, 252, 0.95)),
    linear-gradient(90deg, rgba(14, 165, 233, 0.08), transparent);
  overflow: hidden;
}

.map-axis {
  position: absolute;
  background: linear-gradient(90deg, transparent, rgba(14, 165, 233, 0.42), transparent);
}

.map-axis--horizontal {
  left: 10%;
  right: 10%;
  top: 50%;
  height: 1px;
}

.map-axis--vertical {
  top: 12%;
  bottom: 12%;
  left: 50%;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(14, 165, 233, 0.42), transparent);
}

.map-core {
  position: absolute;
  left: 50%;
  top: 50%;
  display: grid;
  width: min(320px, 36vw);
  min-height: 180px;
  place-items: center;
  gap: 8px;
  padding: 26px;
  border: 1px solid rgba(14, 165, 233, 0.34);
  border-radius: 8px;
  color: #075985;
  background: #effbff;
  text-align: center;
  transform: translate(-50%, -50%);
  box-shadow: 0 24px 60px rgba(14, 165, 233, 0.14);
}

.map-core strong {
  color: #0f172a;
  font-size: 22px;
}

.map-core span {
  color: #475569;
  font-size: 13px;
  line-height: 1.6;
}

.map-node {
  position: absolute;
  display: grid;
  gap: 10px;
  width: min(260px, 24vw);
  padding: 22px;
}

.map-node h3 {
  margin: 0;
  color: #0f172a;
  font-size: 18px;
}

.map-node--top-left { left: 7%; top: 9%; }
.map-node--top-right { right: 7%; top: 9%; }
.map-node--middle-left { left: 7%; top: 42%; }
.map-node--middle-right { right: 7%; top: 42%; }
.map-node--bottom-left { left: 7%; bottom: 9%; }
.map-node--bottom-right { right: 7%; bottom: 9%; }

.governance-section {
  max-width: 1240px;
}

.governance-rail {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.governance-step {
  display: grid;
  gap: 14px;
  padding: 24px;
}

.step-index {
  color: #0284c7;
  font-size: 12px;
  font-weight: 800;
}

.governance-step h3,
.scenario-card h3 {
  margin: 0;
  color: #0f172a;
  font-size: 19px;
  font-weight: 780;
}

.scenario-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.scenario-card {
  display: grid;
  gap: 16px;
  padding: 28px;
}

.final-cta {
  padding: 96px clamp(20px, 4vw, 48px);
  color: #f8fbff;
  background:
    linear-gradient(120deg, rgba(45, 212, 191, 0.08), transparent 42%),
    linear-gradient(150deg, #061018 0%, #081826 100%);
}

.final-cta__inner {
  max-width: 900px;
  margin: 0 auto;
  text-align: center;
}

.final-cta h2 {
  margin: 0;
  font-size: clamp(32px, 4vw, 50px);
  line-height: 1.18;
}

.final-cta p {
  max-width: 760px;
  margin: 20px auto 34px;
  color: rgba(226, 232, 240, 0.76);
  font-size: 16px;
  line-height: 1.9;
}

.final-actions,
.final-tags {
  justify-content: center;
}

.final-tags {
  margin-top: 34px;
}

.home-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 68px;
  color: #64748b;
  background: #ffffff;
  font-size: 13px;
  font-weight: 650;
}

@media (max-width: 980px) {
  .hero-nav {
    align-items: flex-start;
  }

  .hero-nav__links {
    display: none;
  }

  .hero-body {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .hero-console {
    max-width: 620px;
  }

  .era-grid,
  .scenario-grid,
  .governance-rail {
    grid-template-columns: 1fr;
  }

  .center-map {
    display: grid;
    min-height: auto;
    gap: 16px;
    padding: 20px;
  }

  .map-axis {
    display: none;
  }

  .map-core,
  .map-node {
    position: static;
    width: auto;
    transform: none;
  }

  .map-core {
    min-height: 150px;
  }
}

@media (max-width: 640px) {
  .hero {
    padding: 18px 18px 34px;
  }

  .hero-title {
    font-size: 42px;
  }

  .hero-desc {
    font-size: 16px;
  }

  .hero-actions,
  .final-actions {
    flex-direction: column;
  }

  .btn {
    width: 100%;
  }

  .console-footer,
  .final-tags {
    justify-content: center;
  }

  .section {
    padding: 72px 18px;
  }

  .section-heading--left {
    text-align: left;
  }

  .era-flow {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
