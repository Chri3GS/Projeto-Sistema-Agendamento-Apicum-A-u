function toPublicReservation(id, data) {
    const usuario = typeof data.usuario === 'string' && !data.usuario.includes('@')
        ? data.usuario
        : 'Usuário';
    const reservation = { id, usuario };
    [
        'ambiente',
        'status',
        'data',
        'dataInicio',
        'dataFim',
        'dataReserva',
        'horaInicio',
        'horaFim',
        'motivo'
    ].forEach((field) => {
        if (typeof data[field] === 'string') reservation[field] = data[field];
    });
    return reservation;
}

module.exports = { toPublicReservation };
