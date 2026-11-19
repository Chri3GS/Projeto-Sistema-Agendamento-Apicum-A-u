const RESERVATION_LIMITS = Object.freeze({
    biblioteca: 15,
    'laboratorio-de-informatica': 20,
    'sala-01': 1,
    'sala-02': 1,
    'sala-de-reuniao': 1
});

const ENVIRONMENT_IDS_BY_NAME = Object.freeze({
    biblioteca: 'biblioteca',
    'laboratorio de informatica': 'laboratorio-de-informatica',
    'sala 01': 'sala-01',
    'sala 02': 'sala-02',
    'sala de reuniao': 'sala-de-reuniao'
});

function reservationLimitFor(environmentId, environmentName = '') {
    const normalizedName = typeof environmentName === 'string'
        ? environmentName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR')
        : '';
    const configuredId = Object.prototype.hasOwnProperty.call(RESERVATION_LIMITS, environmentId)
        ? environmentId
        : ENVIRONMENT_IDS_BY_NAME[normalizedName];
    return Object.prototype.hasOwnProperty.call(RESERVATION_LIMITS, configuredId)
        ? RESERVATION_LIMITS[configuredId]
        : 1;
}

module.exports = { RESERVATION_LIMITS, reservationLimitFor };
