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
                r.id,
                r.rate_value as Rate,
                r.term as duracion_rate,
                r.status as State,
                r.commodity as Service_Type,
                r.provider_id,
                r.attributes -- JSON Field
            FROM rates r
        `);
      console.log("RatesModel.findAll: Success, rows:", rows?.length);
      return rows;
    } catch (error) {
      console.error("RatesModel.findAll: ERROR", error);
      throw error;
    }
  }

  // Para ADR 007: Lógica de Ingesta Masiva
  static async bulkInsert(providerId, rates) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();

      // 1. Limpieza: Borrar DRAFTS anteriores de este provider
      // PRECAUCIÓN: Esto asume que toda ingesta reemplaza el borrador anterior
      await connection.execute(
        `DELETE FROM rates WHERE provider_id = ? AND status = 'draft'`,
        [providerId]
      );

      // 2. Insertar nuevos registros
      for (const rate of rates) {
        const query = `INSERT INTO rates 
          (provider_id, utility_id, commodity, rate_value, term, status, attributes) 
          VALUES (?, ?, ?, ?, ?, 'draft', ?)`;

        // Serializar attributes a JSON string
        const attributesJson = JSON.stringify(rate.attributes || {});

        await connection.execute(query, [
          rate.provider_id, // Usamos el provider_id de la fila (ya corregido por upload-service)
          rate.utility_id,
          rate.commodity,
          rate.rate_value,
          rate.term,
          attributesJson
        ]);
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