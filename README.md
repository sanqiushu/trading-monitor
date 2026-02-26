# Trading Monitor Pro - 专业量化交易监控平台

实时监控 **美股**、**A股** 和 **加密货币** 行情，支持 WebSocket 实时推送和专业技术指标分析。

![Trading Monitor Pro](https://img.shields.io/badge/version-2.0-blue) ![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![WebSocket](https://img.shields.io/badge/WebSocket-实时推送-orange)

## 🚀 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务器

```bash
npm start
# 或
node server.js
```

### 访问应用

打开浏览器访问: **http://localhost:8080**

## ✨ 功能特性

### 📊 多市场实时行情

| 市场 | 监控标的 | 数据源 | 更新方式 |
|------|----------|--------|----------|
| **美股** | AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, TSM | Yahoo Finance | 每秒轮询 |
| **A股** | 贵州茅台, 五粮液, 中国平安, 平安银行, 招商银行, 比亚迪 | Yahoo Finance | 每秒轮询 |
| **加密货币** | BTC, ETH, SOL, BNB | Binance WebSocket | 毫秒级实时 |

### 📈 专业技术指标
- **RSI (相对强弱指标)** - 超买/超卖判断
- **MACD** - 趋势动量分析，金叉/死叉信号
- **布林带 (Bollinger Bands)** - 价格通道突破
- **KDJ** - 随机指标
- **均线系统** - MA5 / MA10 / MA20 / MA60

### 🎯 智能交易信号
自动生成买入/卖出信号：
- RSI 超买 (>70) / 超卖 (<30)
- MACD 金叉 / 死叉
- 布林带上轨/下轨突破

### 📉 交互式图表
- **实时 Tick 图** - 显示实时价格变动
- **日K线图** - 支持缩放和拖拽
- **成交量图** - 与K线同步
- **均线叠加** - MA5/MA10/MA20 可视化

### 🔌 WebSocket 实时通信
- 前端与服务端全程 WebSocket 连接
- 加密货币直连 Binance WebSocket（毫秒级）
- 自动重连机制
- 实时显示 ticks/s 统计

## 🔧 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                        前端 (Browser)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ 实时行情面板 │  │  K线图表    │  │   技术指标面板      │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                          ▲                                   │
│                          │ WebSocket                         │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                    Node.js 服务器                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ HTTP Server │  │  WS Server  │  │   数据处理/指标计算  │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│         │                ▲                    ▲              │
└─────────┼────────────────┼────────────────────┼─────────────┘
          │                │                    │
     ┌────▼────┐    ┌──────▼──────┐     ┌──────▼──────┐
     │  静态页面  │    │ Binance WS │     │ Yahoo API  │
     └──────────┘    │  (加密货币)  │     │ (美股/A股) │
                     └─────────────┘     └────────────┘
```

### 数据源
- **美股/A股**: Yahoo Finance v8 API (免费)
- **加密货币**: Binance WebSocket Stream (免费)

### 技术栈
- **后端**: Node.js + ws (WebSocket)
- **前端**: 原生 JavaScript + LightweightCharts
- **通信**: WebSocket 双向实时通信

## 📁 项目结构

```
trading-monitor/
├── server.js      # Node.js 服务器（HTTP + WebSocket）
├── index.html     # 前端单页应用
├── package.json   # 项目配置
└── README.md      # 说明文档
```

## ⚙️ 配置说明

### 修改监控列表

编辑 `server.js` 中的 `WATCHLIST` 对象：

```javascript
const WATCHLIST = {
    us_stocks: [
        { symbol: 'AAPL', name: '苹果', sector: '科技' },
        // 添加更多美股...
    ],
    crypto: [
        { symbol: 'BTCUSDT', name: '比特币', display: 'BTC' },
        // 添加更多加密货币...
    ],
    cn_stocks: [
        { symbol: '600519.SS', name: '贵州茅台', sector: '消费' },
        // 添加更多A股...
    ]
};
```

### 修改端口

```javascript
const PORT = 8080; // 修改为你想要的端口
```

## ⚠️ 免责声明

本工具仅供学习和参考，**不构成任何投资建议**。

- 交易有风险，入市需谨慎
- 技术指标仅供参考，不保证收益
- 请根据自身情况做出投资决策
- Yahoo Finance API 可能有访问限制

## 📝 更新日志

### v2.0 (2026-02)
- ✅ 新增 WebSocket 实时推送架构
- ✅ 支持美股、A股、加密货币三大市场
- ✅ 加密货币接入 Binance WebSocket（毫秒级）
- ✅ 新增 KDJ、多周期均线等技术指标
- ✅ 全新深色主题 UI 设计
- ✅ 实时 Tick 图表

### v1.0 (2024)
- 初始版本，支持 MSFT 和 BTC 监控

---

Made with ❤️ for quantitative trading learning
