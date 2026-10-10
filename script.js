// ==========================================
// TECHAGENDA - SISTEMA DE AGENDAMENTO DE AMBIENTES
// ==========================================

// Armazenamento local e em memória
let reservas = JSON.parse(localStorage.getItem('reservas_salvas')) || [];
let todasAsReservas = [...reservas]; // Cache unificado de reservas (Nuvem + Local)
let usuariosCadastrados = JSON.parse(localStorage.getItem('usuarios')) || [];
let usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;

// Expediente padrão de funcionamento do Centro Tecnológico (CT)
const CONFIG_CT = {
    horaAbertura: "08:00",
    horaFechamento: "18:00",
    intervaloMinutos: 60, // Granularidade dos slots da grade
    limiteAntecedenciaDias: 60
};

// Dados detalhados dos ambientes disponíveis
const dadosSalas = {
    "Biblioteca": {
        capacidade: "15 pessoas",
        foto: "imagens/biblioteca.jpeg",
        info: ["Sala climatizada", "Iluminação ambiente", "Capacidade: 15 pessoas"],
        recursos: ["Internet banda larga", "Mesas redondas grandes", "Cadeiras confortáveis", "Acervo de livros", "Suporte humano"]
    },
    "Sala 01": {
        capacidade: "30 pessoas",
        foto: "imagens/sala01.jpeg",
        info: ["Sala climatizada", "Iluminação ambiente", "Capacidade: 30 pessoas"],
        recursos: ["Internet banda larga", "Mesa para docente", "Cadeiras", "Data Show", "Tela de projeção", "Quadro branco", "Caixa de som"]
    },
    "Sala 02": {
        capacidade: "30 pessoas",
        foto: "imagens/sala02.jpeg",
        info: ["Sala climatizada", "Iluminação ambiente", "Capacidade: 30 pessoas"],
        recursos: ["Internet banda larga", "Mesa para docente", "Cadeiras", "Data Show", "Tela de projeção", "Quadro branco", "Caixa de som"]
    },
    "Sala de Reunião": {
        capacidade: "10 pessoas",
        foto: "imagens/salareuniao.jpeg",
        info: ["Sala climatizada", "Iluminação ambiente", "Capacidade: 10 pessoas"],
        recursos: ["Internet banda larga", "Mesas grande", "Cadeiras confortáveis", "Data Show", "Tela de projeção", "Caixa de som"]
    },
    "Laboratório de Informática": {
        capacidade: "20 pessoas",
        foto: "imagens/salainformatica.jpeg",
        info: ["Sala climatizada", "Iluminação ambiente", "Capacidade: 20 pessoas"],
        recursos: ["Internet banda larga", "Computadores", "Mesas", "Cadeiras", "Equipamentos multimídia"]
    }
};

// ==========================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
    atualizarInterfaceUsuario();
    garantirDataInicialReserva();
    trocarFotoReserva();
    carregarGradeHorarios();
    atualizarTabela();
});

// ==========================================
// GERENCIAMENTO DE NAVEGAÇÃO E INTERFACE
// ==========================================

function showSection(sectionId, element) {
    // 1. Esconde todas as seções
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    
    // 2. Mostra a seção clicada
    const secaoAlvo = document.getElementById(sectionId);
    if (secaoAlvo) {
        secaoAlvo.style.display = 'block';
    }

    // 3. Gerencia a classe 'active' nos botões do menu lateral
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    } else {
        const abas = { 'home': 0, 'reserva': 1, 'lista': 2, 'falarComCt': 3 };
        const indice = abas[sectionId];
        if (indice !== undefined) {
            const itensMenu = document.querySelectorAll('.nav-links li');
            if (itensMenu[indice]) itensMenu[indice].classList.add('active');
        }
    }

    // 4. Se for a tela de reserva, atualiza a grade de disponibilidade
    if (sectionId === 'reserva') {
        garantirDataInicialReserva();
        carregarGradeHorarios();
    }

    // 5. Se estiver no celular, fecha o menu lateral após clicar
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('active');
    }
}

// Atalho do botão "Agendar" do card da aba Ambientes
function abrirReserva(nomeAmbiente) {
    const selectAmbiente = document.getElementById('select-ambiente');
    if (selectAmbiente) {
        selectAmbiente.value = nomeAmbiente;
    }
    
    trocarFotoReserva();
    garantirDataInicialReserva();
    showSection('reserva');
    carregarGradeHorarios();
    
    // Rola suavemente até o topo da tela
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function trocarFotoReserva() {
    const selectAmbiente = document.getElementById('select-ambiente');
    const imagem = document.getElementById('img-ambiente-reserva');
    const badgeInfo = document.getElementById('badge-ambiente-info');
    
    if (!selectAmbiente || !imagem) return;
    
    const ambiente = selectAmbiente.value;
    const sala = dadosSalas[ambiente] || dadosSalas["Biblioteca"];
    
    imagem.src = sala.foto || "imagens/biblioteca.jpeg";
    
    if (badgeInfo) {
        badgeInfo.innerText = `${ambiente} • Capacidade: ${sala.capacidade || 'Espaço climatizado'}`;
    }
}

function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

// ==========================================
// MÓDULO DE RESERVA: DATAS, HORÁRIOS E GRADE DINÂMICA
// ==========================================

// Retorna a data de hoje no formato YYYY-MM-DD local
function getHojeFormatado() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

// Converte YYYY-MM-DD para DD/MM/YYYY
function formatarDataBR(dataStr) {
    if (!dataStr) return "";
    const partes = dataStr.split('-');
    if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return dataStr;
}

// Inicializa a data no input e bloqueia datas passadas nativamente
function garantirDataInicialReserva() {
    const inputData = document.getElementById('data-reserva');
    if (!inputData) return;

    const hoje = getHojeFormatado();
    inputData.min = hoje; // Bloqueia datas passadas no seletor nativo

    if (!inputData.value) {
        inputData.value = hoje;
    }
}

// Chamado ao trocar o ambiente no select da tela de Reserva
function aoMudarAmbiente() {
    trocarFotoReserva();
    limparAlertaReserva();
    carregarGradeHorarios();
}

// Chamado ao alterar a data no date picker
function aoMudarData() {
    const inputData = document.getElementById('data-reserva');
    if (!inputData) return;

    const hoje = getHojeFormatado();
    if (inputData.value && inputData.value < hoje) {
        mostrarAlertaReserva("erro", "⚠️ Não é permitido agendar em datas passadas. A data foi redefinida para hoje.");
        inputData.value = hoje;
    } else {
        limparAlertaReserva();
    }

    carregarGradeHorarios();
}

// Chamado ao alterar manualmente hora de início ou término
function aoMudarHorarioManual() {
    const inputInicio = document.getElementById('hora-inicio');
    const inputFim = document.getElementById('hora-fim');
    const inputData = document.getElementById('data-reserva');
    const selectAmbiente = document.getElementById('select-ambiente');

    if (!inputInicio || !inputFim) return;

    const horaInicio = inputInicio.value;
    const horaFim = inputFim.value;
    const dataReserva = inputData ? inputData.value : getHojeFormatado();
    const ambiente = selectAmbiente ? selectAmbiente.value : "Biblioteca";

    // Sincroniza campos ocultos legados
    sincronizarCamposLegados(dataReserva, horaInicio, horaFim);

    if (!horaInicio || !horaFim) {
        atualizarDestaqueSlots(horaInicio, horaFim);
        return;
    }

    // 1. Validação de horário de término anterior ou igual ao início
    if (horaFim <= horaInicio) {
        mostrarAlertaReserva("erro", "⚠️ O horário de término deve ser posterior ao horário de início.");
        atualizarDestaqueSlots(horaInicio, horaFim);
        return;
    }

    // 2. Validação de horário fora do expediente (08:00 às 18:00)
    if (horaInicio < CONFIG_CT.horaAbertura || horaFim > CONFIG_CT.horaFechamento) {
        mostrarAlertaReserva("aviso", `🕒 O Centro Tecnológico funciona das ${CONFIG_CT.horaAbertura} às ${CONFIG_CT.horaFechamento}. Escolha dentro do expediente.`);
        atualizarDestaqueSlots(horaInicio, horaFim);
        return;
    }

    // 3. Validação de horário no passado se a data for hoje
    const agora = new Date();
    const dataHoje = getHojeFormatado();
    if (dataReserva === dataHoje) {
        const [hIni, mIni] = horaInicio.split(':').map(Number);
        const dataHoraIni = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hIni, mIni);
        if (dataHoraIni <= agora) {
            mostrarAlertaReserva("aviso", "⚠️ O horário de início selecionado já passou. Por favor, escolha um horário futuro.");
            atualizarDestaqueSlots(horaInicio, horaFim);
            return;
        }
    }

    // 4. Verificação em tempo real de conflito com reservas existentes
    const conflito = verificarConflito(ambiente, dataReserva, horaInicio, horaFim);
    if (conflito) {
        mostrarAlertaReserva("erro", `⚠️ Conflito de Horário: Já existe uma reserva para ${ambiente} das ${conflito.horaInicio} às ${conflito.horaFim} (${conflito.usuario}).`);
    } else {
        limparAlertaReserva();
    }

    atualizarDestaqueSlots(horaInicio, horaFim);
}

// Sincroniza os inputs antigos com IDs 'data-inicio' e 'data-fim' para compatibilidade total
function sincronizarCamposLegados(data, horaInicio, horaFim) {
    const legacyInicio = document.getElementById('data-inicio');
    const legacyFim = document.getElementById('data-fim');
    if (legacyInicio && data && horaInicio) {
        legacyInicio.value = `${data}T${horaInicio}`;
    }
    if (legacyFim && data && horaFim) {
        legacyFim.value = `${data}T${horaFim}`;
    }
}

// Exibe mensagem dinâmica de feedback/alerta no formulário
function mostrarAlertaReserva(tipo, mensagem) {
    const alerta = document.getElementById('alerta-reserva');
    if (!alerta) return;

    alerta.className = `alerta-reserva ${tipo}`;
    alerta.innerHTML = `<span>${mensagem}</span>`;
    alerta.style.display = 'flex';
}

function limparAlertaReserva() {
    const alerta = document.getElementById('alerta-reserva');
    if (!alerta) return;
    alerta.style.display = 'none';
    alerta.innerHTML = '';
}

// Extrai e normaliza intervalo { inicio: Date, fim: Date, dataStr, horaInicio, horaFim } de qualquer formato de reserva
function extrairIntervaloReserva(res) {
    let inicio = null;
    let fim = null;

    if (res.dataInicio && res.dataFim) {
        inicio = new Date(res.dataInicio);
        fim = new Date(res.dataFim);
    } else if (res.dataOrdenacao) {
        if (typeof res.dataOrdenacao.toDate === 'function') {
            inicio = res.dataOrdenacao.toDate();
        } else if (res.dataOrdenacao instanceof Date) {
            inicio = res.dataOrdenacao;
        } else {
            inicio = new Date(res.dataOrdenacao);
        }
    }

    // Se possui string formatada "DD/MM/YYYY ... HH:mm ... até ... DD/MM/YYYY ... HH:mm"
    if (res.data && typeof res.data === 'string') {
        const partes = res.data.split(' até ');
        if (partes.length === 2) {
            const regex = /(\d{2})\/(\d{2})\/(\d{4}).*?(\d{2}):(\d{2})/;
            const m1 = partes[0].match(regex);
            const m2 = partes[1].match(regex);
            if (m1 && m2) {
                inicio = new Date(Number(m1[3]), Number(m1[2]) - 1, Number(m1[1]), Number(m1[4]), Number(m1[5]));
                fim = new Date(Number(m2[3]), Number(m2[2]) - 1, Number(m2[1]), Number(m2[4]), Number(m2[5]));
            }
        }
    }

    if (inicio && !isNaN(inicio)) {
        if (!fim || isNaN(fim)) {
            // Duração padrão estimada de 1 hora se não houver horário de término registrado
            fim = new Date(inicio.getTime() + 60 * 60 * 1000);
        }
        return {
            inicio,
            fim,
            dataStr: `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-${String(inicio.getDate()).padStart(2, '0')}`,
            horaInicio: `${String(inicio.getHours()).padStart(2, '0')}:${String(inicio.getMinutes()).padStart(2, '0')}`,
            horaFim: `${String(fim.getHours()).padStart(2, '0')}:${String(fim.getMinutes()).padStart(2, '0')}`,
            usuario: res.usuario || "Usuário",
            ambiente: res.ambiente
        };
    }

    return null;
}

// Verifica se um determinado período de agendamento sobrepõe alguma reserva já existente
function verificarConflito(ambiente, dataReserva, horaInicio, horaFim) {
    if (!ambiente || !dataReserva || !horaInicio || !horaFim) return null;

    const [hIni, mIni] = horaInicio.split(':').map(Number);
    const [hFim, mFim] = horaFim.split(':').map(Number);

    const [ano, mes, dia] = dataReserva.split('-').map(Number);
    const novoInicio = new Date(ano, mes - 1, dia, hIni, mIni, 0);
    const novoFim = new Date(ano, mes - 1, dia, hFim, mFim, 0);

    for (const item of todasAsReservas) {
        if (item.ambiente !== ambiente) continue;

        const info = extrairIntervaloReserva(item);
        if (!info) continue;

        // Verifica apenas se a reserva existente for na mesma data
        if (info.dataStr !== dataReserva) continue;

        // Condição de sobreposição: (novoInicio < existenteFim) && (novoFim > existenteInicio)
        if (novoInicio < info.fim && novoFim > info.inicio) {
            return {
                usuario: info.usuario,
                horaInicio: info.horaInicio,
                horaFim: info.horaFim,
                ambiente: info.ambiente
            };
        }
    }

    return null;
}

// ==========================================
// RENDERIZAÇÃO DA GRADE DINÂMICA DE HORÁRIOS
// ==========================================

function carregarGradeHorarios() {
    const container = document.getElementById('container-grade-turnos');
    const inputData = document.getElementById('data-reserva');
    const selectAmbiente = document.getElementById('select-ambiente');
    const textoData = document.getElementById('texto-data-selecionada');
    const tituloGrade = document.getElementById('titulo-grade-disponibilidade');

    if (!container || !inputData || !selectAmbiente) return;

    // Preserva a posição de rolagem para que a navegação não dê saltos ao clicar em um card
    const scrollPosAnterior = container.scrollTop;

    const ambiente = selectAmbiente.value;
    const dataReserva = inputData.value || getHojeFormatado();

    if (textoData) {
        textoData.innerText = `${formatarDataBR(dataReserva)} • ${ambiente}`;
    }
    if (tituloGrade) {
        tituloGrade.innerText = `Disponibilidade - ${ambiente}`;
    }

    // Configuração dos turnos de funcionamento do CT
    const turnos = [
        {
            nome: "🌅 Turno da Manhã",
            horario: "08:00 às 12:00",
            slots: [
                { inicio: "08:00", fim: "09:00" },
                { inicio: "09:00", fim: "10:00" },
                { inicio: "10:00", fim: "11:00" },
                { inicio: "11:00", fim: "12:00" }
            ]
        },
        {
            nome: "🍽️ Intervalo / Transição",
            horario: "12:00 às 13:00",
            slots: [
                { inicio: "12:00", fim: "13:00" }
            ]
        },
        {
            nome: "🌇 Turno da Tarde",
            horario: "13:00 às 18:00",
            slots: [
                { inicio: "13:00", fim: "14:00" },
                { inicio: "14:00", fim: "15:00" },
                { inicio: "15:00", fim: "16:00" },
                { inicio: "16:00", fim: "17:00" },
                { inicio: "17:00", fim: "18:00" }
            ]
        }
    ];

    const inputInicio = document.getElementById('hora-inicio');
    const inputFim = document.getElementById('hora-fim');
    const horaInicioSel = inputInicio ? inputInicio.value : '';
    const horaFimSel = inputFim ? inputFim.value : '';

    const agora = new Date();
    const dataHoje = getHojeFormatado();
    const eHoje = (dataReserva === dataHoje);

    let html = '';

    turnos.forEach(turno => {
        html += `
            <div class="bloco-turno">
                <div class="titulo-turno">
                    <span>${turno.nome}</span>
                    <span class="badge-turno-horario">${turno.horario}</span>
                </div>
                <div class="grid-slots">
        `;

        turno.slots.forEach(slot => {
            const [hIni, mIni] = slot.inicio.split(':').map(Number);
            const [hFim, mFim] = slot.fim.split(':').map(Number);
            const [ano, mes, dia] = dataReserva.split('-').map(Number);

            const dtSlotIni = new Date(ano, mes - 1, dia, hIni, mIni, 0);
            const dtSlotFim = new Date(ano, mes - 1, dia, hFim, mFim, 0);

            let status = 'disponivel';
            let labelTag = 'Livre';
            let detalheTexto = 'Disponível';
            let disabled = '';
            let onClickAttr = `onclick="selecionarSlotGrade('${slot.inicio}', '${slot.fim}')"`;

            // 1. Checa se o horário já passou hoje
            if (eHoje && dtSlotFim <= agora) {
                status = 'passado';
                labelTag = 'Encerrado';
                detalheTexto = 'Horário passado';
                disabled = 'disabled';
                onClickAttr = '';
            } else {
                // 2. Checa se está ocupado por agendamento existente
                const conflito = verificarConflito(ambiente, dataReserva, slot.inicio, slot.fim);
                if (conflito) {
                    status = 'ocupado';
                    labelTag = 'Reservado';
                    detalheTexto = `Por: ${conflito.usuario}`;
                    disabled = 'disabled';
                    onClickAttr = '';
                } else if (horaInicioSel && horaFimSel && horaFimSel > horaInicioSel) {
                    // 3. Checa se está atualmente selecionado pelo usuário
                    const [hSelIni, mSelIni] = horaInicioSel.split(':').map(Number);
                    const [hSelFim, mSelFim] = horaFimSel.split(':').map(Number);
                    const dtSelIni = new Date(ano, mes - 1, dia, hSelIni, mSelIni, 0);
                    const dtSelFim = new Date(ano, mes - 1, dia, hSelFim, mSelFim, 0);

                    if (dtSlotIni < dtSelFim && dtSlotFim > dtSelIni) {
                        status = 'selecionado';
                        labelTag = 'Selecionado';
                        detalheTexto = 'Horário escolhido';
                    }
                }
            }

            html += `
                <button type="button" 
                        class="slot-btn ${status}" 
                        id="slot-${slot.inicio.replace(':', '')}" 
                        data-inicio="${slot.inicio}" 
                        data-fim="${slot.fim}"
                        ${disabled} 
                        ${onClickAttr}>
                    <div class="slot-hora">🕒 ${slot.inicio} às ${slot.fim}</div>
                    <div class="slot-status">
                        <span>${detalheTexto}</span>
                        <span class="slot-tag ${status === 'disponivel' ? 'livre' : (status === 'ocupado' ? 'reservado' : (status === 'selecionado' ? 'ativo' : 'passado'))}">${labelTag}</span>
                    </div>
                </button>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    container.scrollTop = scrollPosAnterior;
}

// Ao clicar em um slot livre na grade, preenche os inputs automaticamente
function selecionarSlotGrade(inicioStr, fimStr) {
    const inputInicio = document.getElementById('hora-inicio');
    const inputFim = document.getElementById('hora-fim');
    const inputData = document.getElementById('data-reserva');

    if (inputInicio && inputFim) {
        inputInicio.value = inicioStr;
        inputFim.value = fimStr;

        const dataReserva = inputData ? inputData.value : getHojeFormatado();
        sincronizarCamposLegados(dataReserva, inicioStr, fimStr);

        limparAlertaReserva();
        carregarGradeHorarios();
    }
}

// Atualiza o destaque visual dos botões de slot conforme os inputs mudam
function atualizarDestaqueSlots(horaInicio, horaFim) {
    carregarGradeHorarios();
}

// ==========================================
// FLUXO DE SALVAMENTO DE RESERVAS COM VALIDAÇÃO
// ==========================================

async function salvarReserva() {
    // 1. Verificação de autenticação
    if (!usuarioLogado) {
        alert("Você precisa entrar no sistema antes de realizar um agendamento!");
        abrirModalLogin();
        return;
    }

    const selectAmbiente = document.getElementById('select-ambiente');
    const inputMotivo = document.getElementById('motivo');
    const inputData = document.getElementById('data-reserva');
    const inputInicio = document.getElementById('hora-inicio');
    const inputFim = document.getElementById('hora-fim');

    const ambiente = selectAmbiente ? selectAmbiente.value : "Biblioteca";
    const motivo = inputMotivo ? inputMotivo.value.trim() : "";
    const dataReserva = inputData ? inputData.value : "";
    const horaInicio = inputInicio ? inputInicio.value : "";
    const horaFim = inputFim ? inputFim.value : "";

    // 2. Validação de preenchimento dos campos obrigatórios
    if (!dataReserva || !horaInicio || !horaFim) {
        mostrarAlertaReserva("erro", "⚠️ Por favor, preencha a data e os horários de início e término!");
        return;
    }

    // 3. Validação de data no passado
    const hoje = getHojeFormatado();
    if (dataReserva < hoje) {
        mostrarAlertaReserva("erro", "⚠️ Não é permitido agendar em datas passadas.");
        return;
    }

    // 4. Validação de término posterior ao início
    if (horaFim <= horaInicio) {
        mostrarAlertaReserva("erro", "⚠️ O horário de término deve ser posterior ao horário de início!");
        return;
    }

    // 5. Validação de expediente CT (08:00 às 18:00)
    if (horaInicio < CONFIG_CT.horaAbertura || horaFim > CONFIG_CT.horaFechamento) {
        mostrarAlertaReserva("erro", `🕒 Horário inválido: O CT funciona das ${CONFIG_CT.horaAbertura} às ${CONFIG_CT.horaFechamento}.`);
        return;
    }

    // 6. Se a data for hoje, valida se o horário não passou
    const agora = new Date();
    if (dataReserva === hoje) {
        const [hIni, mIni] = horaInicio.split(':').map(Number);
        const dataHoraIni = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), hIni, mIni);
        if (dataHoraIni <= agora) {
            mostrarAlertaReserva("erro", "⚠️ O horário de início selecionado já passou no dia de hoje!");
            return;
        }
    }

    // 7. Validação estrita de conflito com reservas existentes
    const conflito = verificarConflito(ambiente, dataReserva, horaInicio, horaFim);
    if (conflito) {
        mostrarAlertaReserva("erro", `⚠️ Conflito de Horário! Já existe uma reserva para o ambiente "${ambiente}" das ${conflito.horaInicio} às ${conflito.horaFim} agendada por ${conflito.usuario}. Escolha outro horário.`);
        alert(`Não foi possível agendar: Horário conflitante com agendamento de ${conflito.usuario} (${conflito.horaInicio} às ${conflito.horaFim}).`);
        return;
    }

    // Prepara os dados para salvar
    const inicioISO = `${dataReserva}T${horaInicio}:00`;
    const fimISO = `${dataReserva}T${horaFim}:00`;
    const dataFormatada = `${formatarDataBR(dataReserva)} das ${horaInicio} às ${horaFim}`;

    const novaReserva = {
        usuario: usuarioLogado.nome,
        ambiente: ambiente,
        motivo: motivo || "Agendamento de ambiente",
        data: dataFormatada,
        dataInicio: inicioISO,
        dataFim: fimISO,
        dataReserva: dataReserva,
        horaInicio: horaInicio,
        horaFim: horaFim,
        dataOrdenacao: new Date(inicioISO),
        criadoEm: new Date().toISOString()
    };

    const btnAgendar = document.getElementById('btn-agendar-reserva');
    if (btnAgendar) {
        btnAgendar.disabled = true;
        btnAgendar.innerText = "Salvando Agendamento...";
    }

    try {
        // Envia para o Firebase Firestore se conectado
        if (window.firestore && window.db) {
            try {
                await window.firestore.addDoc(window.firestore.collection(window.db, "reservas"), novaReserva);
            } catch (firebaseErr) {
                console.warn("Aviso ao salvar no Firestore (armazenando localmente):", firebaseErr);
            }
        }

        // Salva também no cache local (redundância e funcionamento garantido)
        reservas.push(novaReserva);
        todasAsReservas.push(novaReserva);
        localStorage.setItem('reservas_salvas', JSON.stringify(reservas));

        // Limpa formulário
        if (inputMotivo) inputMotivo.value = "";
        if (inputInicio) inputInicio.value = "";
        if (inputFim) inputFim.value = "";
        limparAlertaReserva();

        // Atualiza a tabela de reservas e a grade
        await atualizarTabela();
        carregarGradeHorarios();

        // Exibe modal de feedback de confirmação
        abrirModalConfirmacao(novaReserva);

    } catch (e) {
        console.error("Erro ao salvar reserva: ", e);
        mostrarAlertaReserva("erro", "Erro ao salvar reserva. Tente novamente.");
    } finally {
        if (btnAgendar) {
            btnAgendar.disabled = false;
            btnAgendar.innerText = "Agendar Ambiente";
        }
    }
}

// Formatação legível de data para exibição
function formataData(dataString) {
    const d = new Date(dataString);
    if (isNaN(d)) return dataString;
    return d.toLocaleString('pt-BR').replace(',', ' -');
}

// ==========================================
// ATUALIZAÇÃO DA TABELA DE RESERVAS (ABA LISTA)
// ==========================================

async function atualizarTabela() {
    const tbody = document.querySelector('#tabela-reservas tbody');
    if (!tbody) return;

    tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; padding:20px; color:#64748b;'>Carregando dados da nuvem...</td></tr>";

    let listaDocs = [];

    // Tenta buscar no Firebase Firestore
    if (window.firestore && window.db) {
        try {
            const q = window.firestore.query(
                window.firestore.collection(window.db, "reservas"),
                window.firestore.orderBy("dataOrdenacao", "asc")
            );
            const querySnapshot = await window.firestore.getDocs(q);
            querySnapshot.forEach((doc) => {
                listaDocs.push(doc.data());
            });
        } catch (e) {
            console.warn("Erro ao buscar no Firestore, utilizando cache local:", e);
        }
    }

    // Se a nuvem não retornou itens ou está sem conexão, usa o cache local
    if (listaDocs.length === 0) {
        listaDocs = [...reservas];
    } else {
        // Atualiza o cache local com os dados da nuvem
        todasAsReservas = [...listaDocs];
        localStorage.setItem('reservas_salvas', JSON.stringify(listaDocs));
    }

    tbody.innerHTML = "";

    if (listaDocs.length === 0) {
        tbody.innerHTML = "<tr><td colspan='3' style='text-align:center; padding:20px; color:#94a3b8;'>Nenhum agendamento realizado até o momento.</td></tr>";
        return;
    }

    listaDocs.forEach((res) => {
        const tr = document.createElement('tr');
        const subtituloMotivo = res.motivo ? `<br><small style="color: #64748b; font-weight: normal;">${res.motivo}</small>` : '';
        tr.innerHTML = `
            <td><strong>${res.usuario}</strong>${subtituloMotivo}</td>
            <td>${res.ambiente}</td>
            <td>${res.data}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// MODAL DE CONFIRMAÇÃO DE AGENDAMENTO
// ==========================================

function abrirModalConfirmacao(reserva) {
    const modal = document.getElementById('modalConfirmacaoReserva');
    const detalhes = document.getElementById('resumo-reserva-detalhes');

    if (!modal || !detalhes) {
        alert(`Agendamento de ${reserva.ambiente} realizado com sucesso!`);
        return;
    }

    detalhes.innerHTML = `
        <div class="resumo-item">
            <span>Ambiente:</span>
            <strong>${reserva.ambiente}</strong>
        </div>
        <div class="resumo-item">
            <span>Data e Horário:</span>
            <strong>${reserva.data}</strong>
        </div>
        <div class="resumo-item">
            <span>Responsável:</span>
            <strong>${reserva.usuario}</strong>
        </div>
        ${reserva.motivo ? `
        <div class="resumo-item">
            <span>Motivo:</span>
            <strong>${reserva.motivo}</strong>
        </div>` : ''}
    `;

    modal.style.display = 'flex';
}

function fecharModalConfirmacao() {
    const modal = document.getElementById('modalConfirmacaoReserva');
    if (modal) modal.style.display = 'none';
}

function irParaListaReservas() {
    fecharModalConfirmacao();
    showSection('lista');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================
// SISTEMA DE AUTENTICAÇÃO (LOGIN E CADASTRO)
// ==========================================

function abrirModalLogin() {
    if (usuarioLogado) {
        if (confirm("Deseja encerrar sua sessão atual?")) {
            usuarioLogado = null;
            localStorage.removeItem('usuarioLogado');
            atualizarInterfaceUsuario();
        }
        return;
    }
    
    alternarAbasLogin('login');
    const modalLogin = document.getElementById('modalLogin');
    if (modalLogin) modalLogin.style.display = 'flex';
}

function fecharModalLogin() {
    const modalLogin = document.getElementById('modalLogin');
    if (modalLogin) modalLogin.style.display = 'none';
}

function alternarAbasLogin(aba) {
    const telaLogin = document.getElementById('tela-login-direto');
    const telaCadastro = document.getElementById('tela-cadastro');
    const titulo = document.getElementById('loginModalTitulo');

    if (!telaLogin || !telaCadastro || !titulo) return;

    if (aba === 'cadastro') {
        telaLogin.style.display = 'none';
        telaCadastro.style.display = 'block';
        titulo.innerText = 'Cadastro de Usuário';
    } else {
        telaLogin.style.display = 'block';
        telaCadastro.style.display = 'none';
        titulo.innerText = 'Entrar no Sistema';
    }
}

function realizarCadastro() {
    const inputNome = document.getElementById('cad-nome');
    const inputWhats = document.getElementById('cad-whatsapp');
    const inputTipo = document.getElementById('cad-tipo');

    if (!inputNome || !inputWhats || !inputTipo) return;

    const nome = inputNome.value.trim();
    const whatsapp = inputWhats.value.trim();
    const tipo = inputTipo.value;

    if (!nome || !whatsapp) {
        alert("Por favor, preencha todos os campos do cadastro!");
        return;
    }

    const usuarioExistente = usuariosCadastrados.find(u => u.whatsapp === whatsapp);
    if (usuarioExistente) {
        alert("Este número de WhatsApp já está cadastrado! Use a tela de Login.");
        alternarAbasLogin('login');
        return;
    }

    const novoUsuario = { nome, whatsapp, tipo };
    usuariosCadastrados.push(novoUsuario);
    localStorage.setItem('usuarios', JSON.stringify(usuariosCadastrados));
    
    usuarioLogado = novoUsuario;
    localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));

    alert(`Cadastro realizado com sucesso! Bem-vindo, ${nome}.`);
    fecharModalLogin();
    atualizarInterfaceUsuario();
}

function realizarLogin() {
    const inputWhats = document.getElementById('login-whatsapp');
    if (!inputWhats) return;

    const whatsappInput = inputWhats.value.trim();

    if (!whatsappInput) {
        alert("Por favor, informe seu número de WhatsApp!");
        return;
    }

    const usuarioEncontrado = usuariosCadastrados.find(u => u.whatsapp === whatsappInput);

    if (usuarioEncontrado) {
        usuarioLogado = usuarioEncontrado;
        localStorage.setItem('usuarioLogado', JSON.stringify(usuarioLogado));
        fecharModalLogin();
        atualizarInterfaceUsuario();
    } else {
        alert("Número não encontrado! Por favor, realize seu cadastro primeiro.");
        alternarAbasLogin('cadastro');
    }
}

function atualizarInterfaceUsuario() {
    const textoTopo = document.getElementById('texto-usuario-topo');
    if (!textoTopo) return;
    
    if (usuarioLogado) {
        const primeiroNome = usuarioLogado.nome.split(' ')[0];
        if (window.innerWidth <= 768) {
            textoTopo.innerText = `(${usuarioLogado.tipo}) | Sair`;
        } else {
            textoTopo.innerText = `${primeiroNome} (${usuarioLogado.tipo}) | Sair`;
        }
    } else {
        textoTopo.innerText = "Entrar";
    }
}

// ==========================================
// GERENCIAMENTO DE MODAIS DE INFORMAÇÃO
// ==========================================

function abrirInformacao(nomeSala) {
    const modal = document.getElementById('modalInformacao');
    const sala = dadosSalas[nomeSala] || dadosSalas["Biblioteca"];

    const modalTitulo = document.getElementById('modalTitulo');
    if (modalTitulo) modalTitulo.innerText = nomeSala;
    
    const listaInfo = document.getElementById('listaInfo');
    const listaRecursos = document.getElementById('listaRecursos');
    
    if (listaInfo) {
        listaInfo.innerHTML = sala.info.map(item => `<li>${item}</li>`).join('');
    }
    if (listaRecursos) {
        listaRecursos.innerHTML = sala.recursos.map(item => `<li>${item}</li>`).join('');
    }

    if (modal) modal.style.display = 'flex';
}

function fecharModal() {
    const modal = document.getElementById('modalInformacao');
    if (modal) modal.style.display = 'none';
}

// Evento global para fechar modais ao clicar no fundo
window.onclick = function(event) {
    const modalInfo = document.getElementById('modalInformacao');
    const modalLogin = document.getElementById('modalLogin');
    const modalConfirmacao = document.getElementById('modalConfirmacaoReserva');
    
    if (event.target === modalInfo) {
        fecharModal();
    }
    if (event.target === modalLogin) {
        fecharModalLogin();
    }
    if (event.target === modalConfirmacao) {
        fecharModalConfirmacao();
    }
};