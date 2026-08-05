import type { Env } from '../types';

// Remetente. IMPORTANTE: o domínio precisa estar verificado no Resend.
// Ajuste para o seu domínio verificado (ex: 'Vínculo <nao-responda@seu-dominio.com>').
const FROM = 'Vínculo <nao-responda@vinculoclinico.com.br>';
const APP_URL = 'https://vinculoclinico.com.br';
// Logo servido pelo próprio site — clientes de e-mail exigem URL absoluta.
const LOGO_URL = `${APP_URL}/logo-vinculo.png`;

export async function sendInviteEmail(env: Env, to: string, name: string, clinicName: string, token: string): Promise<void> {
  const link = `${APP_URL}/?invite=${token}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color:#1a2960; margin:0 0 8px;">Você foi convidado para o Vínculo</h2>
      <p style="color:#444; font-size:14px; line-height:1.5;">
        Olá, ${name}! Você foi convidado(a) para fazer parte da equipe da clínica
        <b>${clinicName}</b> no Vínculo. Clique no botão abaixo para criar sua senha
        e ativar sua conta:
      </p>
      <div style="text-align:center; margin:22px 0;">
        <a href="${link}" style="display:inline-block; background:#1a2960; color:#fff;
           text-decoration:none; font-size:15px; font-weight:bold; padding:14px 28px;
           border-radius:10px;">Ativar minha conta</a>
      </div>
      <p style="color:#888; font-size:12.5px; line-height:1.5;">
        Este convite expira em 7 dias. Se você não esperava este e-mail, pode ignorá-lo.
      </p>
    </div>
  `;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject: `Convite para a clínica ${clinicName} no Vínculo`, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`resend_failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

export async function sendPasswordResetEmail(env: Env, to: string, code: string): Promise<void> {
  // O link abre apenas a tela de redefinição com o e-mail pré-preenchido.
  // O código NÃO vai na URL para não vazar em logs, histórico ou header Referer.
  const link = `${APP_URL}/?reset=1&email=${encodeURIComponent(to)}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color:#1a2960; margin:0 0 8px;">Redefinição de senha</h2>
      <p style="color:#444; font-size:14px; line-height:1.5;">
        Você solicitou a redefinição da sua senha no Vínculo. Use o código abaixo
        na tela de redefinição para criar uma nova senha:
      </p>
      <div style="font-size:28px; font-weight:bold; letter-spacing:8px; color:#1a2960;
                  background:#f4f6fb; text-align:center; padding:16px; border-radius:10px; margin:20px 0;">
        ${code}
      </div>
      <div style="text-align:center; margin:18px 0;">
        <a href="${link}" style="display:inline-block; background:#1a2960; color:#fff;
           text-decoration:none; font-size:15px; font-weight:bold; padding:14px 28px;
           border-radius:10px;">Ir para a tela de redefinição</a>
      </div>
      <p style="color:#888; font-size:12.5px; line-height:1.5;">
        Este código expira em 15 minutos. Se você não solicitou, ignore este e-mail —
        sua senha continua a mesma.
      </p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: `Seu código de redefinição: ${code}`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`resend_failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

// E-mail enviado aos administradores quando um psicólogo-owner solicita
// upgrade/downgrade de plano. A mudança é aplicada manualmente no super admin.
export async function sendPlanRequestEmail(
  env: Env,
  data: {
    to: string[];
    clinicName: string;
    companyCode: string;
    currentPlan: string;
    requestedPlan: string;
    ownerName: string;
    ownerEmail: string;
    message: string;
  }
): Promise<void> {
  const planName: Record<string, string> = { essencial: 'Essencial', pro: 'Pro', plus: 'Plus' };
  const cur = planName[data.currentPlan] ?? data.currentPlan;
  const req = planName[data.requestedPlan] ?? data.requestedPlan;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h2 style="color:#1a2960; margin:0 0 8px;">Solicitação de mudança de plano</h2>
      <p style="color:#444; font-size:14px; line-height:1.5;">
        A clínica <b>${data.clinicName}</b> (código <b>${data.companyCode}</b>) solicitou uma
        mudança de plano no Vínculo.
      </p>
      <table style="width:100%; font-size:14px; color:#333; border-collapse:collapse; margin:14px 0;">
        <tr><td style="padding:6px 0; color:#888;">Plano atual</td><td style="padding:6px 0;"><b>${cur}</b></td></tr>
        <tr><td style="padding:6px 0; color:#888;">Plano solicitado</td><td style="padding:6px 0;"><b style="color:#f5821f;">${req}</b></td></tr>
        <tr><td style="padding:6px 0; color:#888;">Solicitante</td><td style="padding:6px 0;">${data.ownerName} &lt;${data.ownerEmail}&gt;</td></tr>
      </table>
      ${data.message ? `<p style="color:#444; font-size:14px; line-height:1.5;"><b>Mensagem:</b><br>${data.message}</p>` : ''}
      <p style="color:#888; font-size:12.5px; line-height:1.5;">
        Aplique a mudança no portal Super Admin, na clínica <b>${data.clinicName}</b>.
      </p>
    </div>
  `;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: data.to,
      subject: `Mudança de plano: ${data.clinicName} (${cur} → ${req})`,
      reply_to: data.ownerEmail,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`resend_failed: ${res.status} ${body.slice(0, 200)}`);
  }
}

// Lembrete de consulta enviado ao paciente no momento do agendamento.
export async function sendAppointmentReminderEmail(
  env: Env,
  opts: {
    to: string;
    patientName: string;
    clinicName: string;
    psychologistName: string;
    startsAt: number;
    durationMin: number;
    notes?: string;
  },
): Promise<void> {
  const d = new Date(opts.startsAt);
  const data = d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const hora = d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit',
  });

  // Tabelas em vez de flex/grid: é o que os clientes de e-mail renderizam bem.
  const html = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#eef1f7; margin:0; padding:28px 12px; font-family:Arial, Helvetica, sans-serif;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:520px; background:#ffffff; border-radius:14px; overflow:hidden;
                        box-shadow:0 2px 10px rgba(26,41,96,0.08);">

            <!-- Cabeçalho com a marca -->
            <tr>
              <td align="center" style="padding:26px 24px 18px; border-bottom:1px solid #e8ecf4;">
                <img src="${LOGO_URL}" alt="Vínculo Clínico" width="190"
                     style="display:block; width:190px; max-width:70%; height:auto; border:0;" />
              </td>
            </tr>

            <!-- Conteúdo -->
            <tr>
              <td style="padding:26px 28px 8px;">
                <h1 style="color:#1a2960; font-size:20px; margin:0 0 10px; font-weight:bold;">
                  Sua consulta está agendada
                </h1>
                <p style="color:#444; font-size:14.5px; line-height:1.6; margin:0;">
                  Olá, ${opts.patientName}! Confirmamos o seu atendimento com
                  <b>${opts.psychologistName}</b>.
                </p>
              </td>
            </tr>

            <!-- Bloco de data e hora -->
            <tr>
              <td style="padding:18px 28px 4px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                       style="background:#f4f6fb; border-left:4px solid #f5821f; border-radius:10px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0 0 6px; color:#1a2960; font-size:16px; font-weight:bold;
                                text-transform:capitalize;">${data}</p>
                      <p style="margin:0; color:#444; font-size:14.5px;">
                        às ${hora} · ${opts.durationMin} minutos
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            ${opts.notes ? `
            <tr>
              <td style="padding:14px 28px 0;">
                <p style="color:#444; font-size:14px; line-height:1.6; margin:0;">${opts.notes}</p>
              </td>
            </tr>` : ''}

            <!-- Rodapé -->
            <tr>
              <td style="padding:20px 28px 26px;">
                <p style="color:#888; font-size:12.5px; line-height:1.6; margin:0;">
                  Se precisar remarcar ou cancelar, entre em contato com a clínica
                  <b style="color:#666;">${opts.clinicName}</b>.<br />
                  Este é um e-mail automático — não responda.
                </p>
              </td>
            </tr>
          </table>

          <p style="color:#9aa3b8; font-size:11px; margin:14px 0 0; font-family:Arial, Helvetica, sans-serif;">
            Vínculo Clínico · Memória Clínica Inteligente
          </p>
        </td>
      </tr>
    </table>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [opts.to],
      subject: `Consulta agendada — ${data} às ${hora}`,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`resend_failed: ${res.status} ${body.slice(0, 200)}`);
  }
}
