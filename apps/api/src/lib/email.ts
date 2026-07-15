import type { Env } from '../types';

// Remetente. IMPORTANTE: o domínio precisa estar verificado no Resend.
// Ajuste para o seu domínio verificado (ex: 'Vínculo <nao-responda@seu-dominio.com>').
const FROM = 'Vínculo <nao-responda@vinculoclinico.com.br>';
const APP_URL = 'https://vinculoclinico.com.br';

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
