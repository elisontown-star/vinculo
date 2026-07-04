#!/usr/bin/env node
/**
 * Seed de dados fictícios para o Vínculo.
 *
 * Cria 5 pacientes com TODOS os campos preenchidos (dados pessoais, quadro
 * clínico, saúde, estilo de vida, interesses, personalidade, relacionamentos,
 * financeiro e família), além de consultas e eventos de linha do tempo — assim
 * a aba Ana Luiza mostra resumo, tendência e temas recorrentes de verdade.
 *
 * USO (na pasta do repositório):
 *   API_URL=https://vinculo-api.vtechit-vinculo.workers.dev \
 *   [email protected] SEED_PASS=suasenha \
 *   node scripts/seed.mjs
 *
 * Windows (CMD), em várias linhas:
 *   set API_URL=https://vinculo-api.vtechit-vinculo.workers.dev
 *   set [email protected]
 *   set SEED_PASS=suasenha
 *   node scripts/seed.mjs
 */

import { createInterface } from 'node:readline';

const API = process.env.API_URL || 'https://vinculo-api.vtechit-vinculo.workers.dev';
const EMAIL = process.env.SEED_EMAIL || 'valdielison@vtechit.com.br';
let PASS = process.env.SEED_PASS;

// Pergunta a senha de forma interativa (evita problemas do CMD com @ ! % ^ & etc.)
function askPassword() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Senha (a digitação fica visível): ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function req(path, { method = 'GET', token, body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const cause = e?.cause?.message || e?.cause?.code || e?.message || String(e);
    throw new Error(`Falha de conexão em ${method} ${path} → ${cause}`);
  }
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return json;
}

// Datas relativas (para consultas recentes) ----------------------------------
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const isoDate = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toISOString();

// ---------------------------------------------------------------------------
// Os 5 pacientes. `profile` cobre todas as seções da Ficha e Dados cadastrais.
// ---------------------------------------------------------------------------
const PATIENTS = [
  {
    fullName: 'Mariana Alves Ribeiro',
    socialName: 'Mari',
    cpf: '123.456.789-01',
    email: '[email protected]',
    phone: '(11) 3222-1010',
    whatsapp: '(11) 98888-1010',
    birthDate: '1992-03-14',
    status: 'active',
    profile: {
      personal: {
        sex: 'Feminino', gender: 'Mulher cis', rg: '12.345.678-9',
        maritalStatus: 'Casada', profession: 'Arquiteta', company: 'Estúdio Norte',
        education: 'Pós-graduação', address: 'Rua das Acácias, 120, apto 52',
        city: 'São Paulo', state: 'SP', zip: '01234-000',
      },
      clinical: {
        complaint: 'Ansiedade e dificuldade para dormir há cerca de seis meses.',
        history: 'Quadro iniciou após mudança de emprego; piora em períodos de entrega de projetos.',
        goals: 'Reduzir a ansiedade e recuperar a qualidade do sono.',
        suffering: 'Moderado', psychiatric: 'Em acompanhamento',
        priorDiagnoses: 'Transtorno de ansiedade generalizada (2023).',
        priorTreatments: 'TCC por 8 meses em 2023.',
        referrals: 'Psiquiatra parceiro para avaliação medicamentosa.',
      },
      health: {
        depression: false, anxiety: true, tag: true, tdah: false, bipolar: false,
        medications: 'Escitalopram 10mg (manhã).',
        diseases: 'Nenhuma crônica relatada.',
        surgeries: 'Apendicectomia (2010).',
        hospitalizations: 'Nenhuma recente.',
        familyHistory: 'Mãe com histórico de ansiedade.',
      },
      lifestyle: {
        sports: 'Às vezes', gym: 'Frequentemente', diet: 'Equilibrada',
        sleep: 'Ruim', alcohol: 'Socialmente', smoking: 'Não fuma',
        drugs: 'Não usa', religion: 'Católica', spirituality: 'Moderada',
      },
      interests: {
        books: 'Ficção literária', movies: 'Dramas', music: 'MPB',
        games: 'Palavras cruzadas', social: 'Instagram', tech: 'Design 3D',
        hobbies: 'Jardinagem e aquarela nos fins de semana.',
      },
      personality: {
        introvert: true, extrovert: false, communicative: true, reserved: true,
        impulsive: false, organized: true, creative: true,
        notes: 'Perfeccionista, autocrítica elevada.',
      },
      relationships: {
        family: 'Boa relação com os pais; contato semanal.',
        friends: 'Grupo pequeno e próximo.',
        work: 'Ambiente competitivo, sente pressão da liderança.',
        romantic: 'Casamento estável há 5 anos.',
      },
      financial: {
        ownHome: true, rent: false, withFamily: false, car: true, motorcycle: false,
        situation: 'Confortável', debt: 'Sem dívidas', work: 'CLT', income: 'Acima de 10 salários',
      },
      family: {
        father: { name: 'Carlos Ribeiro', alive: 'Sim', age: '64', relation: 'Boa', notes: 'Aposentado.' },
        mother: { name: 'Sônia Alves', alive: 'Sim', age: '61', relation: 'Muito próxima', notes: 'Professora.' },
        grandparents: 'Avós maternos vivos.',
        siblings: 'Uma irmã mais nova.',
        uncles: 'Vários, contato esporádico.',
        children: 'Não tem filhos.',
        spouse: 'Rafael, 34 anos, engenheiro.',
        important: 'Sogra participa bastante da rotina.',
      },
    },
    sessions: [
      { daysAgo: 42, mood: 'Ansiosa', emotionalScale: 4, topics: ['ansiedade', 'sono', 'trabalho'],
        techniques: 'Psicoeducação sobre ansiedade.', evolution: 'Reconheceu gatilhos ligados a prazos.',
        nextSteps: 'Registro diário de sono.' },
      { daysAgo: 28, mood: 'Cansada', emotionalScale: 5, topics: ['sono', 'trabalho'],
        techniques: 'Higiene do sono.', evolution: 'Leve melhora no adormecer.',
        nextSteps: 'Manter rotina de sono.' },
      { daysAgo: 14, mood: 'Mais calma', emotionalScale: 6, topics: ['ansiedade', 'autocrítica'],
        techniques: 'Reestruturação cognitiva.', evolution: 'Menos ruminação sobre erros.',
        nextSteps: 'Exercício de autocompaixão.' },
      { daysAgo: 3, mood: 'Estável', emotionalScale: 7, topics: ['autocrítica', 'trabalho'],
        techniques: 'Treino de assertividade.', evolution: 'Conseguiu delegar tarefas.',
        nextSteps: 'Praticar limites no trabalho.' },
    ],
    timeline: [
      { year: 2023, title: 'Diagnóstico de TAG', description: 'Início do acompanhamento.' },
      { year: 2024, title: 'Mudança de emprego', description: 'Novo cargo com mais pressão.' },
    ],
  },
  {
    fullName: 'João Pedro Santos',
    socialName: 'JP',
    cpf: '234.567.890-12',
    email: '[email protected]',
    phone: '(21) 3333-2020',
    whatsapp: '(21) 97777-2020',
    birthDate: '1988-11-02',
    status: 'active',
    profile: {
      personal: {
        sex: 'Masculino', gender: 'Homem cis', rg: '23.456.789-0',
        maritalStatus: 'Solteiro', profession: 'Desenvolvedor', company: 'TechCo',
        education: 'Superior completo', address: 'Av. Atlântica, 800, bloco B',
        city: 'Rio de Janeiro', state: 'RJ', zip: '22010-000',
      },
      clinical: {
        complaint: 'Sintomas depressivos e desmotivação no trabalho.',
        history: 'Piora após término de relacionamento longo.',
        goals: 'Retomar motivação e reconstruir rede de apoio.',
        suffering: 'Intenso', psychiatric: 'Sem acompanhamento',
        priorDiagnoses: 'Nenhum formal.',
        priorTreatments: 'Primeira experiência com terapia.',
        referrals: 'Avaliar encaminhamento psiquiátrico.',
      },
      health: {
        depression: true, anxiety: true, tag: false, tdah: true, bipolar: false,
        medications: 'Nenhuma no momento.',
        diseases: 'Enxaqueca ocasional.',
        surgeries: 'Nenhuma.',
        hospitalizations: 'Nenhuma.',
        familyHistory: 'Pai com depressão.',
      },
      lifestyle: {
        sports: 'Raramente', gym: 'Nunca', diet: 'Irregular',
        sleep: 'Irregular', alcohol: 'Frequentemente', smoking: 'Não fuma',
        drugs: 'Não usa', religion: 'Sem religião', spirituality: 'Baixa',
      },
      interests: {
        books: 'Ficção científica', movies: 'Suspense', music: 'Rock',
        games: 'Videogames (RPG)', social: 'Reddit', tech: 'Programação',
        hobbies: 'Montar setups e mods de jogos.',
      },
      personality: {
        introvert: true, extrovert: false, communicative: false, reserved: true,
        impulsive: true, organized: false, creative: true,
        notes: 'Tende ao isolamento em fases difíceis.',
      },
      relationships: {
        family: 'Relação distante com o pai.',
        friends: 'Amizades sobretudo online.',
        work: 'Bom tecnicamente, evita reuniões sociais.',
        romantic: 'Término recente após 6 anos.',
      },
      financial: {
        ownHome: false, rent: true, withFamily: false, car: false, motorcycle: true,
        situation: 'Estável', debt: 'Dívidas pequenas', work: 'CLT', income: 'Entre 5 e 10 salários',
      },
      family: {
        father: { name: 'Antônio Santos', alive: 'Sim', age: '66', relation: 'Distante', notes: 'Pouco contato.' },
        mother: { name: 'Lúcia Santos', alive: 'Não', age: '—', relation: 'Era próxima', notes: 'Falecida em 2019.' },
        grandparents: 'Falecidos.',
        siblings: 'Um irmão mais velho.',
        uncles: 'Contato raro.',
        children: 'Não tem.',
        spouse: 'Sem parceiro atualmente.',
        important: 'Melhor amigo mora em outra cidade.',
      },
    },
    sessions: [
      { daysAgo: 35, mood: 'Deprimido', emotionalScale: 3, topics: ['depressão', 'término', 'isolamento'],
        techniques: 'Acolhimento e ativação comportamental.', evolution: 'Verbalizou luto do relacionamento.',
        nextSteps: 'Planejar uma atividade prazerosa na semana.' },
      { daysAgo: 21, mood: 'Apático', emotionalScale: 4, topics: ['isolamento', 'trabalho'],
        techniques: 'Ativação comportamental.', evolution: 'Retomou contato com um amigo.',
        nextSteps: 'Sair de casa ao menos 2x na semana.' },
      { daysAgo: 7, mood: 'Um pouco melhor', emotionalScale: 5, topics: ['depressão', 'rotina'],
        techniques: 'Estruturação de rotina.', evolution: 'Voltou a cozinhar em casa.',
        nextSteps: 'Considerar avaliação psiquiátrica.' },
    ],
    timeline: [
      { year: 2019, title: 'Falecimento da mãe', description: 'Perda significativa.' },
      { year: 2024, title: 'Término de relacionamento', description: 'Fim de união de 6 anos.' },
    ],
  },
  {
    fullName: 'Fernanda Costa Lima',
    socialName: 'Fê',
    cpf: '345.678.901-23',
    email: '[email protected]',
    phone: '(31) 3444-3030',
    whatsapp: '(31) 96666-3030',
    birthDate: '2001-06-25',
    status: 'active',
    profile: {
      personal: {
        sex: 'Feminino', gender: 'Mulher cis', rg: '34.567.890-1',
        maritalStatus: 'Solteira', profession: 'Estudante', company: 'UFMG',
        education: 'Superior incompleto', address: 'Rua dos Ipês, 45',
        city: 'Belo Horizonte', state: 'MG', zip: '30130-000',
      },
      clinical: {
        complaint: 'Crises de ansiedade antes de provas e apresentações.',
        history: 'Sempre foi tímida; piorou na universidade.',
        goals: 'Lidar melhor com avaliações e falar em público.',
        suffering: 'Moderado', psychiatric: 'Sem acompanhamento',
        priorDiagnoses: 'Nenhum.',
        priorTreatments: 'Nenhum.',
        referrals: 'Não necessário no momento.',
      },
      health: {
        depression: false, anxiety: true, tag: false, tdah: false, bipolar: false,
        medications: 'Nenhuma.',
        diseases: 'Nenhuma.',
        surgeries: 'Nenhuma.',
        hospitalizations: 'Nenhuma.',
        familyHistory: 'Sem histórico relevante.',
      },
      lifestyle: {
        sports: 'Frequentemente', gym: 'Às vezes', diet: 'Equilibrada',
        sleep: 'Bom', alcohol: 'Socialmente', smoking: 'Não fuma',
        drugs: 'Não usa', religion: 'Espírita', spirituality: 'Alta',
      },
      interests: {
        books: 'Autoajuda e romances', movies: 'Comédias', music: 'Pop',
        games: 'Jogos de celular', social: 'TikTok', tech: 'Edição de vídeo',
        hobbies: 'Dança e voluntariado.',
      },
      personality: {
        introvert: true, extrovert: false, communicative: true, reserved: false,
        impulsive: false, organized: true, creative: true,
        notes: 'Empática, muito exigente consigo mesma.',
      },
      relationships: {
        family: 'Mora com os pais, boa convivência.',
        friends: 'Rede ampla na faculdade.',
        work: 'Estágio iniciado recentemente.',
        romantic: 'Namoro recente.',
      },
      financial: {
        ownHome: false, rent: false, withFamily: true, car: false, motorcycle: false,
        situation: 'Dependente da família', debt: 'Sem dívidas', work: 'Estágio', income: 'Até 2 salários',
      },
      family: {
        father: { name: 'Marcos Lima', alive: 'Sim', age: '52', relation: 'Boa', notes: 'Comerciante.' },
        mother: { name: 'Cláudia Costa', alive: 'Sim', age: '49', relation: 'Muito próxima', notes: 'Enfermeira.' },
        grandparents: 'Avó paterna presente.',
        siblings: 'Um irmão mais novo.',
        uncles: 'Muito próximos.',
        children: 'Não tem.',
        spouse: 'Namorado, 22 anos.',
        important: 'Prima é como uma irmã.',
      },
    },
    sessions: [
      { daysAgo: 30, mood: 'Nervosa', emotionalScale: 5, topics: ['ansiedade', 'provas', 'timidez'],
        techniques: 'Respiração diafragmática.', evolution: 'Aprendeu técnica de respiração.',
        nextSteps: 'Aplicar antes da próxima prova.' },
      { daysAgo: 16, mood: 'Confiante', emotionalScale: 7, topics: ['provas', 'autoestima'],
        techniques: 'Exposição gradual.', evolution: 'Apresentou seminário com menos ansiedade.',
        nextSteps: 'Aumentar exposição em grupos.' },
      { daysAgo: 2, mood: 'Animada', emotionalScale: 8, topics: ['autoestima', 'faculdade'],
        techniques: 'Reforço positivo.', evolution: 'Relatou orgulho do próprio progresso.',
        nextSteps: 'Manter registro de conquistas.' },
    ],
    timeline: [
      { year: 2020, title: 'Ingresso na universidade', description: 'Início da graduação.' },
      { year: 2024, title: 'Primeiro estágio', description: 'Marco de autonomia.' },
    ],
  },
  {
    fullName: 'Roberto Nunes Oliveira',
    socialName: '',
    cpf: '456.789.012-34',
    email: '[email protected]',
    phone: '(41) 3555-4040',
    whatsapp: '(41) 95555-4040',
    birthDate: '1975-09-08',
    status: 'active',
    profile: {
      personal: {
        sex: 'Masculino', gender: 'Homem cis', rg: '45.678.901-2',
        maritalStatus: 'Divorciado', profession: 'Empresário', company: 'Nunes & Cia',
        education: 'Superior completo', address: 'Rua XV de Novembro, 300',
        city: 'Curitiba', state: 'PR', zip: '80020-000',
      },
      clinical: {
        complaint: 'Estresse crônico e irritabilidade afetando a família.',
        history: 'Longa jornada de trabalho; divórcio recente.',
        goals: 'Reduzir estresse e melhorar relação com os filhos.',
        suffering: 'Intenso', psychiatric: 'Em acompanhamento',
        priorDiagnoses: 'Burnout (2022).',
        priorTreatments: 'Afastamento e terapia breve em 2022.',
        referrals: 'Acompanhamento com cardiologista.',
      },
      health: {
        depression: false, anxiety: true, tag: true, tdah: false, bipolar: false,
        medications: 'Losartana 50mg (hipertensão).',
        diseases: 'Hipertensão.',
        surgeries: 'Hérnia (2018).',
        hospitalizations: 'Observação por pico de pressão (2022).',
        familyHistory: 'Pai com doença cardíaca.',
      },
      lifestyle: {
        sports: 'Raramente', gym: 'Nunca', diet: 'Irregular',
        sleep: 'Ruim', alcohol: 'Frequentemente', smoking: 'Ex-fumante',
        drugs: 'Não usa', religion: 'Católico', spirituality: 'Baixa',
      },
      interests: {
        books: 'Negócios e biografias', movies: 'Ação', music: 'Clássica',
        games: 'Xadrez', social: 'LinkedIn', tech: 'Gestão',
        hobbies: 'Pesca esportiva quando consegue tempo.',
      },
      personality: {
        introvert: false, extrovert: true, communicative: true, reserved: false,
        impulsive: true, organized: true, creative: false,
        notes: 'Controlador, dificuldade em delegar.',
      },
      relationships: {
        family: 'Relação tensa com a ex-esposa.',
        friends: 'Poucos amigos próximos por falta de tempo.',
        work: 'Muito envolvido, centraliza decisões.',
        romantic: 'Divorciado há 1 ano.',
      },
      financial: {
        ownHome: true, rent: false, withFamily: false, car: true, motorcycle: false,
        situation: 'Confortável', debt: 'Financiamentos', work: 'Autônomo', income: 'Acima de 10 salários',
      },
      family: {
        father: { name: 'José Oliveira', alive: 'Não', age: '—', relation: 'Era respeitosa', notes: 'Falecido em 2021.' },
        mother: { name: 'Terezinha Nunes', alive: 'Sim', age: '72', relation: 'Boa', notes: 'Mora sozinha.' },
        grandparents: 'Falecidos.',
        siblings: 'Duas irmãs.',
        uncles: 'Contato ocasional.',
        children: 'Dois filhos (12 e 15 anos).',
        spouse: 'Divorciado.',
        important: 'Sócio de longa data é confidente.',
      },
    },
    sessions: [
      { daysAgo: 40, mood: 'Irritado', emotionalScale: 3, topics: ['estresse', 'trabalho', 'divórcio'],
        techniques: 'Psicoeducação sobre estresse.', evolution: 'Identificou sobrecarga.',
        nextSteps: 'Mapear tarefas delegáveis.' },
      { daysAgo: 26, mood: 'Tenso', emotionalScale: 4, topics: ['trabalho', 'filhos'],
        techniques: 'Gestão de tempo.', evolution: 'Começou a delegar no trabalho.',
        nextSteps: 'Reservar tempo com os filhos.' },
      { daysAgo: 12, mood: 'Reflexivo', emotionalScale: 5, topics: ['filhos', 'divórcio'],
        techniques: 'Comunicação não violenta.', evolution: 'Conversa mais tranquila com a ex.',
        nextSteps: 'Planejar fim de semana com os filhos.' },
      { daysAgo: 4, mood: 'Mais leve', emotionalScale: 6, topics: ['estresse', 'autocuidado'],
        techniques: 'Plano de autocuidado.', evolution: 'Retomou a pesca no fim de semana.',
        nextSteps: 'Incluir caminhada na rotina.' },
    ],
    timeline: [
      { year: 2022, title: 'Diagnóstico de burnout', description: 'Afastamento do trabalho.' },
      { year: 2023, title: 'Divórcio', description: 'Separação após 18 anos.' },
    ],
  },
  {
    fullName: 'Beatriz Almeida Souza',
    socialName: 'Bia',
    cpf: '567.890.123-45',
    email: '[email protected]',
    phone: '(51) 3666-5050',
    whatsapp: '(51) 94444-5050',
    birthDate: '1996-01-19',
    status: 'inactive',
    profile: {
      personal: {
        sex: 'Feminino', gender: 'Mulher trans', rg: '56.789.012-3',
        maritalStatus: 'União estável', profession: 'Enfermeira', company: 'Hospital Central',
        education: 'Superior completo', address: 'Av. Ipiranga, 1500, apto 33',
        city: 'Porto Alegre', state: 'RS', zip: '90160-000',
      },
      clinical: {
        complaint: 'Esgotamento após plantões e questões de identidade no trabalho.',
        history: 'Sobrecarga na pandemia; enfrentou preconceito no ambiente profissional.',
        goals: 'Fortalecer autoestima e estabelecer limites saudáveis.',
        suffering: 'Moderado', psychiatric: 'Sem acompanhamento',
        priorDiagnoses: 'Episódio depressivo leve (2021).',
        priorTreatments: 'Terapia de apoio em 2021.',
        referrals: 'Grupo de apoio recomendado.',
      },
      health: {
        depression: true, anxiety: false, tag: false, tdah: false, bipolar: false,
        medications: 'Terapia hormonal em acompanhamento médico.',
        diseases: 'Nenhuma crônica.',
        surgeries: 'Nenhuma.',
        hospitalizations: 'Nenhuma.',
        familyHistory: 'Mãe com depressão pós-parto.',
      },
      lifestyle: {
        sports: 'Às vezes', gym: 'Frequentemente', diet: 'Vegetariana',
        sleep: 'Irregular', alcohol: 'Raramente', smoking: 'Não fuma',
        drugs: 'Não usa', religion: 'Umbanda', spirituality: 'Alta',
      },
      interests: {
        books: 'Poesia e ensaios', movies: 'Documentários', music: 'Indie',
        games: 'Board games', social: 'Twitter/X', tech: 'Saúde digital',
        hobbies: 'Fotografia e ativismo social.',
      },
      personality: {
        introvert: false, extrovert: true, communicative: true, reserved: false,
        impulsive: false, organized: true, creative: true,
        notes: 'Resiliente, forte senso de propósito.',
      },
      relationships: {
        family: 'Apoio total da mãe; pai ausente.',
        friends: 'Rede de apoio sólida na comunidade.',
        work: 'Colegas acolhedores, chefia distante.',
        romantic: 'União estável há 3 anos.',
      },
      financial: {
        ownHome: false, rent: true, withFamily: false, car: false, motorcycle: false,
        situation: 'Estável', debt: 'Sem dívidas', work: 'CLT', income: 'Entre 5 e 10 salários',
      },
      family: {
        father: { name: 'Paulo Souza', alive: 'Sim', age: '58', relation: 'Distante', notes: 'Pouco contato.' },
        mother: { name: 'Regina Almeida', alive: 'Sim', age: '55', relation: 'Muito próxima', notes: 'Principal apoio.' },
        grandparents: 'Avó materna presente.',
        siblings: 'Filha única.',
        uncles: 'Tia materna próxima.',
        children: 'Não tem.',
        spouse: 'Companheira, 29 anos, designer.',
        important: 'Madrinha de consideração muito presente.',
      },
    },
    sessions: [
      { daysAgo: 60, mood: 'Esgotada', emotionalScale: 4, topics: ['esgotamento', 'trabalho', 'identidade'],
        techniques: 'Acolhimento e validação.', evolution: 'Falou sobre sobrecarga nos plantões.',
        nextSteps: 'Mapear limites possíveis no trabalho.' },
      { daysAgo: 45, mood: 'Reflexiva', emotionalScale: 5, topics: ['identidade', 'autoestima'],
        techniques: 'Fortalecimento de autoestima.', evolution: 'Reconheceu conquistas pessoais.',
        nextSteps: 'Buscar grupo de apoio.' },
      { daysAgo: 30, mood: 'Mais firme', emotionalScale: 7, topics: ['limites', 'trabalho'],
        techniques: 'Treino de assertividade.', evolution: 'Negociou escala mais equilibrada.',
        nextSteps: 'Avaliar continuidade do processo.' },
    ],
    timeline: [
      { year: 2021, title: 'Episódio depressivo', description: 'Durante a pandemia.' },
      { year: 2023, title: 'Início da união estável', description: 'Marco de estabilidade afetiva.' },
    ],
  },
];

async function main() {
  console.log(`API: ${API}`);
  console.log(`Login: ${EMAIL}`);
  if (!PASS) PASS = await askPassword();
  if (!PASS) throw new Error('Senha não informada.');
  const { token } = await req('/auth/login', { method: 'POST', body: { email: EMAIL, password: PASS } });
  if (!token) throw new Error('Login não retornou token.');
  console.log('Login OK.\n');

  let count = 0;
  for (const p of PATIENTS) {
    const { sessions = [], timeline = [], ...patientBody } = p;
    const { patient } = await req('/patients', { method: 'POST', token, body: patientBody });
    console.log(`✓ Paciente criado: ${patient.fullName} (${patient.id})`);

    for (const s of sessions) {
      const { daysAgo: d, ...rest } = s;
      await req(`/patients/${patient.id}/sessions`, {
        method: 'POST', token, body: { occurredAt: daysAgo(d), ...rest },
      });
    }
    if (sessions.length) console.log(`    ${sessions.length} consulta(s)`);

    for (const ev of timeline) {
      await req(`/patients/${patient.id}/timeline`, { method: 'POST', token, body: ev });
    }
    if (timeline.length) console.log(`    ${timeline.length} evento(s) de linha do tempo`);

    count++;
  }

  console.log(`\nConcluído: ${count} pacientes fictícios criados com sucesso.`);
}

main().catch((err) => {
  console.error('\nErro no seed:', err.message);
  process.exit(1);
});
