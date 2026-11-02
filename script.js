// ==========================================
// TECHAGENDA - SISTEMA DE AGENDAMENTO DE AMBIENTES
// ==========================================

// Armazenamento local e em memória
let reservas = JSON.parse(localStorage.getItem('reservas_salvas')) || [];
let todasAsReservas = [...reservas]; // Cache unificado de reservas (Nuvem + Local)
let usuarioLogado = null;
const perfisEmCarregamento = new Map();

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

let ambientesCadastrados = Object.entries(dadosSalas).map(([nome, sala]) => ({
    id: nome.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    nome,
    descricao: sala.info.join(', '),
    capacidade: Number.parseInt(sala.capacidade, 10),
    imagem: sala.foto,
    informacoes: sala.info,
    recursos: sala.recursos,
    abertura: '08:00',
    fechamento: '18:00',
    diasDisponiveis: [0, 1, 2, 3, 4, 5, 6],
    ativo: true,
    nomesAnteriores: []
}));

// ==========================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================

window.addEventListener('DOMContentLoaded', () => {
    window.techAgendaAdminSession = document.querySelector(
        'meta[name="techagenda-admin-session"]'
    )?.content === 'true';
    if (window.techAgendaAdminSession) {
        usuarioLogado = {
            uid: 'admin',
            nome: 'Administrador',
            tipo: 'Administrador',
            isAdmin: true
        };
    }
    atualizarInterfaceUsuario();
    configurarAtalhoAdministrativo();
    configurarFiltrosLista();
    renderizarAmbientes();
    atualizarOpcoesAmbiente();
    carregarAmbientesPublicos();
    if (window.techAgendaAdminSession) {
        const menuAdmin = document.getElementById('menu-admin');
        if (menuAdmin) menuAdmin.hidden = false;
        carregarPainelAdmin();
    }
    if (!window.techAgendaAdminSession) {
        if (!window.firebaseAuthApi || !window.firebaseAuth) {
            console.error("Firebase Authentication não foi inicializado.");
            mostrarErroAutenticacao("Não foi possível iniciar o Firebase Authentication. Verifique a conexão e a configuração.");
        } else {
            window.firebaseAuthApi.onAuthStateChanged(window.firebaseAuth, async (firebaseUser) => {
                if (!firebaseUser) {
                    usuarioLogado = null;
                    atualizarInterfaceUsuario();
                    return;
                }

                try {
                    usuarioLogado = await obterOuCriarPerfil(firebaseUser);
                    atualizarInterfaceUsuario();
                    fecharModalLogin();
                } catch (error) {
                    console.error("Erro ao carregar o perfil autenticado:", error);
                    usuarioLogado = null;
                    atualizarInterfaceUsuario();
                    mostrarErroAutenticacao("Não foi possível carregar seu perfil. Verifique a conexão e tente entrar novamente.");
                }
            });
        }
    }
    garantirDataInicialReserva();
    trocarFotoReserva();
    carregarGradeHorarios();
    atualizarTabela();
});

function configurarAtalhoAdministrativo() {
    const tituloAmbientes = Array.from(document.querySelectorAll('#home h1'))
        .find((titulo) => titulo.textContent.trim() === 'Ambientes disponíveis');
    if (!tituloAmbientes) return;

    let quantidadeCliques = 0;
    let inicioSequencia = 0;
    tituloAmbientes.addEventListener('click', () => {
        const agora = Date.now();
        if (agora - inicioSequencia > 2000) {
            quantidadeCliques = 1;
            inicioSequencia = agora;
            return;
        }

        quantidadeCliques += 1;
        if (quantidadeCliques === 3) {
            quantidadeCliques = 0;
            inicioSequencia = 0;
            window.location.assign('/admin');
        }
    });
}

async function apiJson(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: {
            ...(options.body || isMutation ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers
        }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Falha ao acessar o servidor (${response.status}).`);
    return body;
}

function normalizarAmbiente(data) {
    return {
        ...data,
        nome: data.nome || 'Ambiente',
        descricao: data.descricao || '',
        capacidade: Number(data.capacidade) || 0,
        imagem: data.imagem || 'imagens/biblioteca.jpeg',
        informacoes: Array.isArray(data.informacoes) ? data.informacoes : [],
        recursos: Array.isArray(data.recursos) ? data.recursos : [],
        abertura: data.abertura || '08:00',
        fechamento: data.fechamento || '18:00',
        diasDisponiveis: Array.isArray(data.diasDisponiveis) ? data.diasDisponiveis : [0, 1, 2, 3, 4, 5, 6],
        ativo: data.ativo !== false,
        nomesAnteriores: Array.isArray(data.nomesAnteriores) ? data.nomesAnteriores : []
    };
}

async function carregarAmbientesPublicos() {
    if (window.techAgendaAdminSession) return;
    try {
        const ambientes = await apiJson('/api/ambientes');
        ambientesCadastrados = ambientes.map(normalizarAmbiente);
        renderizarAmbientes();
        atualizarOpcoesAmbiente();
        carregarGradeHorarios();
    } catch (error) {
        console.warn("Catálogo compartilhado indisponível; mantendo ambientes existentes nesta sessão:", error);
    }
}

function atualizarOpcoesAmbiente() {
    const selectAmbiente = document.getElementById('select-ambiente');
    const filtroAmbiente = document.getElementById('filtro-reserva-ambiente');
    const nomeAtual = selectAmbiente?.value;
    const ativos = ambientesCadastrados.filter((ambiente) => ambiente.ativo);
    if (selectAmbiente) {
        selectAmbiente.replaceChildren();
        ativos.forEach((ambiente) => {
            const option = document.createElement('option');
            option.value = ambiente.nome;
            option.textContent = ambiente.nome;
            selectAmbiente.appendChild(option);
        });
        if (ativos.some((ambiente) => ambiente.nome === nomeAtual)) {
            selectAmbiente.value = nomeAtual;
        }
        selectAmbiente.disabled = ativos.length === 0;
        const botaoReserva = document.getElementById('btn-agendar-reserva');
        if (botaoReserva) botaoReserva.disabled = ativos.length === 0;
    }
    if (filtroAmbiente) {
        const filtroAtual = filtroAmbiente.value;
        filtroAmbiente.replaceChildren(new Option('Todos', ''));
        ambientesCadastrados.forEach((ambiente) => {
            filtroAmbiente.add(new Option(ambiente.nome, ambiente.id));
        });
        filtroAmbiente.value = filtroAtual;
    }
}

function renderizarAmbientes() {
    const grid = document.getElementById('grid-ambientes');
    if (!grid) return;
    grid.replaceChildren();
    const ativos = ambientesCadastrados.filter((ambiente) => ambiente.ativo);
    if (!ativos.length) {
        const vazio = document.createElement('p');
        vazio.className = 'catalogo-vazio';
        vazio.textContent = 'Nenhum ambiente está disponível para agendamento no momento.';
        grid.appendChild(vazio);
        return;
    }
    ativos.forEach((ambiente) => {
        const card = document.createElement('article');
        card.className = 'card';
        const image = document.createElement('img');
        image.src = ambiente.imagem;
        image.alt = ambiente.nome;
        image.loading = 'lazy';
        const body = document.createElement('div');
        body.className = 'card-body';
        const title = document.createElement('h3');
        title.textContent = ambiente.nome;
        const description = document.createElement('p');
        description.className = 'environment-description';
        description.textContent = ambiente.descricao;
        const buttons = document.createElement('div');
        buttons.className = 'buttons';
        const infoButton = document.createElement('button');
        infoButton.className = 'btn-info';
        infoButton.type = 'button';
        infoButton.textContent = 'Informações';
        infoButton.addEventListener('click', () => abrirInformacao(ambiente.id));
        const bookingButton = document.createElement('button');
        bookingButton.className = 'btn-primary';
        bookingButton.type = 'button';
        bookingButton.textContent = 'Agendar';
        bookingButton.addEventListener('click', () => abrirReserva(ambiente.nome));
        buttons.append(infoButton, bookingButton);
        body.append(title, description, buttons);
        card.append(image, body);
        grid.appendChild(card);
    });
}

function mostrarStatusAdmin(mensagem, tipo = 'erro') {
    const status = document.getElementById('admin-status');
    if (!status) return;
    status.textContent = mensagem;
    status.className = `admin-status ${tipo}`;
    status.hidden = !mensagem;
}

async function carregarPainelAdmin() {
    if (!window.techAgendaAdminSession) return;
    try {
        const dashboard = await apiJson('/api/admin/dashboard');
        ambientesCadastrados = dashboard.ambientes.map(normalizarAmbiente);
        todasAsReservas = dashboard.reservas;
        document.getElementById('admin-total-ambientes').textContent = dashboard.resumo.ambientes;
        document.getElementById('admin-total-reservas').textContent = dashboard.resumo.reservas;
        document.getElementById('admin-reservas-ativas').textContent = dashboard.resumo.ativas;
        atualizarOpcoesAmbiente();
        renderizarAmbientes();
        renderizarTabelaAdminAmbientes();
        renderizarTabelaAdminReservas();
        carregarGradeHorarios();
        mostrarStatusAdmin('', 'sucesso');
    } catch (error) {
        mostrarStatusAdmin(error.message);
    }
}

function renderizarTabelaAdminAmbientes() {
    const tbody = document.getElementById('admin-tbody-ambientes');
    if (!tbody) return;
    tbody.replaceChildren();
    if (!ambientesCadastrados.length) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 5;
        cell.textContent = 'Nenhum ambiente cadastrado.';
        return;
    }
    ambientesCadastrados.forEach((ambiente) => {
        const row = tbody.insertRow();
        [ambiente.nome, `${ambiente.capacidade} pessoas`,
            `${ambiente.abertura}–${ambiente.fechamento} • ${formatarDias(ambiente.diasDisponiveis)}`,
            ambiente.ativo ? 'Ativo' : 'Desativado'].forEach((value) => {
            row.insertCell().textContent = value;
        });
        const actions = row.insertCell();
        const edit = document.createElement('button');
        edit.className = 'admin-action-button';
        edit.type = 'button';
        edit.textContent = 'Editar';
        edit.addEventListener('click', () => editarAmbienteAdmin(ambiente.id));
        const remove = document.createElement('button');
        remove.className = 'admin-action-button danger';
        remove.type = 'button';
        remove.textContent = 'Excluir';
        remove.addEventListener('click', () => excluirAmbienteAdmin(ambiente.id, ambiente.nome));
        actions.append(edit, remove);
    });
}

function formatarDias(days) {
    const nomes = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return days.map((day) => nomes[day]).join(', ') || 'Sem dias';
}

function editarAmbienteAdmin(id) {
    const ambiente = ambientesCadastrados.find((item) => item.id === id);
    if (!ambiente) return;
    document.getElementById('admin-ambiente-id').value = ambiente.id;
    document.getElementById('admin-ambiente-nome').value = ambiente.nome;
    document.getElementById('admin-ambiente-descricao').value = ambiente.descricao;
    document.getElementById('admin-ambiente-capacidade').value = ambiente.capacidade;
    document.getElementById('admin-ambiente-imagem').value = ambiente.imagem;
    document.getElementById('admin-ambiente-informacoes').value = ambiente.informacoes.join('\n');
    document.getElementById('admin-ambiente-recursos').value = ambiente.recursos.join('\n');
    document.getElementById('admin-ambiente-abertura').value = ambiente.abertura;
    document.getElementById('admin-ambiente-fechamento').value = ambiente.fechamento;
    document.getElementById('admin-ambiente-ativo').checked = ambiente.ativo;
    document.querySelectorAll('input[name="admin-dia"]').forEach((checkbox) => {
        checkbox.checked = ambiente.diasDisponiveis.includes(Number(checkbox.value));
    });
    document.getElementById('form-admin-ambiente').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function limparFormularioAmbiente() {
    const form = document.getElementById('form-admin-ambiente');
    if (!form) return;
    form.reset();
    document.getElementById('admin-ambiente-id').value = '';
    document.getElementById('admin-ambiente-abertura').value = '08:00';
    document.getElementById('admin-ambiente-fechamento').value = '18:00';
    document.querySelectorAll('input[name="admin-dia"]').forEach((checkbox) => {
        checkbox.checked = true;
    });
    document.getElementById('admin-ambiente-ativo').checked = true;
}

async function salvarAmbienteAdmin(event) {
    event.preventDefault();
    const id = document.getElementById('admin-ambiente-id').value;
    const data = {
        nome: document.getElementById('admin-ambiente-nome').value,
        descricao: document.getElementById('admin-ambiente-descricao').value,
        capacidade: Number(document.getElementById('admin-ambiente-capacidade').value),
        imagem: document.getElementById('admin-ambiente-imagem').value,
        informacoes: document.getElementById('admin-ambiente-informacoes').value.split('\n').map((item) => item.trim()).filter(Boolean),
        recursos: document.getElementById('admin-ambiente-recursos').value.split('\n').map((item) => item.trim()).filter(Boolean),
        abertura: document.getElementById('admin-ambiente-abertura').value,
        fechamento: document.getElementById('admin-ambiente-fechamento').value,
        diasDisponiveis: [...document.querySelectorAll('input[name="admin-dia"]:checked')].map((checkbox) => Number(checkbox.value)),
        ativo: document.getElementById('admin-ambiente-ativo').checked
    };
    try {
        await apiJson(id ? `/api/admin/ambientes/${encodeURIComponent(id)}` : '/api/admin/ambientes', {
            method: id ? 'PUT' : 'POST',
            body: JSON.stringify(data)
        });
        limparFormularioAmbiente();
        await carregarPainelAdmin();
        mostrarStatusAdmin('Ambiente salvo com sucesso.', 'sucesso');
    } catch (error) {
        mostrarStatusAdmin(error.message);
    }
}

async function excluirAmbienteAdmin(id, nome) {
    if (!confirm(`Excluir o ambiente "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
        await apiJson(`/api/admin/ambientes/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await carregarPainelAdmin();
        mostrarStatusAdmin('Ambiente excluído com sucesso.', 'sucesso');
    } catch (error) {
        mostrarStatusAdmin(error.message);
    }
}

function statusReservaAdmin(reserva) {
    if (['ativa', 'concluida', 'cancelada'].includes(reserva.situacao)) return reserva.situacao;
    if (reserva.status === 'cancelada' || reserva.status === 'cancelled') return 'cancelada';
    const intervalo = extrairIntervaloReserva(reserva);
    if (!intervalo) return 'ativa';
    return intervalo.fim <= new Date() ? 'concluida' : 'ativa';
}

function renderizarTabelaAdminReservas() {
    const tbody = document.getElementById('admin-tbody-reservas');
    if (!tbody) return;
    const ambienteId = document.getElementById('filtro-reserva-ambiente').value;
    const date = document.getElementById('filtro-reserva-data').value;
    const user = document.getElementById('filtro-reserva-usuario').value.trim().toLocaleLowerCase('pt-BR');
    const status = document.getElementById('filtro-reserva-status').value;
    const ambientesFiltro = ambientesCadastrados.find((item) => item.id === ambienteId);
    const filtered = todasAsReservas.filter((reserva) => {
        const interval = extrairIntervaloReserva(reserva);
        if (ambienteId && reserva.ambienteId !== ambienteId &&
            reserva.ambiente !== ambientesFiltro?.nome &&
            !ambientesFiltro?.nomesAnteriores.includes(reserva.ambiente)) return false;
        if (date && (reserva.dataReserva || interval?.dataStr) !== date) return false;
        if (user && !`${reserva.usuario || ''} ${reserva.usuarioEmail || ''}`.toLocaleLowerCase('pt-BR').includes(user)) return false;
        return !status || statusReservaAdmin(reserva) === status;
    });

    tbody.replaceChildren();
    if (!filtered.length) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 6;
        cell.textContent = 'Nenhuma reserva corresponde aos filtros.';
        return;
    }
    filtered.sort((left, right) => {
        const a = extrairIntervaloReserva(left)?.inicio?.getTime() || 0;
        const b = extrairIntervaloReserva(right)?.inicio?.getTime() || 0;
        return b - a;
    }).forEach((reserva) => {
        const row = tbody.insertRow();
        const interval = extrairIntervaloReserva(reserva);
        [
            `${reserva.usuario || 'Usuário'}${reserva.usuarioEmail ? `\n${reserva.usuarioEmail}` : ''}`,
            reserva.ambiente || '',
            reserva.data || '',
            reserva.motivo || '',
            statusReservaAdmin(reserva)
        ].forEach((value, index) => {
            const cell = row.insertCell();
            cell.textContent = value;
            if (index === 0 && reserva.usuarioEmail) cell.className = 'admin-user-cell';
        });
        const actions = row.insertCell();
        if (reserva.id && statusReservaAdmin(reserva) === 'ativa') {
            const cancel = document.createElement('button');
            cancel.className = 'admin-action-button';
            cancel.type = 'button';
            cancel.textContent = 'Cancelar';
            cancel.addEventListener('click', () => cancelarReservaAdmin(reserva.id));
            actions.appendChild(cancel);
        }
        if (reserva.id) {
            const remove = document.createElement('button');
            remove.className = 'admin-action-button danger';
            remove.type = 'button';
            remove.textContent = 'Excluir';
            remove.addEventListener('click', () => excluirReservaAdmin(reserva.id));
            actions.appendChild(remove);
        }
    });
}

async function cancelarReservaAdmin(id) {
    if (!confirm('Cancelar esta reserva? O horário ficará disponível novamente.')) return;
    try {
        await apiJson(`/api/admin/reservas/${encodeURIComponent(id)}/cancelar`, { method: 'PATCH' });
        await carregarPainelAdmin();
        await atualizarTabela();
        mostrarStatusAdmin('Reserva cancelada. O horário está disponível novamente.', 'sucesso');
    } catch (error) {
        mostrarStatusAdmin(error.message);
    }
}

async function excluirReservaAdmin(id) {
    if (!confirm('Excluir permanentemente este registro de reserva?')) return;
    try {
        await apiJson(`/api/admin/reservas/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await carregarPainelAdmin();
        await atualizarTabela();
        mostrarStatusAdmin('Registro de reserva excluído.', 'sucesso');
    } catch (error) {
        mostrarStatusAdmin(error.message);
    }
}

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
    if (sectionId === 'lista') {
        atualizarTabela();
    }
    if (sectionId === 'administracao' && window.techAgendaAdminSession) {
        carregarPainelAdmin();
    }

    // 5. Se estiver no celular, fecha o menu lateral após clicar
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('active');
    }
}

// Atalho do botão "Agendar" do card da aba Ambientes
function abrirReserva(nomeAmbiente) {
    const ambiente = ambientesCadastrados.find((item) => item.nome === nomeAmbiente);
    if (!ambiente || !ambiente.ativo) {
        alert("Este ambiente está temporariamente indisponível.");
        return;
    }
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
    
    const ambiente = ambientesCadastrados.find((item) => item.nome === selectAmbiente.value);
    const sala = ambiente || dadosSalas[selectAmbiente.value] || dadosSalas["Biblioteca"];
    const foto = ambiente ? ambiente.imagem : sala.foto;
    imagem.src = foto || "imagens/biblioteca.jpeg";
    
    if (badgeInfo) {
        const capacidade = ambiente ? `${ambiente.capacidade} pessoas` : sala.capacidade;
        badgeInfo.innerText = `${selectAmbiente.value} • Capacidade: ${capacidade || 'Espaço climatizado'}`;
    }
    if (ambiente) {
        const labelInicio = document.querySelector('label[for="hora-inicio"]');
        const labelFim = document.querySelector('label[for="hora-fim"]');
        if (labelInicio) labelInicio.textContent = `Início (${ambiente.abertura} - ${ambiente.fechamento})`;
        if (labelFim) labelFim.textContent = `Término (${ambiente.abertura} - ${ambiente.fechamento})`;
        const expediente = document.querySelector('.horario-expediente-chip span');
        if (expediente) expediente.textContent = `🕒 Expediente: ${ambiente.abertura} às ${ambiente.fechamento}`;
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
    const ambienteConfig = ambientesCadastrados.find((item) => item.nome === ambiente);
    const horaAbertura = ambienteConfig?.abertura || CONFIG_CT.horaAbertura;
    const horaFechamento = ambienteConfig?.fechamento || CONFIG_CT.horaFechamento;

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
    if (horaInicio < horaAbertura || horaFim > horaFechamento) {
        mostrarAlertaReserva("aviso", `🕒 Este ambiente funciona das ${horaAbertura} às ${horaFechamento}. Escolha dentro do expediente.`);
        atualizarDestaqueSlots(horaInicio, horaFim);
        return;
    }
    if (ambienteConfig && !ambienteConfig.diasDisponiveis.includes(new Date(`${dataReserva}T00:00:00`).getDay())) {
        mostrarAlertaReserva("aviso", "Este ambiente não funciona na data selecionada.");
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
    alerta.textContent = mensagem;
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
        if (item.status === 'cancelada') continue;
        const configuracaoAmbiente = ambientesCadastrados.find((room) => room.nome === ambiente);
        const nomesAssociados = configuracaoAmbiente
            ? [configuracaoAmbiente.nome, ...configuracaoAmbiente.nomesAnteriores]
            : [ambiente];
        if (item.ambienteId !== configuracaoAmbiente?.id && !nomesAssociados.includes(item.ambiente)) continue;

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

    const ambienteConfig = ambientesCadastrados.find((item) => item.nome === ambiente);
    if (!ambienteConfig || !ambienteConfig.ativo) {
        container.innerHTML = '<p class="catalogo-vazio">Este ambiente não está disponível.</p>';
        return;
    }
    const diaSemana = new Date(`${dataReserva}T00:00:00`).getDay();
    if (!ambienteConfig.diasDisponiveis.includes(diaSemana)) {
        container.innerHTML = '<p class="catalogo-vazio">Este ambiente não funciona na data selecionada.</p>';
        return;
    }
    const minutoInicial = horaEmMinutos(ambienteConfig.abertura);
    const minutoFinal = horaEmMinutos(ambienteConfig.fechamento);
    const grupos = [
        { nome: '🌅 Turno da Manhã', slots: [] },
        { nome: '🍽️ Intervalo / Transição', slots: [] },
        { nome: '🌇 Turno da Tarde', slots: [] }
    ];
    for (let inicio = minutoInicial; inicio + 60 <= minutoFinal; inicio += 60) {
        const slot = { inicio: minutosEmHora(inicio), fim: minutosEmHora(inicio + 60) };
        const grupo = inicio < 12 * 60 ? grupos[0] : (inicio < 13 * 60 ? grupos[1] : grupos[2]);
        grupo.slots.push(slot);
    }
    const turnos = grupos.filter((grupo) => grupo.slots.length).map((grupo) => ({
        ...grupo,
        horario: `${grupo.slots[0].inicio} às ${grupo.slots[grupo.slots.length - 1].fim}`
    }));

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
                    detalheTexto = `Por: ${escaparHTML(conflito.usuario)}`;
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
    const firebaseUser = window.firebaseAuth && window.firebaseAuth.currentUser;
    if (!firebaseUser || !usuarioLogado || usuarioLogado.uid !== firebaseUser.uid) {
        if (window.techAgendaAdminSession) {
            alert("A sessão administrativa permite navegar pelo site. Para confirmar uma reserva, entre com uma conta Google.");
            return;
        }
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
    const ambienteConfig = ambientesCadastrados.find((item) => item.nome === ambiente);

    // 2. Validação de preenchimento dos campos obrigatórios
    if (!ambienteConfig || !ambienteConfig.ativo || !dataReserva || !horaInicio || !horaFim) {
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
    if (horaInicio < ambienteConfig.abertura || horaFim > ambienteConfig.fechamento) {
        mostrarAlertaReserva("erro", `🕒 Horário inválido: este ambiente funciona das ${ambienteConfig.abertura} às ${ambienteConfig.fechamento}.`);
        return;
    }

    if (!ambienteConfig.diasDisponiveis.includes(new Date(`${dataReserva}T00:00:00`).getDay())) {
        mostrarAlertaReserva("erro", "Este ambiente não funciona na data selecionada.");
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
        usuarioUid: firebaseUser.uid,
        ambienteId: ambienteConfig.id,
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
        const token = await firebaseUser.getIdToken();
        const savedReservation = await apiJson('/api/reservas', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                ambienteId: ambienteConfig.id,
                dataReserva,
                horaInicio,
                horaFim,
                motivo
            })
        });
        novaReserva.id = savedReservation.id;

        // Atualiza o cache apenas após a confirmação da gravação na nuvem.
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
        mostrarAlertaReserva("erro", e.message || "Não foi possível salvar a reserva. Ela não foi confirmada; tente novamente.");
    } finally {
        if (btnAgendar) {
            btnAgendar.disabled = false;
            btnAgendar.innerText = "Agendar Ambiente";
        }
    }
}

function horaEmMinutos(hora) {
    const [horas, minutos] = hora.split(':').map(Number);
    return horas * 60 + minutos;
}

function minutosEmHora(total) {
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function escaparHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
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

    tbody.innerHTML = "<tr><td class='reservation-list-empty' colspan='4'>Carregando reservas...</td></tr>";

    let listaDocs = [];
    let consultouFirestore = false;

    // Tenta buscar no Firebase Firestore
    if (window.firestore && window.db) {
        try {
            const q = window.firestore.query(
                window.firestore.collection(window.db, "reservas"),
                window.firestore.orderBy("dataOrdenacao", "asc")
            );
            const querySnapshot = await window.firestore.getDocs(q);
            consultouFirestore = true;
            querySnapshot.forEach((doc) => {
                listaDocs.push({ id: doc.id, ...doc.data() });
            });
        } catch (e) {
            console.warn("Erro ao buscar no Firestore, utilizando cache local:", e);
        }
    }

    // Se a nuvem não retornou itens ou está sem conexão, usa o cache local
    if (!consultouFirestore) {
        listaDocs = [...reservas];
    } else {
        todasAsReservas = listaDocs;
        reservas = [...listaDocs];
        localStorage.setItem('reservas_salvas', JSON.stringify(listaDocs));
    }

    atualizarResumoLista(listaDocs);
    atualizarFiltroAmbientesLista(listaDocs);
    renderizarListaReservas(listaDocs);
}

function configurarFiltrosLista() {
    const search = document.getElementById('lista-pesquisa');
    const environment = document.getElementById('lista-filtro-ambiente');
    const date = document.getElementById('lista-filtro-data');
    const status = document.getElementById('lista-filtro-situacao');
    [search, environment, date, status].forEach((control) => {
        if (!control) return;
        control.addEventListener('input', () => renderizarListaReservas());
        control.addEventListener('change', () => renderizarListaReservas());
    });
}

function situacaoReservaLista(reserva, agora = new Date()) {
    const status = String(reserva.status || reserva.situacao || '').toLocaleLowerCase('pt-BR');
    if (reserva.canceladoEm || ['cancelada', 'cancelado', 'cancelled', 'canceled'].includes(status)) {
        return 'cancelada';
    }
    if (['concluida', 'concluído', 'concluido', 'completed', 'finalizada', 'finalizado'].includes(status)) {
        return 'concluida';
    }
    const intervalo = extrairIntervaloReserva(reserva);
    return intervalo && intervalo.fim <= agora ? 'concluida' : 'ativa';
}

function atualizarResumoLista(lista) {
    const counts = { ativa: 0, concluida: 0, cancelada: 0 };
    const agora = new Date();
    lista.forEach((reserva) => {
        counts[situacaoReservaLista(reserva, agora)] += 1;
    });
    const values = {
        'lista-total-reservas': lista.length,
        'lista-reservas-ativas': counts.ativa,
        'lista-reservas-concluidas': counts.concluida,
        'lista-reservas-canceladas': counts.cancelada
    };
    Object.entries(values).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });
}

function atualizarFiltroAmbientesLista(lista) {
    const select = document.getElementById('lista-filtro-ambiente');
    if (!select) return;
    const currentValue = select.value;
    const names = [...new Set(lista.map((reserva) => reserva.ambiente).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, 'pt-BR'));
    select.replaceChildren(new Option('Todos os ambientes', ''));
    names.forEach((name) => select.add(new Option(name, name)));
    if (names.includes(currentValue)) select.value = currentValue;
}

function renderizarListaReservas(lista = todasAsReservas) {
    const tbody = document.querySelector('#tabela-reservas tbody');
    if (!tbody) return;
    const search = document.getElementById('lista-pesquisa')?.value.trim().toLocaleLowerCase('pt-BR') || '';
    const environment = document.getElementById('lista-filtro-ambiente')?.value || '';
    const date = document.getElementById('lista-filtro-data')?.value || '';
    const status = document.getElementById('lista-filtro-situacao')?.value || '';
    const now = new Date();
    const filtered = lista.filter((reserva) => {
        const matchesSearch = `${reserva.usuario || ''} ${reserva.ambiente || ''}`
            .toLocaleLowerCase('pt-BR').includes(search);
        if (!matchesSearch || (environment && reserva.ambiente !== environment)) return false;
        const interval = extrairIntervaloReserva(reserva);
        if (date && interval?.dataStr !== date) return false;
        return !status || situacaoReservaLista(reserva, now) === status;
    }).sort((left, right) => {
        const startA = extrairIntervaloReserva(left)?.inicio?.getTime() || 0;
        const startB = extrairIntervaloReserva(right)?.inicio?.getTime() || 0;
        return startA - startB;
    });

    tbody.replaceChildren();
    if (!filtered.length) {
        const row = tbody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 4;
        cell.className = 'reservation-list-empty';
        cell.textContent = lista.length
            ? 'Nenhuma reserva corresponde aos filtros selecionados.'
            : 'Nenhuma reserva cadastrada até o momento.';
    } else {
        filtered.forEach((reserva) => tbody.appendChild(criarLinhaReservaLista(reserva, now)));
    }
    const resultCount = document.getElementById('lista-resultado-count');
    if (resultCount) {
        resultCount.textContent = `Exibindo ${filtered.length} de ${lista.length} ${lista.length === 1 ? 'reserva' : 'reservas'}`;
    }
}

function criarLinhaReservaLista(reserva, agora) {
    const row = document.createElement('tr');
    const interval = extrairIntervaloReserva(reserva);
    const status = situacaoReservaLista(reserva, agora);
    const user = document.createElement('td');
    user.dataset.label = 'Responsável';
    const userName = document.createElement('strong');
    userName.className = 'reservation-list-user';
    userName.textContent = reserva.usuario || 'Usuário';
    user.appendChild(userName);
    if (reserva.motivo) {
        const reason = document.createElement('small');
        reason.className = 'reservation-list-reason';
        reason.textContent = reserva.motivo;
        user.appendChild(reason);
    }

    const environment = document.createElement('td');
    environment.dataset.label = 'Ambiente';
    const environmentName = document.createElement('span');
    environmentName.className = 'reservation-list-environment';
    environmentName.textContent = reserva.ambiente || 'Ambiente não informado';
    environment.appendChild(environmentName);

    const schedule = document.createElement('td');
    schedule.dataset.label = 'Data e horário';
    if (interval) {
        const dateText = document.createElement('strong');
        dateText.className = 'reservation-list-date';
        dateText.textContent = interval.inicio.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
        const timeText = document.createElement('span');
        timeText.className = 'reservation-list-time';
        timeText.textContent = `${interval.horaInicio} – ${interval.horaFim}`;
        schedule.append(dateText, timeText);
    } else {
        const dateText = document.createElement('span');
        dateText.className = 'reservation-list-date';
        dateText.textContent = reserva.data || 'Data não informada';
        schedule.appendChild(dateText);
    }

    const situation = document.createElement('td');
    situation.dataset.label = 'Situação';
    const badge = document.createElement('span');
    badge.className = `reservation-status-badge ${status}`;
    const dot = document.createElement('span');
    dot.className = 'reservation-status-dot';
    dot.setAttribute('aria-hidden', 'true');
    badge.append(dot, document.createTextNode({
        ativa: 'Agendada',
        concluida: 'Concluída',
        cancelada: 'Cancelada'
    }[status]));
    situation.appendChild(badge);
    row.append(user, environment, schedule, situation);
    return row;
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

    detalhes.replaceChildren();
    const itens = [
        ["Ambiente:", reserva.ambiente],
        ["Data e Horário:", reserva.data],
        ["Responsável:", reserva.usuario]
    ];
    if (reserva.motivo) itens.push(["Motivo:", reserva.motivo]);
    itens.forEach(([rotulo, valor]) => {
        const item = document.createElement('div');
        item.className = 'resumo-item';
        const textoRotulo = document.createElement('span');
        textoRotulo.textContent = rotulo;
        const textoValor = document.createElement('strong');
        textoValor.textContent = valor || "";
        item.append(textoRotulo, textoValor);
        detalhes.appendChild(item);
    });

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
// AUTENTICAÇÃO GOOGLE E PERFIL DO USUÁRIO
// ==========================================

function abrirModalLogin() {
    if (usuarioLogado) {
        if (confirm("Deseja encerrar sua sessão atual?")) {
            sairDaConta();
        }
        return;
    }

    limparErroAutenticacao();
    const modalLogin = document.getElementById('modalLogin');
    if (modalLogin) modalLogin.style.display = 'flex';
}

function fecharModalLogin() {
    const modalLogin = document.getElementById('modalLogin');
    if (modalLogin) modalLogin.style.display = 'none';
}

function mostrarErroAutenticacao(mensagem) {
    const erro = document.getElementById('auth-erro');
    if (!erro) return;
    erro.textContent = mensagem;
    erro.hidden = false;
}

function limparErroAutenticacao() {
    const erro = document.getElementById('auth-erro');
    if (!erro) return;
    erro.textContent = "";
    erro.hidden = true;
}

function obterOuCriarPerfil(firebaseUser) {
    if (perfisEmCarregamento.has(firebaseUser.uid)) {
        return perfisEmCarregamento.get(firebaseUser.uid);
    }

    const promessaPerfil = (async () => {
        const referencia = window.firestore.doc(window.db, "usuarios", firebaseUser.uid);
        const documento = await window.firestore.getDoc(referencia);
        const dadosExistentes = documento.exists() ? documento.data() : {};
        const tiposValidos = ["Aluno", "Professor"];
        const tipoSelecionado = document.getElementById('cad-tipo')?.value;
        const perfil = {
            uid: firebaseUser.uid,
            nome: firebaseUser.displayName || dadosExistentes.nome || "Usuário",
            email: firebaseUser.email || dadosExistentes.email || "",
            fotoURL: firebaseUser.photoURL || dadosExistentes.fotoURL || "",
            tipo: tiposValidos.includes(dadosExistentes.tipo)
                ? dadosExistentes.tipo
                : (tiposValidos.includes(tipoSelecionado) ? tipoSelecionado : "Aluno")
        };
        const dadosParaSalvar = {
            ...perfil,
            atualizadoEm: window.firestore.serverTimestamp()
        };
        if (!documento.exists()) {
            dadosParaSalvar.criadoEm = window.firestore.serverTimestamp();
        }
        await window.firestore.setDoc(referencia, dadosParaSalvar, { merge: true });
        return perfil;
    })().finally(() => perfisEmCarregamento.delete(firebaseUser.uid));

    perfisEmCarregamento.set(firebaseUser.uid, promessaPerfil);
    return promessaPerfil;
}

async function realizarLoginGoogle() {
    const botao = document.getElementById('btn-login-google');
    const textoBotao = botao && botao.querySelector('span');
    const textoOriginal = textoBotao ? textoBotao.textContent : "Continuar com Google";
    limparErroAutenticacao();
    if (botao) botao.disabled = true;
    if (textoBotao) textoBotao.textContent = "Conectando ao Google...";

    try {
        const api = window.firebaseAuthApi;
        if (!api || !window.firebaseAuth || !window.db || !window.firestore) {
            throw new Error("Firebase Authentication ou Firestore não foi inicializado.");
        }
        await api.setPersistence(window.firebaseAuth, api.browserLocalPersistence);
        const provedor = new api.GoogleAuthProvider();
        const credencial = await api.signInWithPopup(window.firebaseAuth, provedor);
        usuarioLogado = await obterOuCriarPerfil(credencial.user);
        atualizarInterfaceUsuario();
        fecharModalLogin();
    } catch (error) {
        console.error("Erro ao autenticar com Google:", error);
        const mensagens = {
            "auth/popup-closed-by-user": "A janela do Google foi fechada antes de concluir o login.",
            "auth/popup-blocked": "O navegador bloqueou a janela do Google. Permita pop-ups e tente novamente.",
            "auth/unauthorized-domain": "Este domínio não está autorizado no Firebase Authentication.",
            "auth/operation-not-allowed": "O provedor Google ainda não foi habilitado no Firebase Console.",
            "permission-denied": "O Firebase recusou o acesso ao perfil. Verifique as regras do Firestore."
        };
        mostrarErroAutenticacao(mensagens[error.code] || "Não foi possível entrar com Google. Verifique sua conexão e a configuração do Firebase.");
    } finally {
        if (botao) botao.disabled = false;
        if (textoBotao) textoBotao.textContent = textoOriginal;
    }
}

async function sairDaConta() {
    if (window.techAgendaAdminSession) {
        const formularioLogout = document.createElement('form');
        formularioLogout.method = 'post';
        formularioLogout.action = '/admin/logout';
        document.body.appendChild(formularioLogout);
        formularioLogout.submit();
        return;
    }

    try {
        await window.firebaseAuthApi.signOut(window.firebaseAuth);
    } catch (error) {
        console.error("Erro ao sair da conta Google:", error);
        alert("Não foi possível encerrar a sessão. Tente novamente.");
    }
}

function atualizarInterfaceUsuario() {
    const textoTopo = document.getElementById('texto-usuario-topo');
    const iconeLogin = document.getElementById('icone-login-topo');
    const avatar = document.getElementById('avatar-usuario-topo');
    if (!textoTopo) return;
    
    if (usuarioLogado) {
        const primeiroNome = usuarioLogado.nome.split(' ')[0];
        if (window.innerWidth <= 768) {
            textoTopo.innerText = `${primeiroNome} | Sair`;
        } else {
            textoTopo.innerText = `${primeiroNome} (${usuarioLogado.tipo}) | Sair`;
        }
        if (iconeLogin) iconeLogin.hidden = true;
        if (avatar) {
            avatar.hidden = !usuarioLogado.fotoURL;
            avatar.src = usuarioLogado.fotoURL || "";
            avatar.title = usuarioLogado.nome;
        }
        const botaoStatus = document.getElementById('btn-status-usuario');
        if (botaoStatus) botaoStatus.title = `Sair da conta de ${usuarioLogado.nome}`;
    } else {
        textoTopo.innerText = "Entrar";
        if (iconeLogin) iconeLogin.hidden = false;
        if (avatar) {
            avatar.hidden = true;
            avatar.removeAttribute('src');
        }
        const botaoStatus = document.getElementById('btn-status-usuario');
        if (botaoStatus) botaoStatus.title = "Continuar com Google";
    }
}

// ==========================================
// GERENCIAMENTO DE MODAIS DE INFORMAÇÃO
// ==========================================

function abrirInformacao(nomeSala) {
    const modal = document.getElementById('modalInformacao');
    const ambiente = ambientesCadastrados.find((item) => item.id === nomeSala || item.nome === nomeSala);

    const modalTitulo = document.getElementById('modalTitulo');
    if (modalTitulo) modalTitulo.innerText = ambiente?.nome || nomeSala;
    
    const listaInfo = document.getElementById('listaInfo');
    const listaRecursos = document.getElementById('listaRecursos');
    
    if (listaInfo) {
        listaInfo.replaceChildren();
        (ambiente?.informacoes || dadosSalasFallback(nomeSala).info).forEach((item) => {
            const listItem = document.createElement('li');
            listItem.textContent = item;
            listaInfo.appendChild(listItem);
        });
    }
    if (listaRecursos) {
        listaRecursos.replaceChildren();
        (ambiente?.recursos || dadosSalasFallback(nomeSala).recursos).forEach((item) => {
            const listItem = document.createElement('li');
            listItem.textContent = item;
            listaRecursos.appendChild(listItem);
        });
    }

    if (modal) modal.style.display = 'flex';
}

function dadosSalasFallback(name) {
    const ambiente = ambientesCadastrados.find((item) => item.nome === name);
    return ambiente ? { info: ambiente.informacoes, recursos: ambiente.recursos } : {
        info: ['Informações do ambiente indisponíveis.'],
        recursos: []
    };
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