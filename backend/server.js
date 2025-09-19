const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

app.get('/hello', (_, res) => {
  res.type('text/plain').send('hello mundo');
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
