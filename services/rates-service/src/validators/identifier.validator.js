function validateIdentifier(data) {
    const required = ["utility_id", "service_type", "identifier_label"];
  
    for (const r of required) {
      if (!data[r]) {
        return `Missing required field: ${r}`;
      }
    }
  
    const allowedServiceTypes = ["Electric", "Gas"];
    if (!allowedServiceTypes.includes(data.service_type)) {
      return "service_type must be Electric or Gas";
    }
  
    const allowedUnits = ["KWH", "THERM", "CCF", "MCF", null, ""];
    if (!allowedUnits.includes(data.unit_of_measure)) {
      return "unit_of_measure must be KWH, THERM, CCF, MCF or null";
    }
  
    return null;
  }
  
  module.exports = { validateIdentifier };
  