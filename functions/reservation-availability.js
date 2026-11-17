function toReservationAvailability(data) {
    let dataReserva = typeof data.dataReserva === 'string' ? data.dataReserva : '';
    let horaInicio = typeof data.horaInicio === 'string' ? data.horaInicio : '';
    let horaFim = typeof data.horaFim === 'string' ? data.horaFim : '';
    let dataInicio = typeof data.dataInicio === 'string' ? data.dataInicio : '';
    let dataFim = typeof data.dataFim === 'string' ? data.dataFim : '';

    if ((!dataReserva || !horaInicio || !horaFim) && typeof data.data === 'string') {
        const range = data.data.match(
            /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2}).*?até\s+(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})/
        );
        const single = data.data.match(
            /(\d{2})\/(\d{2})\/(\d{4})\s+das\s+(\d{2}:\d{2})\s+às\s+(\d{2}:\d{2})/
        );
        if (range) {
            dataInicio = `${range[3]}-${range[2]}-${range[1]}T${range[4]}:00`;
            dataFim = `${range[7]}-${range[6]}-${range[5]}T${range[8]}:00`;
        } else if (single) {
            dataReserva = `${single[3]}-${single[2]}-${single[1]}`;
            horaInicio = single[4];
            horaFim = single[5];
        }
    }

    const status = data.canceladoEm ||
        ['cancelada', 'cancelado', 'cancelled', 'canceled'].includes(
            String(data.status || data.situacao || '').toLocaleLowerCase('pt-BR')
        )
        ? 'cancelada'
        : (typeof data.status === 'string' ? data.status : 'ativa');

    return {
        ...(typeof data.ambienteId === 'string' ? { ambienteId: data.ambienteId } : {}),
        ...(typeof data.ambiente === 'string' ? { ambiente: data.ambiente } : {}),
        status,
        ...(dataReserva ? { dataReserva } : {}),
        ...(horaInicio ? { horaInicio } : {}),
        ...(horaFim ? { horaFim } : {}),
        ...(dataInicio ? { dataInicio } : {}),
        ...(dataFim ? { dataFim } : {})
    };
}

module.exports = { toReservationAvailability };
