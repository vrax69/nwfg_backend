const db = require('../config/db');

class RateModel {
  // Para ADR 006: Resolución de entidades federadas
  static async getById(id) {
    const [rows] = await db.execute('SELECT * FROM rates WHERE id = ?', [id]);
    return rows[0];
  }

  static async findAll() {
    console.log("RatesModel.findAll: Called");
    try {
      const [rows] = await db.execute(`
            SELECT 
                id,
                rate_value as Rate,
                term as duracion_rate,
                status as State,
                commodity as Service_Type,
                provider_id 
            FROM rates
        `);
      console.log("RatesModel.findAll: Success, rows:", rows?.length);
      return rows;
    } catch (error) {
      console.error("RatesModel.findAll: ERROR", error);
      throw error;
    }
  }

  // Para ADR 007: Lógica de Ingesta Masiva
  static async bulkInsert(rates) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      for (const rate of rates) {
        const query = `INSERT INTO rates (provider_id, utility_id, commodity, rate_value, term, status) 
                               VALUES (?, ?, ?, ?, ?, 'draft')`;
        await connection.execute(query, [rate.p_id, rate.u_id, rate.commodity, rate.value, rate.term]);
      }
      await connection.commit();
      return { success: true, count: rates.length };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

module.exports = RateModel;