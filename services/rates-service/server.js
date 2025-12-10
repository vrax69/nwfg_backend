const app = require('./app');
const { testConnections } = require('./src/config/db');

const PORT = process.env.PORT || 4002;

app.listen(PORT, () => {
  console.log(`Rates-service running on port ${PORT}`);
  testConnections();
});
