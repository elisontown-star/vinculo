#!/usr/bin/env node
/**
 * Gera um arquivo SQL com 3 clínicas fictícias no plano Essencial,
 * cada uma com 1 psicólogo (dono), 1 secretária e 15 pacientes —
 * com ficha completa, consultas e linha do tempo.
 *
 * USO (na pasta do repositório):
 *   node scripts/seed-clinicas.mjs
 *
 * Depois, aplique no banco de produção:
 *   cd apps/api
 *   npx wrangler d1 execute vinculo --remote --file=../../scripts/seed-clinicas.sql
 *
 * Todos os dados são inventados. Nenhum CPF, e-mail ou telefone é real.
 */

import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

// Senha única para os três donos — troque depois do primeiro acesso.
const SENHA = 'Vinculo@2026';

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
const AGORA = Date.now();
const DIA = 86_400_000;

// Mesmo formato do apps/api/src/lib/password.ts: pbkdf2$iter$salt$hash
function hashSenha(senha) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(senha, salt, 100_000, 32, 'sha256');
  return `pbkdf2$100000$${salt.toString('base64')}$${hash.toString('base64')}`;
}

let semente = 20260805;
function rnd() {
  semente = (semente * 1103515245 + 12345) & 0x7fffffff;
  return semente / 0x7fffffff;
}
const escolha = (arr) => arr[Math.floor(rnd() * arr.length)];
const inteiro = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
const varios = (arr, n) => {
  const c = [...arr];
  const out = [];
  for (let i = 0; i < n && c.length; i++) out.push(...c.splice(Math.floor(rnd() * c.length), 1));
  return out;
};

// Escapa string para SQL (aspas simples duplicadas).
const s = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v === null || v === undefined ? 'NULL' : String(v));

function codigoEmpresa() {
  return `VTX-${randomBytes(4).toString('hex').toUpperCase()}`;
}
function cpfFicticio() {
  const d = () => inteiro(0, 9);
  return `${d()}${d()}${d()}.${d()}${d()}${d()}.${d()}${d()}${d()}-${d()}${d()}`;
}
function telefone(ddd) {
  return `(${ddd}) 9${inteiro(1000, 9999)}-${inteiro(1000, 9999)}`;
}
function semAcento(t) {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Vocabulário fictício
// ---------------------------------------------------------------------------
const NOMES_M = ['Bruno', 'Caio', 'Diego', 'Eduardo', 'Felipe', 'Gustavo', 'Henrique', 'Igor', 'Leandro', 'Marcelo', 'Otávio', 'Paulo', 'Rodrigo', 'Thiago', 'Vinícius'];
const NOMES_F = ['Amanda', 'Beatriz', 'Carolina', 'Daniela', 'Elisa', 'Fernanda', 'Gabriela', 'Helena', 'Isabela', 'Juliana', 'Larissa', 'Mariana', 'Natália', 'Patrícia', 'Renata'];
const SOBRENOMES = ['Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Ferreira', 'Gonçalves', 'Henriques', 'Ibrahim', 'Junqueira', 'Lima', 'Machado', 'Nogueira', 'Oliveira', 'Pacheco', 'Queiroz', 'Ribeiro', 'Santana', 'Teixeira', 'Vasconcelos'];

const QUEIXAS = [
  'Crises de ansiedade antes de reuniões de trabalho',
  'Dificuldade de concentração e procrastinação',
  'Insônia recorrente há cerca de seis meses',
  'Luto pela perda do pai no ano passado',
  'Conflitos frequentes no relacionamento conjugal',
  'Sentimento persistente de desânimo e cansaço',
  'Medo intenso de falar em público',
  'Baixa autoestima e autocrítica excessiva',
  'Estresse com a rotina de cuidados dos filhos',
  'Insegurança após demissão inesperada',
  'Episódios de irritabilidade com a família',
  'Preocupação constante com a saúde',
  'Dificuldade de estabelecer limites no trabalho',
  'Ansiedade relacionada à mudança de cidade',
  'Sensação de vazio após o fim de um relacionamento',
];
const OBJETIVOS = [
  'Reduzir a frequência das crises de ansiedade',
  'Reorganizar a rotina e o autocuidado',
  'Elaborar o processo de luto',
  'Fortalecer a autoestima',
  'Melhorar a qualidade do sono',
  'Desenvolver estratégias de enfrentamento',
  'Trabalhar limites nos relacionamentos',
  'Ampliar a rede de apoio social',
];
const TECNICAS = ['Reestruturação cognitiva', 'Respiração diafragmática', 'Registro de pensamentos', 'Técnicas de mindfulness', 'Psicoeducação', 'Exposição gradual', 'Treino de habilidades sociais', 'Escuta ativa e validação'];
const HUMORES = ['Ótimo', 'Bem', 'Neutro', 'Ansioso', 'Triste', 'Irritado', 'Cansado', 'Esperançoso'];
const TEMAS = ['ansiedade', 'sono', 'trabalho', 'família', 'autoestima', 'rotina', 'luto', 'relacionamento', 'finanças', 'lazer', 'corpo', 'estudos'];
const EVOLUCOES = [
  'Paciente demonstrou boa adesão às tarefas propostas.',
  'Relatou leve melhora nos sintomas ao longo da semana.',
  'Trouxe avanços na aplicação das técnicas no dia a dia.',
  'Apresentou resistência inicial, mas engajou-se ao final da sessão.',
  'Percebe-se maior consciência emocional e vocabulário afetivo.',
  'Semana difícil, com aumento da sintomatologia ansiosa.',
];
const PROXIMOS = [
  'Praticar respiração diafragmática 2x ao dia.',
  'Registrar pensamentos automáticos durante a semana.',
  'Retomar atividade física gradualmente.',
  'Conversar com a família sobre os limites combinados.',
  'Manter diário do sono até a próxima sessão.',
  'Listar situações que geram desconforto no trabalho.',
];
const MARCOS = [
  ['Início do acompanhamento', 'Primeira sessão e construção do vínculo terapêutico.', 'clínico'],
  ['Mudança de emprego', 'Transição profissional com impacto na rotina.', 'trabalho'],
  ['Perda familiar', 'Falecimento de familiar próximo.', 'pessoal'],
  ['Início de medicação', 'Encaminhamento psiquiátrico e início de tratamento medicamentoso.', 'clínico'],
  ['Mudança de cidade', 'Alteração significativa da rede de apoio.', 'pessoal'],
  ['Fim de relacionamento', 'Separação após relacionamento de longa duração.', 'pessoal'],
  ['Retomada dos estudos', 'Voltou a estudar após alguns anos.', 'estudos'],
];

const CIDADES = [
  ['São Paulo', 'SP', '11'], ['Campinas', 'SP', '19'], ['Rio de Janeiro', 'RJ', '21'],
  ['Belo Horizonte', 'MG', '31'], ['Curitiba', 'PR', '41'], ['Porto Alegre', 'RS', '51'],
  ['Salvador', 'BA', '71'], ['Recife', 'PE', '81'], ['Fortaleza', 'CE', '85'],
];
const PROFISSOES = ['Analista de sistemas', 'Professora', 'Enfermeiro', 'Advogada', 'Designer', 'Vendedor', 'Contadora', 'Engenheiro civil', 'Nutricionista', 'Administrador', 'Fisioterapeuta', 'Jornalista', 'Arquiteta', 'Motorista', 'Estudante'];

// ---------------------------------------------------------------------------
// As 3 clínicas
// ---------------------------------------------------------------------------
const CLINICAS = [
  {
    nome: 'Espaço Aurora Psicologia',
    dominio: 'espacoaurora.com.br',
    cidade: ['São Paulo', 'SP', '11'],
    dona: 'Dra. Helena Vasconcelos',
    secretaria: 'Priscila Amaral',
  },
  {
    nome: 'Clínica Raízes',
    dominio: 'clinicaraizes.com.br',
    cidade: ['Belo Horizonte', 'MG', '31'],
    dona: 'Dr. Eduardo Ramalho',
    secretaria: 'Tatiane Correia',
  },
  {
    nome: 'Núcleo Bem-Estar',
    dominio: 'nucleobemestar.com.br',
    cidade: ['Curitiba', 'PR', '41'],
    dona: 'Dra. Marina Castro',
    secretaria: 'Rogério Pinto',
  },
];

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------
const linhas = [
  '-- Seed: 3 clínicas fictícias no plano Essencial, 15 pacientes cada.',
  `-- Gerado em ${new Date().toISOString()}. Dados 100% fictícios.`,
  `-- Senha de todos os donos: ${SENHA}`,
  // O D1 controla a transação por conta própria — BEGIN/COMMIT explícitos
  // são rejeitados pelo runtime dos Durable Objects.
  'PRAGMA foreign_keys=OFF;',
];
const credenciais = [];

for (const cl of CLINICAS) {
  const clinicId = randomUUID();
  const [cidade, uf, ddd] = cl.cidade;
  const criadaEm = AGORA - inteiro(20, 90) * DIA;

  linhas.push(
    `INSERT INTO clinics (id, name, company_code, plan, tax_id_type, tax_id, whatsapp, is_active, status, trial_ends_at, created_at) VALUES (` +
      `${s(clinicId)}, ${s(cl.nome)}, ${s(codigoEmpresa())}, 'essencial', NULL, NULL, ` +
      `${s(telefone(ddd))}, 1, 'trial', ${n(AGORA + 30 * DIA)}, ${n(criadaEm)});`,
  );

  // Dono (psicólogo) e secretária — exatamente o que o Essencial comporta.
  const donoId = randomUUID();
  const emailDono = `${semAcento(cl.dona.split(' ').slice(1).join('.'))}@${cl.dominio}`;
  linhas.push(
    `INSERT INTO users (id, clinic_id, email, password_hash, name, role, patient_id, mfa_secret, mfa_enabled, mfa_recovery_codes, token_version, google_id, is_active, created_at) VALUES (` +
      `${s(donoId)}, ${s(clinicId)}, ${s(emailDono)}, ${s(hashSenha(SENHA))}, ${s(cl.dona)}, 'owner', ` +
      `NULL, NULL, 0, NULL, 0, NULL, 1, ${n(criadaEm)});`,
  );

  const secId = randomUUID();
  const emailSec = `${semAcento(cl.secretaria.split(' ')[0])}.recepcao@${cl.dominio}`;
  linhas.push(
    `INSERT INTO users (id, clinic_id, email, password_hash, name, role, patient_id, mfa_secret, mfa_enabled, mfa_recovery_codes, token_version, google_id, is_active, created_at) VALUES (` +
      `${s(secId)}, ${s(clinicId)}, ${s(emailSec)}, ${s(hashSenha(SENHA))}, ${s(cl.secretaria)}, 'secretary', ` +
      `NULL, NULL, 0, NULL, 0, NULL, 1, ${n(criadaEm + DIA)});`,
  );

  credenciais.push({ clinica: cl.nome, dono: cl.dona, email: emailDono });

  // 15 pacientes
  for (let i = 0; i < 15; i++) {
    const feminino = rnd() < 0.55;
    const primeiro = escolha(feminino ? NOMES_F : NOMES_M);
    const nomeCompleto = `${primeiro} ${escolha(SOBRENOMES)} ${escolha(SOBRENOMES)}`;
    const pacienteId = randomUUID();
    const [pc, pu, pd] = escolha(CIDADES);
    const idade = inteiro(18, 68);
    const nascimento = AGORA - idade * 365 * DIA - inteiro(0, 364) * DIA;
    const entrada = AGORA - inteiro(30, 400) * DIA;
    const queixa = escolha(QUEIXAS);
    const objetivo = escolha(OBJETIVOS);

    const perfil = {
      personal: {
        sex: feminino ? 'Feminino' : 'Masculino',
        gender: feminino ? 'Mulher cisgênero' : 'Homem cisgênero',
        maritalStatus: escolha(['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'União estável']),
        profession: escolha(PROFISSOES),
        education: escolha(['Ensino médio', 'Superior incompleto', 'Superior completo', 'Pós-graduação']),
        city: pc,
        state: pu,
      },
      clinical: {
        complaint: queixa,
        goals: objetivo,
        suffering: escolha(['Leve', 'Moderado', 'Intenso']),
        history: escolha([
          'Primeira experiência com terapia.',
          'Já fez terapia por cerca de dois anos na adolescência.',
          'Buscou ajuda por indicação médica.',
          'Retomou o acompanhamento após pausa de alguns anos.',
        ]),
        priorDiagnoses: escolha(['Nenhum', 'Nenhum', 'Transtorno de ansiedade generalizada', 'Episódio depressivo']),
        priorTreatments: escolha(['Nenhum', 'Nenhum', 'Terapia cognitivo-comportamental']),
        psychiatric: escolha(['Não', 'Não', 'Sim, em acompanhamento']),
      },
      health: {
        anxiety: rnd() < 0.6,
        depression: rnd() < 0.35,
        tag: rnd() < 0.2,
        tdah: rnd() < 0.15,
        bipolar: false,
        medications: escolha(['—', '—', 'Sertralina 50mg', 'Escitalopram 10mg', 'Fluoxetina 20mg']),
        diseases: escolha(['—', '—', 'Hipertensão', 'Hipotireoidismo']),
        familyHistory: escolha(['Sem histórico relevante', 'Mãe com depressão', 'Pai com transtorno de ansiedade']),
      },
      lifestyle: {
        sleep: escolha(['Sono reparador', 'Sono não reparador', 'Insônia inicial', 'Desperta durante a noite']),
        diet: escolha(['Equilibrada', 'Irregular', 'Restritiva']),
        sports: escolha(['Caminhada', 'Musculação', 'Yoga', 'Não pratica']),
        alcohol: escolha(['Não', 'Social', 'Frequente']),
        smoking: escolha(['Não', 'Não', 'Sim']),
        drugs: 'Não',
      },
      relationships: {
        family: escolha(['Boa', 'Regular', 'Distante']),
        friends: escolha(['Rede ampla', 'Poucos amigos próximos', 'Rede restrita']),
        work: escolha(['Boa', 'Tensa', 'Neutra']),
        romantic: escolha(['Solteiro(a)', 'Relacionamento estável', 'Relacionamento em crise']),
      },
      financial: {
        situation: escolha(['Estável', 'Instável', 'Confortável']),
        income: escolha(['Até 2 salários', '2 a 4 salários', '4 a 8 salários']),
        work: escolha(['CLT', 'Autônomo', 'Servidor público']),
      },
      personality: {
        introvert: rnd() < 0.5,
        extrovert: rnd() < 0.3,
        communicative: rnd() < 0.6,
        organized: rnd() < 0.5,
        creative: rnd() < 0.5,
        impulsive: rnd() < 0.3,
        notes: escolha(['Perfeccionista e autocrítico(a).', 'Reflexivo(a), com boa capacidade de insight.', 'Tende a evitar conflitos.']),
      },
    };

    linhas.push(
      `INSERT INTO patients (id, clinic_id, psychologist_id, full_name, social_name, cpf, email, phone, whatsapp, birth_date, status, photo, profile, deleted_at, created_at) VALUES (` +
        `${s(pacienteId)}, ${s(clinicId)}, ${s(donoId)}, ${s(nomeCompleto)}, NULL, ${s(cpfFicticio())}, ` +
        `${s(`${semAcento(primeiro)}.${i}@exemplo.com.br`)}, ${s(telefone(pd))}, ${s(telefone(pd))}, ` +
        `${n(nascimento)}, 'active', NULL, ${s(JSON.stringify(perfil))}, NULL, ${n(entrada)});`,
    );

    // Consultas: 3 a 8 por paciente, semanais a partir da entrada.
    const qtd = inteiro(3, 8);
    const idsSessao = [];
    for (let k = 0; k < qtd; k++) {
      const sessaoId = randomUUID();
      idsSessao.push(sessaoId);
      const quando = entrada + k * 7 * DIA + inteiro(0, 2) * DIA;
      if (quando > AGORA) break;
      linhas.push(
        `INSERT INTO sessions (id, clinic_id, patient_id, psychologist_id, occurred_at, duration_min, mood, emotional_scale, topics, objectives, techniques, evolution, next_steps, free_notes, created_at) VALUES (` +
          `${s(sessaoId)}, ${s(clinicId)}, ${s(pacienteId)}, ${s(donoId)}, ${n(quando)}, ${n(escolha([50, 50, 60]))}, ` +
          `${s(escolha(HUMORES))}, ${n(inteiro(3, 9))}, ${s(JSON.stringify(varios(TEMAS, inteiro(2, 4))))}, ` +
          `${s(objetivo)}, ${s(escolha(TECNICAS))}, ${s(escolha(EVOLUCOES))}, ${s(escolha(PROXIMOS))}, ` +
          `${rnd() < 0.4 ? s('Sessão produtiva. Manter plano terapêutico.') : 'NULL'}, ${n(quando)});`,
      );
    }

    // Linha do tempo: 2 a 4 marcos.
    for (const [titulo, desc, cat] of varios(MARCOS, inteiro(2, 4))) {
      linhas.push(
        `INSERT INTO timeline_events (id, clinic_id, patient_id, session_id, title, description, event_date, category, status, source, created_at) VALUES (` +
          `${s(randomUUID())}, ${s(clinicId)}, ${s(pacienteId)}, NULL, ${s(titulo)}, ${s(desc)}, ` +
          `${n(entrada - inteiro(30, 900) * DIA)}, ${s(cat)}, 'confirmed', 'manual', ${n(entrada)});`,
      );
    }
  }
}

writeFileSync('scripts/seed-clinicas.sql', linhas.join('\n') + '\n', 'utf8');

const inserts = linhas.filter((l) => l.startsWith('INSERT')).length;
console.log(`SQL gerado: scripts/seed-clinicas.sql (${inserts} inserts)`);
console.log('\nAcessos criados (senha: ' + SENHA + '):');
for (const c of credenciais) console.log(`  ${c.clinica.padEnd(26)} ${c.email}`);
