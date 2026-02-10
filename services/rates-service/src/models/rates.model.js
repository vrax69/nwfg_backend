const db = require('../config/db');

class RatesModel {
  static async findAll() {
    const query = `
      SELECT 
        r.id,
        m.standard_name AS Standard_Utility_Name,
        r.product_name AS Product_Name,
        r.rate AS Rate,
        r.etf_fee AS ETF,
        r.monthly_fee AS MSF,
        r.term_months AS duracion_rate,
        m.state AS State,
        m.service_type AS Service_Type,
        m.logo_url AS Logo_URL,
        m.spl_code AS SPL
      FROM Rates r
      INNER JOIN Utility_Mapping m ON r.utility_id = m.id
      ORDER BY m.standard_name ASC
    `;
    const [rows] = await db.query(query);
    return rows;
  }
}

module.exports = RatesModel;