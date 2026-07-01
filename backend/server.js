import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import stockRoutes from './routes/stock.js';
import analysisRoutes from './routes/analysis.js';
import newsRoutes from './routes/news.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use('/api/stock', stockRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/news', newsRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
