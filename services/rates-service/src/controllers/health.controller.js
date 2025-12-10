exports.healthCheck = (req, res) => {
    res.json({
      status: 'ok',
      service: 'rates-service',
      timestamp: new Date().toISOString()
    });
  };
  