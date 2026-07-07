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
  // Link que abre a tela de redefinição já com e-mail e código preenchidos.
  const link = `${APP_URL}/?reset=1&email=${encodeURIComponent(to)}&code=${code}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color:#1a2960; margin:0 0 8px;">Redefinição de senha</h2>
      <p style="color:#444; font-size:14px; line-height:1.5;">
        Você solicitou a redefinição da sua senha no Vínculo. Clique no botão abaixo
        para criar uma nova senha — o código já vai preenchido:
      </p>
      <div style="text-align:center; margin:22px 0;">
        <a href="${link}" style="display:inline-block; background:#1a2960; color:#fff;
           text-decoration:none; font-size:15px; font-weight:bold; padding:14px 28px;
           border-radius:10px;">Criar nova senha</a>
      </div>
      <p style="color:#444; font-size:13px; line-height:1.5;">
        Ou use o código manualmente na tela de redefinição:
      </p>
      <div style="font-size:26px; font-weight:bold; letter-spacing:6px; color:#1a2960;
                  background:#f4f6fb; text-align:center; padding:14px; border-radius:10px; margin:10px 0;">
        ${code}
      </div>
      <p style="color:#888; font-size:12.5px; line-height:1.5;">
        Este link e código expiram em 15 minutos. Se você não solicitou, ignore este e-mail —
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
