#!/usr/bin/env node
/**
 * Trading Monitor Pro - 专业量化交易监控平台
 * 支持：美股、加密货币、A股
 * 实时WebSocket行情推送
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// ============ 股票列表配置 ============
const WATCHLIST = {
    us_stocks: [
        { symbol: 'AAPL', name: '苹果', sector: '科技' },
        { symbol: 'MSFT', name: '微软', sector: '科技' },
        { symbol: 'GOOGL', name: '谷歌', sector: '科技' },
        { symbol: 'AMZN', name: '亚马逊', sector: '科技' },
        { symbol: 'NVDA', name: '英伟达', sector: '半导体' },
        { symbol: 'META', name: 'Meta', sector: '科技' },
        { symbol: 'TSLA', name: '特斯拉', sector: '汽车' },
        { symbol: 'TSM', name: '台积电', sector: '半导体' }
    ],
    crypto: [
        { symbol: 'BTCUSDT', name: '比特币', display: 'BTC' },
        { symbol: 'ETHUSDT', name: '以太坊', display: 'ETH' },
        { symbol: 'SOLUSDT', name: 'Solana', display: 'SOL' },
        { symbol: 'BNBUSDT', name: '币安币', display: 'BNB' }
    ],
    cn_stocks: [
        { symbol: '600519.SS', name: '贵州茅台', sector: '消费' },
        { symbol: '000858.SZ', name: '五粮液', sector: '消费' },
        { symbol: '601318.SS', name: '中国平安', sector: '金融' },
        { symbol: '000001.SZ', name: '平安银行', sector: '金融' },
        { symbol: '600036.SS', name: '招商银行', sector: '金融' },
        { symbol: '002594.SZ', name: '比亚迪', sector: '汽车' }
    ]
};

// ============ HTTP 请求工具 ============
function fetchUrl(url, options = {}) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const req = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                ...options.headers
            },
            timeout: 15000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

// ============ 技术指标计算 ============
function calculateSMA(data, period) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            result.push(sum / period);
        }
    }
    return result;
}

function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    const result = [data[0]];
    for (let i = 1; i < data.length; i++) {
        result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
}

function calculateRSI(data, period = 14) {
    if (data.length < period + 1) return data.map(() => null);
    
    const changes = [];
    for (let i = 1; i < data.length; i++) {
        changes.push(data[i] - data[i - 1]);
    }
    
    const result = [null];
    let avgGain = 0, avgLoss = 0;
    
    for (let i = 0; i < period; i++) {
        if (changes[i] > 0) avgGain += changes[i];
        else avgLoss -= changes[i];
        result.push(null);
    }
    avgGain /= period;
    avgLoss /= period;
    
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result[period] = 100 - (100 / (1 + rs));
    
    for (let i = period; i < changes.length; i++) {
        const change = changes[i];
        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;
        
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
        
        rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        result.push(100 - (100 / (1 + rs)));
    }
    
    return result;
}

function calculateMACD(data, fast = 12, slow = 26, signal = 9) {
    const emaFast = calculateEMA(data, fast);
    const emaSlow = calculateEMA(data, slow);
    const macdLine = emaFast.map((v, i) => v - emaSlow[i]);
    const signalLine = calculateEMA(macdLine, signal);
    const histogram = macdLine.map((v, i) => v - signalLine[i]);
    return { macd: macdLine, signal: signalLine, histogram };
}

function calculateBollingerBands(data, period = 20, multiplier = 2) {
    const sma = calculateSMA(data, period);
    const upper = [], lower = [];
    
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1 || sma[i] === null) {
            upper.push(null);
            lower.push(null);
        } else {
            const slice = data.slice(i - period + 1, i + 1);
            const std = Math.sqrt(slice.reduce((sum, val) => sum + Math.pow(val - sma[i], 2), 0) / period);
            upper.push(sma[i] + multiplier * std);
            lower.push(sma[i] - multiplier * std);
        }
    }
    return { upper, middle: sma, lower };
}

function calculateKDJ(highs, lows, closes, n = 9, m1 = 3, m2 = 3) {
    const length = closes.length;
    const k = [], d = [], j = [];
    let prevK = 50, prevD = 50;
    
    for (let i = 0; i < length; i++) {
        if (i < n - 1) {
            k.push(null);
            d.push(null);
            j.push(null);
        } else {
            const highestHigh = Math.max(...highs.slice(i - n + 1, i + 1));
            const lowestLow = Math.min(...lows.slice(i - n + 1, i + 1));
            const rsv = highestHigh === lowestLow ? 50 : (closes[i] - lowestLow) / (highestHigh - lowestLow) * 100;
            
            const curK = (2 / m1) * rsv + ((m1 - 2) / m1) * prevK;
            const curD = (2 / m2) * curK + ((m2 - 2) / m2) * prevD;
            const curJ = 3 * curK - 2 * curD;
            
            k.push(curK);
            d.push(curD);
            j.push(curJ);
            
            prevK = curK;
            prevD = curD;
        }
    }
    return { k, d, j };
}

// 处理OHLCV数据并计算所有指标
function processOHLCV(timestamps, opens, highs, lows, closes, volumes) {
    const validIndices = [];
    for (let i = 0; i < closes.length; i++) {
        if (closes[i] !== null && closes[i] !== undefined && !isNaN(closes[i])) {
            validIndices.push(i);
        }
    }
    
    const filteredTimestamps = validIndices.map(i => timestamps[i]);
    const filteredOpens = validIndices.map(i => opens[i] || closes[i]);
    const filteredHighs = validIndices.map(i => highs[i] || closes[i]);
    const filteredLows = validIndices.map(i => lows[i] || closes[i]);
    const filteredCloses = validIndices.map(i => closes[i]);
    const filteredVolumes = validIndices.map(i => volumes[i] || 0);
    
    if (filteredCloses.length === 0) return null;
    
    const rsi = calculateRSI(filteredCloses);
    const macdData = calculateMACD(filteredCloses);
    const bb = calculateBollingerBands(filteredCloses);
    const kdj = calculateKDJ(filteredHighs, filteredLows, filteredCloses);
    const sma5 = calculateSMA(filteredCloses, 5);
    const sma10 = calculateSMA(filteredCloses, 10);
    const sma20 = calculateSMA(filteredCloses, 20);
    const sma60 = calculateSMA(filteredCloses, 60);
    
    const currentPrice = filteredCloses[filteredCloses.length - 1];
    const prevPrice = filteredCloses.length > 1 ? filteredCloses[filteredCloses.length - 2] : currentPrice;
    const change = currentPrice - prevPrice;
    const changePct = prevPrice ? (change / prevPrice * 100) : 0;
    
    return {
        timestamps: filteredTimestamps,
        ohlcv: {
            open: filteredOpens,
            high: filteredHighs,
            low: filteredLows,
            close: filteredCloses,
            volume: filteredVolumes
        },
        currentPrice,
        prevClose: prevPrice,
        change,
        changePct,
        rsi,
        macd: macdData,
        bollinger: bb,
        kdj,
        ma: { ma5: sma5, ma10: sma10, ma20: sma20, ma60: sma60 }
    };
}

// 生成交易信号
function generateSignals(data, symbol, name) {
    const signals = [];
    if (!data || !data.rsi || data.rsi.length < 2) return signals;
    
    const lastRsi = data.rsi[data.rsi.length - 1];
    const lastMacd = data.macd.macd[data.macd.macd.length - 1];
    const lastSignal = data.macd.signal[data.macd.signal.length - 1];
    const prevMacd = data.macd.macd[data.macd.macd.length - 2];
    const prevSignal = data.macd.signal[data.macd.signal.length - 2];
    const lastPrice = data.currentPrice;
    const lastBBUpper = data.bollinger?.upper[data.bollinger.upper.length - 1];
    const lastBBLower = data.bollinger?.lower[data.bollinger.lower.length - 1];
    
    if (lastRsi !== null) {
        if (lastRsi > 70) {
            signals.push({ symbol, name, type: 'RSI', action: 'SELL', desc: `RSI超买(${lastRsi.toFixed(1)})`, strength: 2 });
        } else if (lastRsi < 30) {
            signals.push({ symbol, name, type: 'RSI', action: 'BUY', desc: `RSI超卖(${lastRsi.toFixed(1)})`, strength: 2 });
        }
    }
    
    if (prevMacd !== null && lastMacd !== null) {
        if (prevMacd < prevSignal && lastMacd > lastSignal) {
            signals.push({ symbol, name, type: 'MACD', action: 'BUY', desc: 'MACD金叉', strength: 2 });
        } else if (prevMacd > prevSignal && lastMacd < lastSignal) {
            signals.push({ symbol, name, type: 'MACD', action: 'SELL', desc: 'MACD死叉', strength: 2 });
        }
    }
    
    if (lastBBUpper && lastBBLower) {
        if (lastPrice > lastBBUpper) {
            signals.push({ symbol, name, type: 'BB', action: 'SELL', desc: '突破布林上轨', strength: 1 });
        } else if (lastPrice < lastBBLower) {
            signals.push({ symbol, name, type: 'BB', action: 'BUY', desc: '跌破布林下轨', strength: 1 });
        }
    }
    
    return signals;
}

// ============ 数据获取函数 ============

// 获取美股数据
async function fetchUSStock(symbol) {
    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=6mo`;
        const data = await fetchUrl(url);
        
        if (!data.chart || !data.chart.result || !data.chart.result[0]) {
            return null;
        }
        
        const result = data.chart.result[0];
        const quotes = result.indicators.quote[0];
        const timestamps = result.timestamp || [];
        
        const processed = processOHLCV(
            timestamps,
            quotes.open,
            quotes.high,
            quotes.low,
            quotes.close,
            quotes.volume
        );
        
        if (!processed) return null;
        return { symbol, ...processed };
    } catch (error) {
        console.error(`${symbol} fetch error:`, error.message);
        return null;
    }
}

// 获取加密货币日线数据
async function fetchCrypto(symbol) {
    try {
        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=180`;
        const data = await fetchUrl(url);
        
        if (!Array.isArray(data) || data.length === 0) {
            return null;
        }
        
        const timestamps = data.map(k => k[0]);
        const opens = data.map(k => parseFloat(k[1]));
        const highs = data.map(k => parseFloat(k[2]));
        const lows = data.map(k => parseFloat(k[3]));
        const closes = data.map(k => parseFloat(k[4]));
        const volumes = data.map(k => parseFloat(k[5]));
        
        const processed = processOHLCV(timestamps, opens, highs, lows, closes, volumes);
        if (!processed) return null;
        
        return { symbol, ...processed };
    } catch (error) {
        console.error(`${symbol} fetch error:`, error.message);
        return null;
    }
}

// 获取A股数据
async function fetchCNStock(symbol) {
    return await fetchUSStock(symbol);
}

// 获取所有数据
async function fetchAllData() {
    console.log('Fetching all data...');
    const startTime = Date.now();
    
    const results = {
        us_stocks: {},
        crypto: {},
        cn_stocks: {},
        signals: [],
        timestamp: new Date().toISOString()
    };
    
    const usPromises = WATCHLIST.us_stocks.map(async (stock) => {
        const data = await fetchUSStock(stock.symbol);
        if (data) {
            results.us_stocks[stock.symbol] = { ...data, name: stock.name, sector: stock.sector };
            const signals = generateSignals(data, stock.symbol, stock.name);
            results.signals.push(...signals);
        }
    });
    
    const cryptoPromises = WATCHLIST.crypto.map(async (coin) => {
        const data = await fetchCrypto(coin.symbol);
        if (data) {
            results.crypto[coin.display] = { ...data, name: coin.name, display: coin.display };
            const signals = generateSignals(data, coin.display, coin.name);
            results.signals.push(...signals);
        }
    });
    
    const cnPromises = WATCHLIST.cn_stocks.map(async (stock) => {
        const data = await fetchCNStock(stock.symbol);
        if (data) {
            results.cn_stocks[stock.symbol] = { ...data, name: stock.name, sector: stock.sector };
            const signals = generateSignals(data, stock.symbol, stock.name);
            results.signals.push(...signals);
        }
    });
    
    await Promise.all([...usPromises, ...cryptoPromises, ...cnPromises]);
    results.signals.sort((a, b) => (b.strength || 0) - (a.strength || 0));
    
    console.log(`Data fetched in ${Date.now() - startTime}ms`);
    return results;
}

// ============ HTML 页面 ============
const HTML_PAGE = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// ============ HTTP 服务器 ============
let cachedData = null;
let lastFetchTime = 0;
const CACHE_TTL = 30000;

const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    const url = req.url.split('?')[0];
    
    if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML_PAGE);
    } else if (url === '/api/data') {
        try {
            const now = Date.now();
            if (!cachedData || now - lastFetchTime > CACHE_TTL) {
                cachedData = await fetchAllData();
                lastFetchTime = now;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(cachedData));
        } catch (error) {
            console.error('API error:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// ============ WebSocket 服务器 ============
const wss = new WebSocket.Server({ server });

// 存储客户端订阅
const clients = new Map();

// Binance WebSocket 连接
let binanceWs = null;
let binanceReconnectTimer = null;

function connectBinanceStream() {
    const symbols = WATCHLIST.crypto.map(c => c.symbol.toLowerCase());
    const streams = symbols.map(s => `${s}@trade`).join('/');
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    
    console.log('Connecting to Binance WebSocket...');
    
    binanceWs = new WebSocket(wsUrl);
    
    binanceWs.on('open', () => {
        console.log('✅ Binance WebSocket connected');
    });
    
    binanceWs.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.data && msg.data.e === 'trade') {
                const trade = msg.data;
                const symbol = trade.s; // e.g., BTCUSDT
                const coinInfo = WATCHLIST.crypto.find(c => c.symbol === symbol);
                const display = coinInfo?.display || symbol;
                
                const tick = {
                    type: 'tick',
                    market: 'crypto',
                    symbol: display,
                    price: parseFloat(trade.p),
                    quantity: parseFloat(trade.q),
                    time: trade.T,
                    isBuyerMaker: trade.m
                };
                
                // 广播给所有订阅加密货币的客户端
                broadcast(tick);
            }
        } catch (e) {
            // ignore parse errors
        }
    });
    
    binanceWs.on('close', () => {
        console.log('Binance WebSocket disconnected, reconnecting in 5s...');
        binanceReconnectTimer = setTimeout(connectBinanceStream, 5000);
    });
    
    binanceWs.on('error', (err) => {
        console.error('Binance WebSocket error:', err.message);
    });
}

// 广播消息给所有客户端
function broadcast(data) {
    const message = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// 处理客户端连接
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'subscribe') {
                clients.set(ws, msg.symbols || []);
            }
        } catch (e) {
            // ignore
        }
    });
    
    ws.on('close', () => {
        clients.delete(ws);
        console.log('Client disconnected');
    });
});

// 美股实时数据轮询（使用 v8 chart API）
let usStockPrices = {};
let cnStockPrices = {};

async function pollUSStocks() {
    // 使用 v8 chart API 获取最新价格（每个股票单独请求）
    for (const stock of WATCHLIST.us_stocks) {
        try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}?interval=1m&range=1d`;
            const data = await fetchUrl(url);
            
            if (data.chart?.result?.[0]) {
                const result = data.chart.result[0];
                const meta = result.meta;
                const price = meta.regularMarketPrice;
                const prevClose = meta.previousClose || meta.chartPreviousClose;
                
                if (price) {
                    const change = prevClose ? price - prevClose : 0;
                    const changePct = prevClose ? (change / prevClose * 100) : 0;
                    
                    usStockPrices[stock.symbol] = price;
                    
                    const tick = {
                        type: 'tick',
                        market: 'us_stocks',
                        symbol: stock.symbol,
                        price: price,
                        change: change,
                        changePct: changePct,
                        time: Date.now(),
                        marketState: meta.marketState // PRE, REGULAR, POST, CLOSED
                    };
                    
                    broadcast(tick);
                }
            }
        } catch (e) {
            // 静默忽略单个股票的错误
        }
    }
}

// A股实时数据轮询（使用 v8 chart API）
async function pollCNStocks() {
    for (const stock of WATCHLIST.cn_stocks) {
        try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${stock.symbol}?interval=1m&range=1d`;
            const data = await fetchUrl(url);
            
            if (data.chart?.result?.[0]) {
                const result = data.chart.result[0];
                const meta = result.meta;
                const price = meta.regularMarketPrice;
                const prevClose = meta.previousClose || meta.chartPreviousClose;
                
                if (price) {
                    const change = prevClose ? price - prevClose : 0;
                    const changePct = prevClose ? (change / prevClose * 100) : 0;
                    
                    cnStockPrices[stock.symbol] = price;
                    
                    const tick = {
                        type: 'tick',
                        market: 'cn_stocks',
                        symbol: stock.symbol,
                        price: price,
                        change: change,
                        changePct: changePct,
                        time: Date.now(),
                        marketState: meta.marketState
                    };
                    
                    broadcast(tick);
                }
            }
        } catch (e) {
            // 静默忽略单个股票的错误
        }
    }
}

// 启动服务器
server.listen(PORT, () => {
    console.log('');
    console.log('🚀 Trading Monitor Pro 启动成功!');
    console.log('');
    console.log(`📊 打开浏览器访问: http://localhost:${PORT}`);
    console.log('');
    console.log('📡 实时行情:');
    console.log('   加密货币: Binance WebSocket (毫秒级)');
    console.log('   美股: Yahoo Finance 轮询 (每秒)');
    console.log('');
    console.log('监控列表:');
    console.log('  美股:', WATCHLIST.us_stocks.map(s => s.symbol).join(', '));
    console.log('  加密:', WATCHLIST.crypto.map(s => s.display).join(', '));
    console.log('  A股:', WATCHLIST.cn_stocks.map(s => s.name).join(', '));
    console.log('');
    
    // 启动 Binance WebSocket
    connectBinanceStream();
    
    // 每秒轮询美股价格
    setInterval(pollUSStocks, 1000);
    
    // 每秒轮询A股价格
    setInterval(pollCNStocks, 1000);
    
    // 立即获取一次
    pollUSStocks();
    pollCNStocks();
});

// 清理
process.on('SIGINT', () => {
    if (binanceWs) binanceWs.close();
    if (binanceReconnectTimer) clearTimeout(binanceReconnectTimer);
    process.exit();
});
