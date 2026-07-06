import type { Env } from '../types';

// Remetente. IMPORTANTE: o domínio precisa estar verificado no Resend.
// Ajuste para o seu domínio verificado (ex: 'Vínculo <nao-responda@seu-dominio.com>').
const FROM = 'Vínculo <nao-responda@vinculoclinico.com.br>';

export async function sendPasswordResetEmail(env: Env, to: string, code: string): Promise<void> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color:#1a2960; margin:0 0 8px;">Redefinição de senha</h2>
      <p style="color:#444; font-size:14px; line-height:1.5;">
        Você solicitou a redefinição da sua senha no Vínculo. Use o código abaixo:
      </p>
      <div style="font-size:30px; font-weight:bold; letter-spacing:8px; color:#1a2960;
                  background:#f4f6fb; text-align:center; padding:16px; border-radius:10px; margin:16px 0;">
        ${code}
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
