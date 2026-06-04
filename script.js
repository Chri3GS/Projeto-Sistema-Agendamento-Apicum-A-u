// Banco de dados temporário (em memória)
let reservas = [
    { usuario: "João", ambiente: "Biblioteca", data: "20/06/2026 - 08:00 às 10:00" }
];

// Função para mudar de tela
function showSection(sectionId, element) {
    // Esconder todas as seções
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    // Mostrar a selecionada
    document.getElementById(sectionId).style.display = 'block';

    // Atualizar menu ativo
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    element.classList.add('active');
}

// Atalho do botão "Agendar" do card
function abrirReserva(nomeAmbiente) {
    document.getElementById('select-ambiente').value = nomeAmbiente;
    showSection('reserva', document.querySelectorAll('.nav-links li')[1]);
}
function trocarFotoReserva() {
    const ambiente = document.getElementById('select-ambiente').value;
    const imagem = document.getElementById('img-ambiente-reserva');
    
    // Aqui você coloca o caminho das suas fotos reais
    const mapaFotos = {
        "Biblioteca": "imagens/ccc.jpg", 
        "Sala 01": "imagens/sala01.jpg",
        "Sala 02": "imagens/sala02.jpg",
        "Sala de Reunião": "imagens/sala_reuniao.jpg",
        "Laboratório de Informática": "imagens/lab_info.jpg"    
    };

    imagem.src = mapaFotos[ambiente] || "imagens/ccc.jpg";
}
// Salvar a reserva e atualizar a tabela
function salvarReserva() {
    const ambiente = document.getElementById('select-ambiente').value;
    const motivo = document.getElementById('motivo').value;
    const inicio = document.getElementById('data-inicio').value;
    const fim = document.getElementById('data-fim').value;

    if(!inicio || !fim) {
        alert("Por favor, preencha as datas!");
        return;
    }

    // Adiciona ao "banco de dados"
    const novaReserva = {
        usuario: "Você", // Simulando usuário logado
        ambiente: ambiente,
        data: `${formataData(inicio)} até ${formataData(fim)}`
    };

    reservas.push(novaReserva);
    atualizarTabela();
    
    // Limpa campos e vai para a lista
    document.getElementById('motivo').value = "";
    showSection('lista', document.querySelectorAll('.nav-links li')[2]);
}

function formataData(dataString) {
    const d = new Date(dataString);
    return d.toLocaleString('pt-BR').replace(',', ' -');
}

function atualizarTabela() {
    const tbody = document.querySelector('#tabela-reservas tbody');
    tbody.innerHTML = "";

    reservas.forEach(res => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${res.usuario}</td>
            <td>${res.ambiente}</td>
            <td>${res.data}</td>
        `;
        tbody.appendChild(tr);
    });
}
function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('active');
}

// Atualize sua função de trocar seção para incluir o fechamento do menu no celular
function showSection(sectionId, element) {
    // 1. Esconde todas as seções
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    
    // 2. Mostra a seção clicada
    document.getElementById(sectionId).style.display = 'block';

    // 3. Gerencia a classe 'active' nos botões do menu
    document.querySelectorAll('.nav-links li').forEach(li => li.classList.remove('active'));
    element.classList.add('active');

    // 4. SE estiver no celular, fecha o menu após clicar
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
    }
}

// Objeto com as informações de cada sala
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
    }
    ,
    "Laboratório de Informática": {
        info: ["Sala climatizada", "Iluminação ambiente", "Capacidade: 20 pessoas"],
        recursos: ["Internet banda larga", "Computadores", "Mesas","Cadeiras","Equipamentos multimídia"]
    }
    
};

function abrirInformacao(nomeSala) {
    const modal = document.getElementById('modalInformacao');
    const sala = dadosSalas[nomeSala] || dadosSalas["Biblioteca"]; // Padrão biblioteca se não achar

    document.getElementById('modalTitulo').innerText = nomeSala;
    
    // Preenche as listas
    const listaInfo = document.getElementById('listaInfo');
    const listaRecursos = document.getElementById('listaRecursos');
    
    listaInfo.innerHTML = sala.info.map(item => `<li>${item}</li>`).join('');
    listaRecursos.innerHTML = sala.recursos.map(item => `<li>${item}</li>`).join('');

    modal.style.display = 'flex';
}

function fecharModal() {
    document.getElementById('modalInformacao').style.display = 'none';
}

// Fechar se clicar fora da caixa branca
window.onclick = function(event) {
    const modal = document.getElementById('modalInformacao');
    if (event.target == modal) {
        fecharModal();
    }
}
// Inicializar tabela
atualizarTabela();