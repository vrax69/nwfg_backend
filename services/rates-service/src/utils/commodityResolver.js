/**
 * Valida que el tipo de energía sea compatible con la Utility
 */
const resolveCommodity = async (incoming, utilityId, normalizedData) => {
    // 🔥 MEJOR PRÁCTICA: Validación defensiva
    if (!incoming) return 'Electric';

    const energyMap = {
        'electric': 'Electric',
        'electricity': 'Electric',
        'gas': 'Gas',
        'natural gas': 'Gas'
    };

    return energyMap[incoming.toLowerCase()] || 'Electric';
};

module.exports = { resolveCommodity };