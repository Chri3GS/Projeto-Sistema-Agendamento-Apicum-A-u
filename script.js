// Banco de dados temporário de reservas (Recupera do localStorage ou inicia com o padrão)
let reservas = JSON.parse(localStorage.getItem('reservas_salvas')) || [
    
];

// Array de usuários cadastrados
let usuariosCadastrados = JSON.parse(localStorage.getItem('usuarios')) || [];
let usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado')) || null;

// Executa automaticamente ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
    atualizarInterfaceUsuario();
    atualizarTabela();
});

// ==========================================
// GERENCIAMENTO DE NAVEGAÇÃO E INTERFACE
// ==========================================

function showSection(sectionId, element) {
    // 1. Esconde todas as seções
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    
    // 2. Mostra a seção clicada
    document.getElementById(sectionId).style.display = 'block';

    // 3. Gerencia a classe 'active' nos botões do menu lateral
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    } else {
        // Se a navegação veio de um card externo, procura o li correspondente para ativar
        const abas = { 'home': 0, 'reserva': 1, 'lista': 2, 'falarComCt': 3 };
        const indice = abas[sectionId];
        if (indice !== undefined) document.querySelectorAll('.nav-links li')[indice].classList.add('active');
    }

    // 4. Se estiver no celular, fecha o menu lateral após clicar
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
    }
}

// Atalho do botão "Agendar" do card principal
function abrirReserva(nomeAmbiente) {
    document.getElementById('select-ambiente').value = nomeAmbiente;
    trocarFotoReserva(); // Garante que a foto atualize imediatamente
    showSection('reserva');
}

function trocarFotoReserva() {
    const ambiente = document.getElementById('select-ambiente').value;
    const imagem = document.getElementById('img-ambiente-reserva');
    
    const mapaFotos = {
        "Biblioteca": "imagens/ccc.jpg", 
        "Sala 01": "imagens/sala01.jpg",
        "Sala 02": "imagens/sala02.jpg",
        "Sala de Reunião": "imagens/sala_reuniao.jpg",
        "Laboratório de Informática": "imagens/lab_info.jpg"    
    };

    imagem.src = mapaFotos[ambiente] || "imagens/ccc.jpg";
}

function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
}

// ==========================================
// FLUXO DE RESERVAS
// ==========================================

async function salvarReserva() {
    if (!usuarioLogado) {
        alert("Você precisa entrar no sistema antes de agendar!");
        abrirModalLogin();
        return;
    }

    const ambiente = document.getElementById('select-ambiente').value;
    const motivo = document.getElementById('motivo').value.trim();
    const inicio = document.getElementById('data-inicio').value;
    const fim = document.getElementById('data-fim').value;

    if (!inicio || !fim) {
        alert("Preencha os horários!");
        return;
    }

    const novaReserva = {
        usuario: usuarioLogado.nome, 
        ambiente: ambiente,
        data: `${formataData(inicio)} até ${formataData(fim)}`,
        dataOrdenacao: new Date(inicio) // Importante para organizar a lista
    };

    try {
        // Envia para o Firebase
        await window.firestore.addDoc(window.firestore.collection(window.db, "reservas"), novaReserva);
        alert("Agendamento salvo na nuvem com sucesso!");
        
        // Limpa campos e atualiza tela
        document.getElementById('motivo').value = "";
        await atualizarTabela(); 
        showSection('lista');
    } catch (e) {
        console.error("Erro ao salvar: ", e);
        alert("Erro ao conectar com o banco de dados.");
    }
}

function formataData(dataString) {
    const d = new Date(dataString);
    return d.toLocaleString('pt-BR').replace(',', ' -');
}

async function atualizarTabela() {
    const tbody = document.querySelector('#tabela-reservas tbody');
    if (!tbody) return;
    
    tbody.innerHTML = "<tr><td colspan='3'>Carregando dados da nuvem...</td></tr>";

    try {
        // Busca as reservas ordenadas pela data
        const q = window.firestore.query(
            window.firestore.collection(window.db, "reservas"), 
            window.firestore.orderBy("dataOrdenacao", "asc")
        );
        
        const querySnapshot = await window.firestore.getDocs(q);
        tbody.innerHTML = "";

        querySnapshot.forEach((doc) => {
            const res = doc.data();
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${res.usuario}</strong></td>
                <td>${res.ambiente}</td>
                <td>${res.data}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Erro ao carregar: ", e);
        tbody.innerHTML = "<tr><td colspan='3'>Erro ao carregar agendamentos.</td></tr>";
    }
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
    document.getElementById('modalLogin').style.display = 'flex';
}

function fecharModalLogin() {
    document.getElementById('modalLogin').style.display = 'none';
}

function alternarAbasLogin(aba) {
    const telaLogin = document.getElementById('tela-login-direto');
    const telaCadastro = document.getElementById('tela-cadastro');
    const titulo = document.getElementById('loginModalTitulo');

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
    const nome = document.getElementById('cad-nome').value.trim();
    const whatsapp = document.getElementById('cad-whatsapp').value.trim();
    const tipo = document.getElementById('cad-tipo').value;

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
    const whatsappInput = document.getElementById('login-whatsapp').value.trim();

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
        alert("Número não encontrado! Por favor, faça o seu cadastro primeiro.");
        alternarAbasLogin('cadastro');
    }
}

// RESOLVIDO: Trata de forma inteligente o tamanho da string para PC e Mobile
function atualizarInterfaceUsuario() {
    const textoTopo = document.getElementById('texto-usuario-topo');
    if (!textoTopo) return;
    
    if (usuarioLogado) {
        const primeiroNome = usuarioLogado.nome.split(' ')[0];
        
        // Verifica se a tela é de celular para encurtar radicalmente e proteger a logo
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

// Dados estáticos das salas
const dadosSalas = {
    "Biblioteca": {
        info: ["Sala climatizada", "Iluminação ambiente", "Capacidade: 15 pessoas"],
        recursos: ["Internet banda larga", "Mesas redondas grandes", "Cadeiras confortáveis", "Acervo de livros", "Suporte humano"]
    },
    "Sala 01": {
        info: ["Sala climatizada", "Iluminação ambiente", "Capacidade: 30 pessoas"],
        recursos: ["Internet banda larga", "Mesa para docente", "Cadeiras","Data Show","Tela de projeção","Quadro branco","Caixa de som"]
    },
    "Sala 02": {
        info: ["Sala climatizada", "Iluminação ambiente", "Capacidade: 30 pessoas"],
        recursos: ["Internet banda larga", "Mesa para docente", "Cadeiras","Data Show","Tela de projeção","Quadro branco","Caixa de som"]
    },
    "Sala de Reunião": {
        info: ["Sala climatizada", "Iluminação ambiente", "Capacidade: 10 pessoas"],
        recursos: ["Internet banda larga", "Mesas grande", "Cadeiras confortáveis","Data Show","Tela de projeção","Caixa de som"]
    },
    "Laboratório de Informática": {
        info: ["Sala climatizada", "Iluminação ambiente", "Capacidade: 20 pessoas"],
        recursos: ["Internet banda larga", "Computadores", "Mesas","Cadeiras","Equipamentos multimídia"]
    }
};

function abrirInformacao(nomeSala) {
    const modal = document.getElementById('modalInformacao');
    const sala = dadosSalas[nomeSala] || dadosSalas["Biblioteca"];

    document.getElementById('modalTitulo').innerText = nomeSala;
    
    const listaInfo = document.getElementById('listaInfo');
    const listaRecursos = document.getElementById('listaRecursos');
    
    listaInfo.innerHTML = sala.info.map(item => `<li>${item}</li>`).join('');
    listaRecursos.innerHTML = sala.recursos.map(item => `<li>${item}</li>`).join('');

    modal.style.display = 'flex';
}

function fecharModal() {
    document.getElementById('modalInformacao').style.display = 'none';
}

// RESOLVIDO: Evento global de clique unificado para fechar QUALQUER modal ao clicar fora
window.onclick = function(event) {
    const modalInfo = document.getElementById('modalInformacao');
    const modalLogin = document.getElementById('modalLogin');
    
    if (event.target == modalInfo) {
        fecharModal();
    }
    if (event.target == modalLogin) {
        fecharModalLogin();
    }
};