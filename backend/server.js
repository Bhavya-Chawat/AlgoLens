const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use('/api/execute', require('./routes/execute'));
app.use('/api/leetcode', require('./routes/leetcode'));
app.use('/api/hint', require('./routes/hint'));

app.listen(PORT, () => {
    console.log(`AlgoLens Backend running on http://localhost:${PORT}`);
});
